#!/usr/bin/env node
/**
 * @file Zero-dependency static file server for the repository. It backs
 * `npm start`, `npm run serve`, the Playwright e2e web server and the
 * scripts-dev tools that drive pages in Chromium (lab-capture, video-loader,
 * capture-doc-screenshots). It replaces http-server and its ~40 transitive
 * packages with node:http.
 *
 * Behaviour: GET and HEAD only; never cached (Cache-Control: no-store); no
 * directory listings; `/dir` redirects to `/dir/` and serves its index.html;
 * an extensionless `/page` falls back to `/page.html`; single byte ranges, so
 * videos can seek; nothing outside the served root is reachable.
 *
 * @example node scripts-dev/static-server.cjs
 * @example node scripts-dev/static-server.cjs --port 8080 --open /lab.html
 * @example node scripts-dev/static-server.cjs --host 0.0.0.0   # reachable from the LAN (phones)
 * @version 1.0.0
 */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');

const MIME = {
   '.html': 'text/html; charset=utf-8',
   '.htm': 'text/html; charset=utf-8',
   '.js': 'text/javascript; charset=utf-8',
   '.mjs': 'text/javascript; charset=utf-8',
   '.cjs': 'text/javascript; charset=utf-8',
   '.css': 'text/css; charset=utf-8',
   '.json': 'application/json; charset=utf-8',
   '.map': 'application/json; charset=utf-8',
   '.webmanifest': 'application/manifest+json',
   '.txt': 'text/plain; charset=utf-8',
   '.md': 'text/markdown; charset=utf-8',
   '.xml': 'application/xml',
   '.pot': 'text/plain; charset=utf-8',
   '.po': 'text/plain; charset=utf-8',
   '.svg': 'image/svg+xml',
   '.png': 'image/png',
   '.jpg': 'image/jpeg',
   '.jpeg': 'image/jpeg',
   '.gif': 'image/gif',
   '.webp': 'image/webp',
   '.avif': 'image/avif',
   '.ico': 'image/x-icon',
   '.wasm': 'application/wasm',
   '.woff': 'font/woff',
   '.woff2': 'font/woff2',
   '.ttf': 'font/ttf',
   '.otf': 'font/otf',
   '.mp4': 'video/mp4',
   '.m4v': 'video/mp4',
   '.webm': 'video/webm',
   '.ogv': 'video/ogg',
   '.mov': 'video/quicktime',
   '.mp3': 'audio/mpeg',
   '.wav': 'audio/wav',
   '.pdf': 'application/pdf',
   '.zip': 'application/zip',
};

/** Content-Type for a file name; unknown extensions are served as bytes. */
function contentType(file) {
   return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/**
 * Map a URL path onto the served root.
 *
 * @param {string} root Absolute directory being served.
 * @param {string} pathname Raw (percent-encoded) URL path.
 * @returns {string|null} Absolute file path, or null when the path is
 *   malformed or would leave the root.
 */
function resolveInside(root, pathname) {
   let decoded;
   try {
      decoded = decodeURIComponent(pathname);
   } catch {
      return null;
   }
   if (decoded.includes('\0')) return null;
   const target = path.resolve(root, `.${path.posix.normalize(`/${decoded}`)}`);
   return target === root || target.startsWith(root + path.sep) ? target : null;
}

/**
 * Parse a Range header against a file size.
 *
 * @param {string|undefined} header Value of the Range request header.
 * @param {number} size File size in bytes.
 * @returns {{start: number, end: number}|'unsatisfiable'|null} The byte span,
 *   'unsatisfiable' (answer 416), or null to ignore the header and send the
 *   whole file (absent, malformed or multi-range, as RFC 9110 allows).
 */
function parseRange(header, size) {
   if (!header) return null;
   const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
   if (!match || (match[1] === '' && match[2] === '')) return null;
   let start;
   let end;
   if (match[1] === '') {
      const suffix = Number(match[2]);
      if (suffix === 0) return 'unsatisfiable';
      start = Math.max(0, size - suffix);
      end = size - 1;
   } else {
      start = Number(match[1]);
      end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
   }
   if (start >= size || start > end) return 'unsatisfiable';
   return { start, end };
}

/**
 * Request handler serving `root`.
 *
 * @param {string} root Absolute directory to serve.
 * @param {{log?: function(http.IncomingMessage, number): void}} [options]
 * @returns {function(http.IncomingMessage, http.ServerResponse): void}
 */
function createHandler(root, { log } = {}) {
   const base = path.resolve(root);

   return (req, res) => {
      const finish = (status, headers = {}, body = '') => {
         res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
         res.end(req.method === 'HEAD' ? undefined : body);
         if (log) log(req, status);
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
         finish(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }, 'Method Not Allowed\n');
         return;
      }
      let url;
      try {
         url = new URL(req.url, 'http://localhost');
      } catch {
         finish(400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad Request\n');
         return;
      }
      const target = resolveInside(base, url.pathname);
      if (!target) {
         finish(403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden\n');
         return;
      }
      const notFound = () => finish(404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found\n');

      const sendFile = (file, stat) => {
         const headers = {
            'Content-Type': contentType(file),
            'Accept-Ranges': 'bytes',
            'Last-Modified': stat.mtime.toUTCString(),
         };
         const range = parseRange(req.headers.range, stat.size);
         if (range === 'unsatisfiable') {
            finish(416, { ...headers, 'Content-Range': `bytes */${stat.size}` });
            return;
         }
         const span = range || { start: 0, end: stat.size - 1 };
         const status = range ? 206 : 200;
         if (range) headers['Content-Range'] = `bytes ${span.start}-${span.end}/${stat.size}`;
         headers['Content-Length'] = stat.size === 0 ? 0 : span.end - span.start + 1;
         res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
         if (log) log(req, status);
         if (req.method === 'HEAD' || stat.size === 0) {
            res.end();
            return;
         }
         const stream = fs.createReadStream(file, { start: span.start, end: span.end });
         stream.on('error', () => res.destroy());
         res.on('close', () => stream.destroy());
         stream.pipe(res);
      };

      const tryFile = (file, onMissing) => {
         fs.stat(file, (error, stat) => {
            if (!error && stat.isFile()) sendFile(file, stat);
            else onMissing(error, stat);
         });
      };

      tryFile(target, (error, stat) => {
         if (!error && stat.isDirectory()) {
            if (!url.pathname.endsWith('/')) {
               finish(301, { Location: `${url.pathname}/${url.search}` });
               return;
            }
            tryFile(path.join(target, 'index.html'), notFound);
            return;
         }
         if (path.extname(target) === '' && target !== base) {
            tryFile(`${target}.html`, notFound);
            return;
         }
         notFound();
      });
   };
}

/**
 * Start serving a directory.
 *
 * @param {object} [options]
 * @param {string} [options.root] Directory to serve; defaults to the repository root.
 * @param {string} [options.host] Interface to bind; defaults to 127.0.0.1 (this machine only).
 * @param {number} [options.port] TCP port; 0 picks a free one.
 * @param {function(http.IncomingMessage, number): void} [options.log] Called once per answered request.
 * @returns {Promise<{server: http.Server, baseUrl: string, close: function(): Promise<void>}>}
 */
async function startStaticServer({ root = ROOT, host = '127.0.0.1', port = 0, log } = {}) {
   const server = http.createServer(createHandler(root, { log }));
   await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
         server.off('error', reject);
         resolve();
      });
   });
   const address = server.address();
   const shownHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
   const urlHost = shownHost.includes(':') ? `[${shownHost}]` : shownHost;
   return {
      server,
      baseUrl: `http://${urlHost}:${address.port}`,
      close: () => new Promise((resolve) => {
         server.close(() => resolve());
         server.closeAllConnections();
      }),
   };
}

