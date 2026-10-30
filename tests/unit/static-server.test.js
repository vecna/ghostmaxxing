import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import staticServer from '../../scripts-dev/static-server.cjs';

const { startStaticServer, parseArgs, parseRange, resolveInside, contentType } = staticServer;

/** Raw request, so paths such as /../ reach the server un-normalised. */
function request(baseUrl, rawPath, { method = 'GET', headers = {} } = {}) {
   const { hostname, port } = new URL(baseUrl);
   return new Promise((resolve, reject) => {
      const req = http.request({ hostname, port, path: rawPath, method, headers }, (res) => {
         const chunks = [];
         res.on('data', (chunk) => chunks.push(chunk));
         res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.end();
   });
}

let root;
let outside;
let server;

beforeAll(async () => {
   const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-static-'));
   root = path.join(base, 'site');
   outside = path.join(base, 'secret.txt');
   fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
   fs.mkdirSync(path.join(root, 'empty'));
   fs.writeFileSync(path.join(root, 'index.html'), '<h1>home</h1>');
   fs.writeFileSync(path.join(root, 'lab.html'), '<h1>lab</h1>');
   fs.writeFileSync(path.join(root, 'projects', 'index.html'), '<h1>projects</h1>');
   fs.writeFileSync(path.join(root, 'module.mjs'), 'export default 1;');
   fs.writeFileSync(path.join(root, 'clip.mp4'), Buffer.from('0123456789'));
   fs.writeFileSync(path.join(root, 'model.wasm'), Buffer.from([0, 97, 115, 109]));
   fs.writeFileSync(outside, 'do not serve');
   server = await startStaticServer({ root, port: 0 });
});

afterAll(async () => {
   await server.close();
   fs.rmSync(path.dirname(root), { recursive: true, force: true });
});

describe('static-server', () => {
   it('binds to loopback by default and serves files with their type, uncached', async () => {
      expect(server.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const res = await request(server.baseUrl, '/lab.html');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.toString()).toBe('<h1>lab</h1>');
      expect((await request(server.baseUrl, '/module.mjs')).headers['content-type']).toMatch(/^text\/javascript/);
      expect((await request(server.baseUrl, '/model.wasm')).headers['content-type']).toBe('application/wasm');
   });

   it('serves index.html for folders and redirects a folder without its slash', async () => {
      expect((await request(server.baseUrl, '/')).body.toString()).toBe('<h1>home</h1>');
      const redirect = await request(server.baseUrl, '/projects?x=1');
      expect(redirect.status).toBe(301);
      expect(redirect.headers.location).toBe('/projects/?x=1');
      expect((await request(server.baseUrl, '/projects/')).body.toString()).toBe('<h1>projects</h1>');
      expect((await request(server.baseUrl, '/empty/')).status).toBe(404);
   });

   it('falls back to .html for extensionless paths and answers 404 otherwise', async () => {
      expect((await request(server.baseUrl, '/lab')).body.toString()).toBe('<h1>lab</h1>');
      expect((await request(server.baseUrl, '/missing.js')).status).toBe(404);
   });

   it('never leaves the served folder', async () => {
      for (const raw of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/%00']) {
         const res = await request(server.baseUrl, raw);
         expect([403, 404]).toContain(res.status);
         expect(res.body.toString()).not.toContain('do not serve');
      }
      expect(resolveInside(root, '/../secret.txt')).toBe(path.join(root, 'secret.txt'));
      expect(resolveInside(root, '/%E0%A4%A')).toBeNull();
   });

   it('answers byte ranges so videos can seek', async () => {
      const partial = await request(server.baseUrl, '/clip.mp4', { headers: { Range: 'bytes=2-5' } });
      expect(partial.status).toBe(206);
      expect(partial.headers['content-range']).toBe('bytes 2-5/10');
      expect(partial.body.toString()).toBe('2345');
      const suffix = await request(server.baseUrl, '/clip.mp4', { headers: { Range: 'bytes=-3' } });
      expect(suffix.body.toString()).toBe('789');
      const beyond = await request(server.baseUrl, '/clip.mp4', { headers: { Range: 'bytes=20-' } });
      expect(beyond.status).toBe(416);
      expect(beyond.headers['content-range']).toBe('bytes */10');
      const ignored = await request(server.baseUrl, '/clip.mp4', { headers: { Range: 'bytes=0-1,4-5' } });
      expect(ignored.status).toBe(200);
      expect(ignored.body.length).toBe(10);
   });

   it('supports HEAD and refuses other methods', async () => {
      const head = await request(server.baseUrl, '/lab.html', { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(head.headers['content-length']).toBe('12');
      expect(head.body.length).toBe(0);
      const post = await request(server.baseUrl, '/lab.html', { method: 'POST' });
      expect(post.status).toBe(405);
      expect(post.headers.allow).toBe('GET, HEAD');
   });

   it('parses the command line like the npm scripts use it', () => {
      expect(parseArgs([])).toMatchObject({ action: 'serve', port: 8080, host: '127.0.0.1', open: null, silent: false });
      expect(parseArgs(['--port', '8080', '--open', '/lab.html'])).toMatchObject({ port: 8080, open: '/lab.html' });
      expect(parseArgs(['-p', '0', '-a', '0.0.0.0', '-s', '-o'])).toMatchObject({ port: 0, host: '0.0.0.0', silent: true, open: '/' });
      expect(parseArgs(['--open', 'lab.html']).open).toBe('/lab.html');
      expect(parseArgs([root]).root).toBe(root);
      expect(parseArgs(['--help'])).toEqual({ action: 'help' });
      expect(parseArgs(['-v'])).toEqual({ action: 'version' });
      expect(() => parseArgs(['--port'])).toThrow('needs a value');
      expect(() => parseArgs(['--port', '99999'])).toThrow('--port must be');
      expect(() => parseArgs(['--bogus'])).toThrow('Unknown option');
      expect(() => parseArgs([path.join(root, 'lab.html')])).toThrow('Not a folder');
   });

   it('parses Range headers and maps unknown extensions to bytes', () => {
      expect(parseRange(undefined, 10)).toBeNull();
      expect(parseRange('bytes=5-', 10)).toEqual({ start: 5, end: 9 });
      expect(parseRange('bytes=0-99', 10)).toEqual({ start: 0, end: 9 });
      expect(parseRange('bytes=-0', 10)).toBe('unsatisfiable');
      expect(parseRange('items=0-1', 10)).toBeNull();
      expect(contentType('weights.bin')).toBe('application/octet-stream');
   });
});