const HELP = `static-server ${VERSION}

Serve a folder (default: the repository root) over HTTP, without caching.

Usage:
  node scripts-dev/static-server.cjs [folder] [options]

Options:
  -p, --port <n>      TCP port. Default: 8080
  -a, --host <addr>   Interface to bind. Default: 127.0.0.1 (this machine only);
                      use 0.0.0.0 to test from a phone on the same network.
  -o, --open [path]   Open the default browser on this path once listening.
                      Default path: /
  -s, --silent        Do not log requests.
  -v, --version       Print the version and exit.
  -h, --help          Print this help and exit.`;

/** Open a URL with the platform's default browser; failures only print a hint. */
function openBrowser(url) {
   const [command, args] = process.platform === 'darwin' ? ['open', [url]]
      : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
         : ['xdg-open', [url]];
   try {
      const child = spawn(command, args, { stdio: 'ignore', detached: true });
      child.on('error', () => console.log(`Open ${url} in your browser.`));
      child.unref();
   } catch {
      console.log(`Open ${url} in your browser.`);
   }
}

/**
 * Parse the command line.
 *
 * @param {string[]} argv Arguments after the script name.
 * @returns {{action: 'help'|'version'}|{action: 'serve', root: string, port: number, host: string, open: string|null, silent: boolean}}
 */
function parseArgs(argv) {
   const options = { action: 'serve', root: ROOT, port: 8080, host: '127.0.0.1', open: null, silent: false };
   for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      const value = () => {
         const next = argv[++i];
         if (next === undefined || next.startsWith('-')) throw new Error(`${arg} needs a value`);
         return next;
      };
      if (arg === '-h' || arg === '--help') return { action: 'help' };
      if (arg === '-v' || arg === '--version') return { action: 'version' };
      if (arg === '-p' || arg === '--port') options.port = Number(value());
      else if (arg === '-a' || arg === '--host') options.host = value();
      else if (arg === '-o' || arg === '--open') {
         const next = argv[i + 1];
         options.open = next && !next.startsWith('-') ? argv[++i] : '/';
         if (!options.open.startsWith('/')) options.open = `/${options.open}`;
      } else if (arg === '-s' || arg === '--silent') options.silent = true;
      else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg} (see --help)`);
      else options.root = path.resolve(arg);
   }
   if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
      throw new Error('--port must be a whole number between 0 and 65535');
   }
   if (!fs.statSync(options.root, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Not a folder: ${options.root}`);
   return options;
}

async function main(argv) {
   const options = parseArgs(argv);
   if (options.action === 'help') { console.log(HELP); return; }
   if (options.action === 'version') { console.log(VERSION); return; }
   const { root, port, host, open, silent } = options;

   const log = silent ? undefined : (req, status) => console.log(`${status} ${req.method} ${req.url}`);
   const { baseUrl, close } = await startStaticServer({ root, host, port, log });
   console.log(`Serving ${root} at ${baseUrl}/ (Ctrl+C to stop)`);
   if (host === '0.0.0.0' || host === '::') console.log('Listening on every network interface.');
   if (open !== null) openBrowser(`${baseUrl}${open}`);

   const stop = () => close().then(() => process.exit(0));
   process.once('SIGINT', stop);
   process.once('SIGTERM', stop);
}

if (require.main === module) {
   main(process.argv.slice(2)).catch((error) => {
      console.error(error.code === 'EADDRINUSE' ? `Port already in use: ${error.port}. Pick another with --port.` : error.message);
      process.exitCode = 1;
   });
}

module.exports = { startStaticServer, createHandler, parseArgs, parseRange, resolveInside, contentType, VERSION };
