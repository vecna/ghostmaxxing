#!/usr/bin/env node
/**
 * Drive lab.html with a fake webcam: draw the lab's layers on a picture,
 * measure the recognition distance between two pictures, or capture the
 * workshop screenshots.
 *
 * Chromium can replace the camera with a Y4M file
 * (--use-fake-device-for-media-stream + --use-file-for-fake-video-capture).
 * Any JPEG, PNG or video you pass is turned into that Y4M with ffmpeg, the lab
 * is opened against it, and the script then reads the page the way a
 * participant does: the overlay canvases, `#gm-num`, `#gm-thr`, `#gm-state`.
 *
 * Subcommands:
 *   render    One picture in, one picture out. Turns on the requested layers
 *             (box, landmarks, mesh) and/or a Ghostyle, crops to the face and
 *             writes the file named by --output.
 *   measure   Two pictures in. Saves the identity from --baseline, then reads
 *             the distance the lab reports for --dazzled against it. Prints
 *             the readings; --output-visual-log writes a composite picture.
 *   shots     The workshop screenshots (saved identity, landmark view, upload
 *             consent) from a clean and a painted picture of the same face.
 *
 * Usage:
 *   node scripts-dev/lab-capture.cjs render  --baseline face.jpg --layers landmarks --output face-landmarks.jpg
 *   node scripts-dev/lab-capture.cjs render  --baseline face.jpg --ghostyle cv-dazzle-1 --output face-dazzle.jpg
 *   node scripts-dev/lab-capture.cjs measure --baseline face.jpg --dazzled face-dazzle.jpg --output-visual-log test.jpg
 *   node scripts-dev/lab-capture.cjs shots   --baseline clean.jpg --dazzled painted.jpg
 *
 * History:
 *   0.8    2026-09-07  measure/shots/probe over the figureN Y4M fixtures.
 *   0.9    2026-09-15  render added for the homepage story cards.
 *   0.9.1  2026-09-18  Explicit file inputs (--baseline, --dazzled) replace
 *                      --figure; render is one picture in, one out; measure
 *                      compares two files through two sessions and a carried
 *                      database; probe folded into --debug; timestamped
 *                      progress; DOM clicks, direct style injection and CDP
 *                      screenshots instead of Playwright waits; --version.
 *   0.9.3  2026-10-06  render un-mirrors the lab (--mirror keeps the selfie
 *                      view) and takes --label-scale for larger overlay text.
 *   0.9.2  2026-09-20  --feed: the fake webcam frame size is an option. render
 *                      defaults to "fit" (a 4:3 frame as tall as the source),
 *                      because at 640x480 every overlay the lab draws was
 *                      rasterised at 480 lines and upscaled, which made the
 *                      labels unreadable. measure and shots keep 640x480.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const httpServer = require('http-server');
const { chromium } = require('@playwright/test');

const VERSION = '0.9.3';

/**
 * render's browser window. 4:3, like the fake webcam frame, so the feed fills
 * it edge to edge (the lab's video is object-fit: cover).
 */
const RENDER_VIEWPORT = { width: 1280, height: 960 };

/** render captures at this device scale factor; --label-scale multiplies it. */
const RENDER_CAPTURE_SCALE = 2;

/**
 * Upper bound for --label-scale. The viewport is divided by it, and under 700
 * CSS px wide the lab switches to its phone layout (styles/lab.css), which is a
 * different picture altogether. 1280 / 1.8 = 711.
 */
const LABEL_SCALE_MAX = 1.8;
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_RENDER_DIR = path.join(ROOT, 'scratch');
const DEFAULT_SHOT_OUTPUT = path.join(ROOT, 'images', 'workshops');
const COMMANDS = ['render', 'measure', 'shots'];

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv'];

/** `--layers` names to the lab's own overlay modes (bbox-overlay.js). */
const LAYER_OVERLAY = {
   none: null,
   box: 'bbox',        // the face box plus its metric labels
   landmarks: '2d',    // the box AND the face-api 68-point scaffold: "recognised"
   mesh: 'mesh',       // MediaPipe mesh dots
};
const LAYER_NAMES = Object.keys(LAYER_OVERLAY);

/** localStorage keys the lab reads on boot. The two DB keys are what `measure`
 *  carries from the baseline session to the dazzled one (db.js). */
const STORAGE = {
   db: 'local-face-lab-db-v1',
   db3d: 'local-face-lab-db-3d-v1',
   locale: 'ghostmaxxing-locale',
};

/** Lab chrome that must not appear inside a crop. */
const LAB_CHROME = [
   '.viewbar', '.rail', '.rec-dot', '.bottombar', '.scrim-top', '.scrim-bottom',
   '.status-pill', '#placeholder', '.screen', '#gm-pluginbar', '.locale-control',
   '.gm-tool-back',
];

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const T0 = Date.now();
/** One timestamped line per phase on stderr, so a four-minute run never looks stuck. */
function progress(message) {
   const seconds = ((Date.now() - T0) / 1000).toFixed(1).padStart(6);
   process.stderr.write(`[${seconds}s] ${message}\n`);
}
function out(line = '') { process.stdout.write(`${line}\n`); }

/** Print a repository-relative path, or an absolute one when it lies outside. */
function displayPath(file) {
   const relative = path.relative(ROOT, file);
   return relative.startsWith('..') ? file : relative;
}

function usage() {
   return `
lab-capture ${VERSION}

Drive lab.html with a fake webcam. Draw its layers on a picture, measure the
distance between two pictures, or capture the workshop screenshots.

Usage:
  node scripts-dev/lab-capture.cjs render  --baseline <file> [--layers <list>] [--ghostyle <id>] [--output <file>]
  node scripts-dev/lab-capture.cjs measure --baseline <file> --dazzled <file> [--output-visual-log <file>]
  node scripts-dev/lab-capture.cjs shots   --baseline <file> --dazzled <file> [--output <folder>]

Inputs (--baseline, --dazzled):
  A JPEG or PNG with one frontal face, a video (mp4, webm, mov...), or a
  ready-made .y4m. Stills and videos are converted with ffmpeg into the
  640x480 Y4M feed Chromium accepts as a webcam; a still is looped.

render options:
  --layers <list>        Comma-separated, from none, box, landmarks, mesh
                         (default: none). "landmarks" is the box plus the
                         face-api 68-point scaffold, the "recognised" look.
  --ghostyle <id>        Paint this Ghostyle (an id from ghostyles.json)
  --output <file>        Output picture; .png or .jpg decides the format
                         (default: scratch/<input>-<layers>[-<ghostyle>].jpg)
  --save-identity        Save the face as an identity first, so the box label
                         reads "Recognised" instead of the detection label.
                         Slower; off by default.
  --crop face|frame      face: crop around the detected face (default)
                         frame: the whole 640x480 feed as the lab shows it
  --pad <n>              Crop padding as a fraction of the face box (0.6)
  --aspect <w:h>         Crop aspect (4:5)
  --width <px>           Output width (1024)
  --quality <n>          JPEG quality 1-100 (82)
  --mirror               Keep the lab's selfie mirror. By default render flips
                         the lab back so the picture matches the photograph:
                         the lab mirrors a front camera, and a photograph is
                         not a selfie.
  --label-scale <n>      Draw the lab's labels, box and landmark strokes this
                         many times larger relative to the face (1 to 1.8,
                         default 1). The lab sizes them in screen pixels, so
                         the browser window is made smaller by this factor and
                         the capture resolution raised to match; the face and
                         the output size do not change.

measure options:
  --dazzled <file>       The picture to measure against the baseline identity
                         (--dazzledfile is accepted as an alias)
  --samples <n>          Readings taken on the dazzled picture (default: 4)
  --interval <sec>       Seconds between readings (default: 1.2)
  --output-visual-log <file>
                         Composite picture: baseline, dazzled, readings, verdict
  --json <file>          Also write every reading as JSON

shots options:
  --output <folder>      Destination (default: images/workshops)
  --prefix <name>        File name prefix (default: ws-lab)
  --format <ext>         jpg or png (default: jpg)
  --quality <n>          JPEG quality 1-100 (default: 82)
  --record <sec>         Seconds of clip to record (default: 7)

Common options:
  --feed <size>          Resolution of the fake webcam frame the picture is
                         fitted into, landscape. WxH such as 1440x1080, or
                         sd (640x480), hd (1920x1080), fit (a 4:3 frame as
                         tall as the source, up to 1080).
                         Default: fit for render, sd for measure and shots.
                         Everything the lab draws is rasterised at this size
                         and scaled up to the screen, so sd is a real webcam
                         and looks like one; fit or hd for a picture to read.
  --seconds <n>          Length of the fake webcam clip (default: 8; a video
                         longer than this is cut)
  --settle <sec>         Seconds to wait after the first detection (default: 2)
  --locale <code>        Lab language (default: en)
  --base-url <url>       Use an already-running server instead of starting one
  --lab <path>           Lab page path (default: /lab.html)
  --headed               Show the browser
  --keep-open <sec>      Leave the browser open after each run, for debugging
  --debug                Print the page state and the browser console after
                         each session (what "probe" used to do)
  --version              Print the script version and exit
  --help                 Show this help

Notes:
  render draws what the lab draws: nothing is painted on afterwards. It saves
  no identity and prints no distance unless --save-identity is passed; the
  distance is measure's job.

  measure runs two browser sessions. The first loads --baseline and saves the
  identity; the second loads --dazzled with that identity already in the lab's
  storage and reads the distance the lab reports. "No face in frame" on the
  dazzled picture means the detector lost the face altogether, which is the
  strongest possible result, not a missing reading.

  A picture that render wrote is a 4:5 crop, so measuring it against the
  original photograph also measures the crop. For a fair pair, compare it
  with a render of the same photograph made with --layers none.
`;
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function requireValue(argv, index, option) {
   const value = argv[index + 1];
   if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a value.`);
   return value;
}

function parseNumber(option, raw, { min = 0, integer = false } = {}) {
   const value = Number(raw);
   if (!Number.isFinite(value) || value < min) throw new Error(`${option} must be a number${min > 0 ? ` of at least ${min}` : ''}.`);
   return integer ? Math.round(value) : value;
}

function parseArgs(argv) {
   const options = {
      command: null,
      baseline: null,
      dazzled: null,
      output: null,
      visualLog: null,
      json: null,
      layers: ['none'],
      ghostyle: null,
      saveIdentity: false,
      crop: 'face',
      pad: 0.6,
      aspect: [4, 5],
      width: 1024,
      quality: 82,
      format: 'jpg',
      prefix: 'ws-lab',
      record: 7,
      samples: 4,
      interval: 1.2,
      feed: null,
      seconds: 8,
      settle: 2,
      locale: 'en',
      baseUrl: null,
      lab: '/lab.html',
      headed: false,
      keepOpen: 0,
      debug: false,
      mirror: false,
      labelScale: 1,
   };

   const file = (raw) => path.resolve(process.cwd(), raw);

   for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index];
      if (arg === '--help' || arg === '-h') { process.stdout.write(usage()); process.exit(0); }
      if (arg === '--version' || arg === '-V') { process.stdout.write(`lab-capture ${VERSION}\n`); process.exit(0); }
      if (!arg.startsWith('--') && !options.command) {
         if (!COMMANDS.includes(arg)) throw new Error(`Unknown subcommand: ${arg}. Expected ${COMMANDS.join(', ')}.`);
         options.command = arg;
         continue;
      }
      if (arg === '--headed') { options.headed = true; continue; }
      if (arg === '--debug') { options.debug = true; continue; }
      if (arg === '--save-identity') { options.saveIdentity = true; continue; }
      if (arg === '--mirror') { options.mirror = true; continue; }

      const value = requireValue(argv, index, arg);
      index += 1;
      switch (arg) {
         case '--baseline': options.baseline = file(value); break;
         case '--dazzled':
         case '--dazzledfile': options.dazzled = file(value); break;
         case '--output': options.output = file(value); break;
         case '--output-visual-log': options.visualLog = file(value); break;
         case '--json': options.json = file(value); break;
         case '--ghostyle': options.ghostyle = value; break;
         case '--prefix': options.prefix = value; break;
         case '--locale': options.locale = value; break;
         case '--base-url': options.baseUrl = value.replace(/\/$/, ''); break;
         case '--lab': options.lab = value.startsWith('/') ? value : `/${value}`; break;
         case '--layers': {
            const layers = value.split(',').map((item) => item.trim()).filter(Boolean);
            const unknown = layers.filter((item) => !LAYER_NAMES.includes(item));
            if (unknown.length) throw new Error(`--layers: unknown layer(s) ${unknown.join(', ')}. Expected ${LAYER_NAMES.join(', ')}. A Ghostyle is chosen with --ghostyle <id>.`);
            options.layers = layers.length ? layers : ['none'];
            break;
         }
         case '--crop':
            if (!['face', 'frame'].includes(value)) throw new Error('--crop must be face or frame.');
            options.crop = value;
            break;
         case '--aspect': {
            const parts = value.split(':').map(Number);
            if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part) || part <= 0)) throw new Error('--aspect must look like 4:5.');
            options.aspect = parts;
            break;
         }
         case '--format': {
            const format = value.toLowerCase();
            if (!['jpg', 'jpeg', 'png'].includes(format)) throw new Error('--format must be jpg or png.');
            options.format = format === 'jpeg' ? 'jpg' : format;
            break;
         }
         case '--pad': options.pad = parseNumber(arg, value); break;
         case '--label-scale': {
            const scale = parseNumber(arg, value, { min: 1 });
            if (scale > LABEL_SCALE_MAX) throw new Error(`--label-scale must be between 1 and ${LABEL_SCALE_MAX}: above that the lab switches to its phone layout.`);
            options.labelScale = scale;
            break;
         }
         case '--width': options.width = Math.max(64, parseNumber(arg, value, { integer: true })); break;
         case '--quality': options.quality = Math.min(100, Math.max(1, parseNumber(arg, value, { integer: true }))); break;
         case '--record': options.record = parseNumber(arg, value); break;
         case '--samples': options.samples = Math.max(1, parseNumber(arg, value, { integer: true })); break;
         case '--interval': options.interval = parseNumber(arg, value); break;
         case '--seconds': options.seconds = Math.max(2, parseNumber(arg, value)); break;
         case '--feed': options.feed = parseFeed(value); break;
         case '--settle': options.settle = parseNumber(arg, value); break;
         case '--keep-open': options.keepOpen = parseNumber(arg, value); break;
         default: throw new Error(`Unknown option: ${arg}`);
      }
   }

   if (!options.command) throw new Error(`A subcommand is required: ${COMMANDS.join(', ')}.\n${usage()}`);
   if (!options.baseline) throw new Error('--baseline <file> is required: a JPEG, PNG, video or .y4m with one frontal face.');
   if (options.command !== 'render' && !options.dazzled) throw new Error(`--dazzled <file> is required for ${options.command}.`);
   for (const input of [options.baseline, options.dazzled].filter(Boolean)) {
      if (!fs.existsSync(input)) throw new Error(`No such file: ${displayPath(input)}`);
   }

   if (options.command === 'render') {
      if (!options.output) {
         const stem = path.basename(options.baseline).replace(/\.[^.]+$/, '');
         const tag = [options.layers.join('+'), options.ghostyle].filter(Boolean).join('-');
         options.output = path.join(DEFAULT_RENDER_DIR, `${stem}-${tag}.jpg`);
      }
      options.format = /\.png$/i.test(options.output) ? 'png' : 'jpg';
   }
   if (options.command === 'shots' && !options.output) options.output = DEFAULT_SHOT_OUTPUT;
   if (!options.feed) options.feed = options.command === 'render' ? FEEDS.fit : FEEDS.sd;
   return options;
}

/** Named fake-webcam frame sizes. `fit` is resolved per source in toY4m. */
const FEEDS = {
   sd: { width: 640, height: 480, label: 'sd' },
   hd: { width: 1920, height: 1080, label: 'hd' },
   fit: { fit: true, label: 'fit' },
};

function parseFeed(raw) {
   const value = raw.toLowerCase();
   if (FEEDS[value]) return FEEDS[value];
   const match = /^(\d{2,4})x(\d{2,4})$/.exec(value);
   if (!match) throw new Error('--feed must be WxH (for example 1440x1080), sd, hd or fit.');
   const width = Number(match[1]);
   const height = Number(match[2]);
   if (height > width) throw new Error('--feed must be landscape: the lab lays the video out as a landscape frame and a portrait feed distorts the geometry. Portrait pictures are fitted into the frame with bars.');
   return { width: width - (width % 2), height: height - (height % 2), label: `${width}x${height}` };
}

// ---------------------------------------------------------------------------
// Sources: anything to Y4M
// ---------------------------------------------------------------------------

function ffmpegAvailable() {
   const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
   return !probe.error && probe.status === 0;
}

/** Width and height of a picture or video, through ffprobe. */
function probeSize(source) {
   const result = spawnSync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', source,
   ], { encoding: 'utf8' });
   const match = /^(\d+)x(\d+)/.exec(String(result.stdout || '').trim());
   if (result.status !== 0 || !match) return null;
   return { width: Number(match[1]), height: Number(match[2]) };
}

/**
 * The frame a source is fitted into. `fit` picks a 4:3 landscape frame as
 * tall as the source (capped at 1080 and rounded to even numbers), so a
 * portrait photograph keeps its full height and the lab rasterises its
 * overlays at that resolution instead of at 480 lines.
 */
function resolveFeed(feed, source) {
   if (!feed.fit) return feed;
   const size = probeSize(source);
   if (!size) {
      progress(`${displayPath(source)}: size unknown, using a 1440x1080 feed`);
      return { width: 1440, height: 1080 };
   }
   let height = Math.min(1080, size.height);
   let width = Math.max(Math.round(height * 4 / 3), size.width <= 1920 ? size.width : 1920);
   if (width > 1920) { width = 1920; height = Math.min(height, 1440); }
   width -= width % 2;
   height -= height % 2;
   if (height > width) height = width; // never portrait
   return { width, height };
}

/**
 * Turn a still or a video into the Y4M the fake webcam wants.
 *
 * The source is fitted to the --feed frame and padded rather than stretched,
 * because face-api's landmark positions are only meaningful if the face keeps
 * its aspect ratio. A 4:3 source fills the frame; anything else is centred on
 * a neutral grey. A .y4m is used as it is, at its own size. Chromium loops
 * the file.
 */
function toY4m(source, workDir, label, options) {
   const extension = path.extname(source).toLowerCase();
   if (extension === '.y4m') return source;
   if (!ffmpegAvailable()) {
      throw new Error('ffmpeg is not on PATH. It is needed to turn a picture or video into a fake webcam feed (or pass a .y4m).');
   }
   const isVideo = VIDEO_EXTENSIONS.includes(extension);
   if (!isVideo && !IMAGE_EXTENSIONS.includes(extension)) {
      progress(`${label}: unknown extension "${extension}", handing it to ffmpeg as a picture`);
   }
   const target = path.join(workDir, `${label}.y4m`);
   const feed = resolveFeed(options.feed, source);
   const { width, height } = feed;
   const filters = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x9a938c,format=yuv420p`;
   const args = ['-y', '-loglevel', 'error'];
   if (isVideo) args.push('-i', source, '-t', String(options.seconds), '-r', '15', '-an');
   else args.push('-loop', '1', '-i', source, '-t', String(options.seconds), '-r', '15');
   args.push('-vf', filters, '-pix_fmt', 'yuv420p', target);
   progress(`${label}: ${displayPath(source)} -> ${isVideo ? 'video' : 'still'} as a ${width}x${height} Y4M feed (${options.seconds}s)`);
   const result = spawnSync('ffmpeg', args, { encoding: 'utf8' });
   if (result.status !== 0) {
      throw new Error(`ffmpeg could not read ${displayPath(source)}: ${String(result.stderr || '').trim()}`);
   }
   return target;
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

function findSystemChrome() {
   if (process.platform !== 'linux') return undefined;
   return [
      '/opt/pw-browsers/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
   ].find((candidate) => fs.existsSync(candidate));
}

async function startLocalServer() {
   const server = httpServer.createServer({ root: ROOT, cache: -1, cors: false });
   await new Promise((resolve, reject) => {
      server.server.once('error', reject);
      server.server.listen(0, '127.0.0.1', resolve);
   });
   const address = server.server.address();
   return {
      baseUrl: `http://127.0.0.1:${address.port}`,
      close: () => new Promise((resolve) => server.server.close(resolve)),
   };
}

async function launch(y4mFile, options) {
   try {
      return await chromium.launch({
         headless: !options.headed,
         executablePath: findSystemChrome(),
         args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-video-capture=${y4mFile}`,
            '--autoplay-policy=no-user-gesture-required',
            '--use-angle=swiftshader',
            '--use-gl=angle',
            '--enable-unsafe-swiftshader',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--no-sandbox',
         ],
      });
   } catch (error) {
      const message = String(error && error.message || error);
      if (/executable|install/i.test(message)) {
         throw new Error(`Chromium could not be started. Install Playwright's browser once with:\n  npm run prepare:e2e\n\n${message.split('\n')[0]}`);
      }
      throw error;
   }
}

/**
 * Open the lab against a Y4M feed and wait for the first detection.
 *
 * `seed` is written into localStorage before the page loads: the lab reads
 * its face database, overlay mode and locale from there on boot, and that is
 * the only way in from outside for the database (db.js has no global).
 */
async function openLab(y4mFile, options, baseUrl, { viewport, seed = {} } = {}) {
   const browser = await launch(y4mFile, options);
   const context = await browser.newContext({
      viewport: viewport || RENDER_VIEWPORT,
      permissions: ['camera'],
      deviceScaleFactor: 2,
      locale: options.locale,
   });
   const storage = { [STORAGE.locale]: options.locale, ...seed };
   await context.addInitScript((entries) => {
      for (const [key, value] of Object.entries(entries)) {
         if (value === null || value === undefined) continue;
         try { window.localStorage.setItem(key, value); } catch (error) { /* private mode */ }
      }
   }, storage);

   const page = await context.newPage();
   const logs = [];
   page.on('console', (message) => logs.push(`[${message.type()}] ${message.text()}`.slice(0, 240)));
   page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`.slice(0, 240)));
   progress(`opening ${baseUrl}${options.lab}`);
   await page.goto(`${baseUrl}${options.lab}`, { waitUntil: 'load' });
   const detected = await waitFor(
      page,
      () => Boolean(window.gstmxx && window.gstmxx.getLastResult && window.gstmxx.getLastResult()),
      60000,
   );
   progress(detected ? 'face detected' : 'no detection within 60s');
   if (detected) await page.waitForTimeout(options.settle * 1000);

   const session = { browser, page, logs, detected };
   session.close = async () => {
      if (options.debug) await printDebug(session, options);
      if (options.keepOpen) await page.waitForTimeout(options.keepOpen * 1000);
      await browser.close();
   };
   return session;
}

/** What `probe` used to print: video track, lab API, readout, console tail. */
async function printDebug(session, options) {
   const { page, logs } = session;
   const state = await withTimeout(page.evaluate(() => {
      const video = document.getElementById('video');
      return {
         video: video ? { width: video.videoWidth, height: video.videoHeight, paused: video.paused, hasStream: Boolean(video.srcObject) } : null,
         gstmxx: typeof window.gstmxx,
         activeEffect: window.gstmxx && window.gstmxx.getActiveEffect ? window.gstmxx.getActiveEffect() : null,
         dbFaces: window.gstmxx && window.gstmxx.getDb ? (window.gstmxx.getDb().faces || []).length : null,
         bodyClass: document.body.className,
         view: (document.querySelector('.viewer') || {}).dataset ? document.querySelector('.viewer').dataset.view : null,
      };
   }), 10000).catch((error) => ({ error: String(error.message) }));
   out('--- debug -----------------------------------------------------------');
   out(JSON.stringify({ detected: session.detected, state, readout: await readout(page) }, null, 2));
   out(`console (last ${Math.min(20, logs.length)} of ${logs.length}):`);
   for (const line of logs.slice(-20)) out(`  ${line}`);
   out('---------------------------------------------------------------------');
}

/**
 * Wait for a condition inside the page, polling from Node.
 *
 * The lab runs face-api and MediaPipe on the render loop. Under a headless
 * browser that starves requestAnimationFrame and disturbs Playwright's own
 * in-page pollers, so `waitForSelector` and `waitForFunction` time out on
 * elements that plainly exist. Asking the page one question at a time, from
 * outside, is slower and reliable.
 */
async function waitFor(page, predicate, timeoutMs, argument, pollMs = 400) {
   const deadline = Date.now() + timeoutMs;
   for (;;) {
      try {
         if (await withTimeout(page.evaluate(predicate, argument), 5000)) return true;
      } catch (error) {
         // A frame busy with inference can leave an evaluate unanswered. That
         // is normal here: keep polling until the deadline.
      }
      if (Date.now() >= deadline) return false;
      await page.waitForTimeout(pollMs);
   }
}

/** Reject after `ms` if a page call has not answered: page.evaluate has no timeout of its own. */
function withTimeout(promise, ms) {
   let timer = null;
   const guard = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`page call did not answer within ${ms}ms`)), ms);
   });
   promise.catch(() => {});
   return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/**
 * Click an element through the DOM.
 *
 * Playwright's own click runs an actionability check that stalls for its full
 * timeout on this page (see waitFor), and every control here is a plain
 * button with a click listener, so the DOM click is the primary path rather
 * than the fallback. Playwright's click is tried last, once, for the record.
 */
async function clickAction(page, selector, label) {
   // A busy frame can leave the presence check unanswered. That is not proof
   // the element is missing, so the click is attempted either way and only a
   // failure of every path is reported.
   await waitFor(page, (sel) => Boolean(document.querySelector(sel)), 30000, selector, 500);
   let missing = false;
   for (let attempt = 0; attempt < 4; attempt += 1) {
      const dispatched = await withTimeout(page.evaluate((sel) => {
         const element = document.querySelector(sel);
         if (!element) return 'missing';
         element.scrollIntoView({ block: 'center' });
         element.click();
         return 'clicked';
      }, selector), 20000).catch(() => null);
      if (dispatched === 'clicked') return 'dispatch';
      missing = dispatched === 'missing';
      await page.waitForTimeout(1500);
   }
   if (missing) throw new Error(`${label || selector} is not in the page.`);
   try {
      await page.click(selector, { timeout: 8000 });
      return 'click';
   } catch (error) {
      throw new Error(`${label || selector} could not be clicked: ${String(error.message).split('\n')[0]}`);
   }
}

const readout = (page) => withTimeout(page.evaluate(() => {
   const text = (id) => {
      const element = document.getElementById(id);
      return element ? String(element.textContent || '').trim() : null;
   };
   const api = window.gstmxx || {};
   return {
      num: text('gm-num'),
      threshold: text('gm-thr'),
      state: text('gm-state'),
      matchThreshold: typeof api.getMatchThreshold === 'function' ? api.getMatchThreshold() : null,
      activeEffect: typeof api.getActiveEffect === 'function' ? api.getActiveEffect() : null,
   };
}), 8000).catch(() => ({ num: null, threshold: null, state: null, matchThreshold: null, activeEffect: null }));

/** The readout, retried: one starved frame should not lose the number. */
async function readoutWithRetry(page, attempts = 4) {
   for (let attempt = 0; attempt < attempts; attempt += 1) {
      const reading = await readout(page);
      if (reading && reading.num && reading.num !== '—') return reading;
      await page.waitForTimeout(1500);
   }
   return readout(page);
}

/**
 * Wait until the readout says something definite.
 *
 * The lab's auto-find loop ticks every two seconds, but each tick computes a
 * descriptor and under a headless browser one tick can take ten. Until the
 * first one lands the readout says "Measuring…", which is not a reading.
 */
async function waitForReadout(page, timeoutMs) {
   progress('waiting for the lab to report a distance');
   const settled = await waitFor(page, () => {
      const text = (id) => { const el = document.getElementById(id); return el ? String(el.textContent || '').trim() : ''; };
      const num = text('gm-num');
      const state = text('gm-state');
      return (num !== '' && num !== '—' && Number.isFinite(Number.parseFloat(num)))
         || /recognised|escaped|no face/i.test(state);
   }, timeoutMs, undefined, 1500);
   return settled;
}

function parseDistance(value) {
   const number = Number.parseFloat(String(value == null ? '' : value).replace(/[^\d.]/g, ''));
   return Number.isFinite(number) ? number : null;
}

/**
 * Save the face currently on screen and wait for it to land in the database.
 *
 * The lab's save is slow under a headless browser: it captures a thumbnail,
 * detects and describes the face with face-api, then embeds it with MediaPipe,
 * and the whole page is busy meanwhile (main.js setBusy). Fifty seconds is
 * normal, so the wait is generous, and a click that lands while the button is
 * disabled is dropped silently, so the button is checked first and the click
 * repeated once if nothing was stored.
 */
async function saveIdentity(page, timeoutMs = 90000) {
   const facesStored = () => {
      const db = window.gstmxx && window.gstmxx.getDb && window.gstmxx.getDb();
      const stored = db && Array.isArray(db.faces) ? db.faces.length : 0;
      if (stored > 0) return true;
      const counter = document.getElementById('dbCount');
      return Boolean(counter) && Number(counter.textContent) > 0;
   };
   const enabled = (sel) => { const button = document.querySelector(sel); return Boolean(button) && !button.disabled; };

   for (let round = 0; round < 2; round += 1) {
      progress(round ? 'saving the identity (second attempt)' : 'saving the identity');
      await waitFor(page, enabled, 30000, '#saveBtn', 500);
      await clickAction(page, '#saveBtn', 'Save button');
      if (await waitFor(page, facesStored, timeoutMs, undefined, 1500)) {
         await page.waitForTimeout(1200);
         progress('identity saved');
         return true;
      }
   }
   progress('Save clicked but no identity appeared in the database');
   return false;
}

/** The lab's two face databases, as the strings localStorage holds. */
async function exportDatabase(page) {
   return withTimeout(page.evaluate((keys) => ({
      [keys.db]: window.localStorage.getItem(keys.db),
      [keys.db3d]: window.localStorage.getItem(keys.db3d),
   }), STORAGE), 8000);
}

/**
 * Append a <style> element directly.
 *
 * Playwright's addStyleTag waits for the element's load event, and on this
 * page that event arrives half a minute late (the render loop starves it).
 * The stylesheet applies the moment the element is in the DOM, so a plain
 * evaluate is both faster and enough.
 */
async function injectCss(page, css) {
   await withTimeout(page.evaluate((text) => {
      const style = document.createElement('style');
      style.textContent = text;
      document.head.appendChild(style);
   }, css), 15000).catch(() => {});
}

async function freezeUi(page) {
   await injectCss(page, '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }');
   await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      window.scrollTo(0, 0);
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
   }).catch(() => {});
}

/** Hide the lab's own interface so a wide crop cannot catch a button. */
async function hideLabChrome(page) {
   await injectCss(page, `${LAB_CHROME.join(', ')} { display: none !important; }
                html, body { background: #000 !important; }
                /* The lab fades the Ghostyle out a few seconds after each pass
                   (engine.js clearOverlay), which is right for a live tool and
                   wrong for a still. The canvas is repainted every pass, so
                   pinning the opacity shows the current drawing. */
                #overlay { opacity: 1 !important; transition: none !important; }`);
}

/**
 * Screenshot one region through the DevTools protocol.
 *
 * Playwright's own screenshot waits for the page to look stable, and under
 * headless swiftshader this page never does: that wait alone cost twenty
 * seconds per picture. Chromium's Page.captureScreenshot with a clip returns
 * the same pixels in a few seconds, at the device scale factor asked for.
 */
async function captureClip(page, clip, scale = 2) {
   const cdp = await page.context().newCDPSession(page);
   try {
      const shot = await withTimeout(cdp.send('Page.captureScreenshot', {
         format: 'png',
         captureBeyondViewport: false,
         clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale },
      }), 60000);
      return Buffer.from(shot.data, 'base64');
   } finally {
      await cdp.detach().catch(() => {});
   }
}

/** Screenshot the whole viewport through the DevTools protocol (see captureClip) and write it. */
async function captureViewport(page, file, options) {
   const cdp = await page.context().newCDPSession(page);
   try {
      const viewport = page.viewportSize() || { width: 1280, height: 960 };
      const shot = await withTimeout(cdp.send('Page.captureScreenshot', {
         ...(options.format === 'png' ? { format: 'png' } : { format: 'jpeg', quality: options.quality }),
         captureBeyondViewport: false,
         clip: { x: 0, y: 0, width: viewport.width, height: viewport.height, scale: 2 },
      }), 60000);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
   } finally {
      await cdp.detach().catch(() => {});
   }
}

// ---------------------------------------------------------------------------
// Layers and Ghostyles
// ---------------------------------------------------------------------------

/** Which view tab a `--layers` list needs, and the overlay mode inside it.
 *
 * The lab hides the box canvas in the Camera view (lab-ui.js applyView), so a
 * box or a scaffold is only reachable through the 2D or 3D tab. Within a tab
 * the mode can still be cycled with #overlayModeBtn, which is how box-only is
 * reached: the 2D tab would otherwise draw the full 68-point scaffold too.
 */
function viewPlanFor(layers) {
   const has = (name) => layers.includes(name);
   if (!layers.length || (layers.length === 1 && has('none'))) return { view: 'off', mode: null };
   if (has('box') && has('mesh')) return { view: '3d', mode: 'entrambi' };
   if (has('mesh')) return { view: '3d', mode: 'mesh' };
   if (has('landmarks')) return { view: '2d', mode: '2d' };
   return { view: '2d', mode: 'bbox' };
}

/**
 * Put the lab into the view the requested layers need, by clicking its own
 * controls, all inside one page call.
 *
 * Every round trip into this page costs seconds while inference runs, so the
 * view tab and the mode button are clicked from a single evaluate. The view
 * tab sets the overlay mode itself (lab-ui.js applyView: 2D -> "2d",
 * 3D -> "mesh") without updating the mode button's data attribute, so the
 * button is only consulted after it has been clicked once, when the two
 * are back in step.
 */
async function applyLayers(page, options) {
   const plan = viewPlanFor(options.layers);
   progress(`layers ${options.layers.join(',')}: view "${plan.view}"${plan.mode ? `, overlay mode "${plan.mode}"` : ''}`);
   const viewModes = { off: 'bbox', '2d': '2d', '3d': 'mesh' };
   let reached = null;
   for (let attempt = 0; attempt < 3 && reached !== plan.mode; attempt += 1) {
      reached = await withTimeout(page.evaluate(({ view, mode, viewMode }) => {
         const tab = document.querySelector(`.seg[data-view="${view}"]`);
         if (!tab) return null;
         tab.click();
         if (!mode || mode === viewMode) return mode;
         const button = document.getElementById('overlayModeBtn');
         if (!button) return viewMode;
         for (let clicks = 0; clicks < 4; clicks += 1) {
            button.click();
            if (button.dataset.overlayMode === mode) return mode;
         }
         return button.dataset.overlayMode || null;
      }, { view: plan.view, mode: plan.mode, viewMode: viewModes[plan.view] }), 15000).catch(() => null);
      if (reached !== plan.mode) await page.waitForTimeout(1000);
   }
   if (reached !== plan.mode) throw new Error(`the lab did not reach overlay mode "${plan.mode}" (reached: ${reached || 'none'}). Re-run with --headed to watch it.`);
   await page.waitForTimeout(1200);
   return plan.mode || 'none';
}

/**
 * Activate a 2D Ghostyle through its own button, then confirm with the lab.
 *
 * Only the 3D helpers are exposed on window.gstmxx, so the 2D button is the
 * way in. A press that lands while the lab is still busy is dropped without
 * any error, so the click is confirmed, not trusted.
 */
async function activateGhostyle(page, id, options) {
   progress(`activating Ghostyle "${id}"`);
   const selector = `.preview-btn[data-effect="${id}"]`;
   // The list of buttons is asked for until the page answers with one: an
   // unanswered evaluate is a busy frame, not a missing Ghostyle.
   let known = null;
   const deadline = Date.now() + 60000;
   while (known === null && Date.now() < deadline) {
      known = await withTimeout(page.evaluate(() => {
         const buttons = Array.from(document.querySelectorAll('.preview-btn[data-effect]'));
         return buttons.length ? buttons.map((button) => button.dataset.effect) : null;
      }), 15000).catch(() => null);
      if (known === null) await page.waitForTimeout(1000);
   }
   if (!known) throw new Error('the lab never listed its Ghostyles; re-run with --debug.');
   if (!known.includes(id)) {
      throw new Error(`no Ghostyle called "${id}" in the lab.\n  Loaded ids: ${known.join(', ')}\n  Ids come from ghostyles.json.`);
   }
   const ready = await waitFor(
      page, (sel) => { const button = document.querySelector(sel); return Boolean(button) && !button.disabled; },
      30000, selector,
   );
   if (!ready) throw new Error(`the lab left Ghostyle "${id}" disabled; it is still busy.`);

   let active = null;
   for (let round = 0; round < 3 && active !== id; round += 1) {
      if (round) await page.waitForTimeout(2500);
      await clickAction(page, selector, `Ghostyle ${id}`);
      await page.waitForTimeout(Math.max(1500, options.settle * 1000));
      for (let attempt = 0; attempt < 8; attempt += 1) {
         active = await withTimeout(page.evaluate(() => window.gstmxx.getActiveEffect()), 10000).catch(() => null);
         if (active === id) break;
         await page.waitForTimeout(1200);
      }
   }
   if (active !== id) {
      throw new Error(`Ghostyle "${id}" did not become active after three attempts (active: ${active || 'none'}). Re-run with --headed to watch the lab.`);
   }
   progress(`Ghostyle "${id}" active`);
}

/**
 * Flip the lab back to the photograph's orientation.
 *
 * camera.js mirrors #video and #overlay (scaleX(-1)) whenever the facing mode
 * is "user", which is the only mode a fake webcam has, and the box, mesh and
 * label canvases follow #overlay. The lab's own #mirrorToggle undoes it and
 * keeps the lab's state in step (main.js), so label text is still drawn the
 * right way round; setting the transform from outside would not. The button is
 * hidden in the interface but still wired, and Element.click() does not care.
 */
async function unmirror(page) {
   const state = () => withTimeout(page.evaluate(() => {
      const overlay = document.getElementById('overlay');
      const toggle = document.getElementById('mirrorToggle');
      const mirrored = (overlay && overlay.style.transform || '').includes('scaleX(-1)');
      return { mirrored, hasToggle: Boolean(toggle) };
   }), 15000).catch(() => null);

   let current = await state();
   if (!current) throw new Error('the lab did not answer when asked whether it is mirrored. Re-run with --headed to watch it.');
   if (!current.mirrored) { progress('lab is not mirrored'); return false; }
   if (!current.hasToggle) throw new Error('the lab is mirrored and has no #mirrorToggle to undo it; pass --mirror to keep the selfie view.');

   for (let attempt = 0; attempt < 3 && current.mirrored; attempt += 1) {
      await withTimeout(page.evaluate(() => document.getElementById('mirrorToggle').click()), 15000).catch(() => {});
      await page.waitForTimeout(600);
      current = await state() || current;
   }
   if (current.mirrored) throw new Error('the lab stayed mirrored after three presses of #mirrorToggle. Re-run with --headed to watch it.');
   progress('lab un-mirrored: the picture reads like the photograph');
   return true;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * Where the face is, in page pixels.
 *
 * face-api reports the box in the overlay canvas's own coordinate space, so it
 * is scaled by the canvas's on-screen size and offset by its position. The lab
 * mirrors the canvas with a CSS transform for a selfie camera, and a mirrored
 * box has to be flipped back or the crop lands on the wrong cheek.
 */
async function faceBoxOnPage(page, attempts = 4) {
   for (let attempt = 0; attempt < attempts; attempt += 1) {
      const answer = await faceBoxOnce(page);
      if (answer && answer.face) return answer;
      if (answer && attempt === attempts - 1) return answer;
      await page.waitForTimeout(1500);
   }
   return null;
}

async function faceBoxOnce(page) {
   return withTimeout(page.evaluate(() => {
      const overlay = document.getElementById('overlay');
      if (!overlay) return null;
      const rect = overlay.getBoundingClientRect();
      const viewer = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      const result = window.gstmxx && window.gstmxx.getLastResult && window.gstmxx.getLastResult();
      const raw = result && ((result.detection && result.detection.box) || result.box) || null;
      if (!raw) return { viewer, face: null };

      const intrinsicW = overlay.width || rect.width;
      const intrinsicH = overlay.height || rect.height;
      const scaleX = rect.width / intrinsicW;
      const scaleY = rect.height / intrinsicH;
      const transform = window.getComputedStyle(overlay).transform || 'none';
      const mirrored = transform !== 'none' && Number((transform.match(/matrix\(([-\d.]+)/) || [])[1]) < 0;
      const x = mirrored ? intrinsicW - (raw.x + raw.width) : raw.x;
      return {
         viewer,
         mirrored,
         face: { x: rect.left + x * scaleX, y: rect.top + raw.y * scaleY, width: raw.width * scaleX, height: raw.height * scaleY },
      };
   }), 15000).catch(() => null);
}

/**
 * Grow the face box into the crop that is actually saved.
 *
 * Padding is a fraction of the box, so the head fills the same proportion of
 * every picture whatever the source resolution or how close the person stood.
 */
function cropFromBox(box, bounds, options) {
   const [aw, ah] = options.aspect;
   const padded = { width: box.width * (1 + options.pad * 2), height: box.height * (1 + options.pad * 2) };
   const centreX = box.x + box.width / 2;
   const centreY = box.y + box.height / 2;

   let width = padded.width;
   let height = (width / aw) * ah;
   if (height < padded.height) {
      height = padded.height;
      width = (height / ah) * aw;
   }
   // Clamp to the frame by scaling BOTH sides, never one: clamping them
   // independently silently changes the aspect.
   const fit = Math.min(1, bounds.width / width, bounds.height / height);
   width *= fit;
   height *= fit;
   let x = centreX - width / 2;
   // Faces sit high in a portrait crop: the chin needs less room than the hair.
   let y = centreY - height * 0.46;
   x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - width));
   y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - height));
   return { x, y, width, height };
}

/** Resize a screenshot buffer to the requested width and write it. */
async function writeImage(buffer, file, options) {
   const { createCanvas, loadImage } = require('canvas');
   const image = await loadImage(buffer);
   const width = options.width;
   const height = Math.round((width / image.width) * image.height);
   const surface = createCanvas(width, height);
   surface.getContext('2d').drawImage(image, 0, 0, width, height);
   const encoded = options.format === 'png'
      ? surface.toBuffer('image/png')
      : surface.toBuffer('image/jpeg', { quality: options.quality / 100 });
   fs.mkdirSync(path.dirname(file), { recursive: true });
   fs.writeFileSync(file, encoded);
   return { file, width, height, bytes: encoded.length };
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

async function render(options, baseUrl, workDir) {
   const y4mFile = toY4m(options.baseline, workDir, 'baseline', options);
   // A smaller window makes the face smaller in CSS px while the lab's labels
   // and strokes, sized in CSS px, stay put: that is what --label-scale is.
   // The capture scale grows by the same factor so the saved pixels match.
   const viewport = {
      width: Math.round(RENDER_VIEWPORT.width / options.labelScale),
      height: Math.round(RENDER_VIEWPORT.height / options.labelScale),
   };
   const captureScale = RENDER_CAPTURE_SCALE * options.labelScale;
   if (options.labelScale !== 1) progress(`label scale ${options.labelScale}: window ${viewport.width}x${viewport.height}, capture at ${captureScale}x`);
   const session = await openLab(y4mFile, options, baseUrl, { viewport });
   const { page, logs } = session;
   try {
      if (!session.detected) {
         throw new Error(
            `face-api found no face in ${displayPath(options.baseline)}.\n` +
            '  The lab cannot draw a box, landmarks or a Ghostyle on a frame it has not detected.\n' +
            '  Try a frontal, evenly lit picture where the head is a reasonable share of the frame.\n' +
            `  Browser log: ${logs.slice(-3).join(' | ') || 'empty'}`,
         );
      }
      let identity = null;
      if (options.saveIdentity) {
         // Saved while the lab's controls are still visible: the saved-faces
         // badge is one of the things hideLabChrome removes.
         const saved = await saveIdentity(page);
         identity = saved ? await readoutWithRetry(page) : null;
      }

      const flipped = options.mirror ? false : await unmirror(page);

      await hideLabChrome(page);
      const mode = await applyLayers(page, options);
      if (options.ghostyle) await activateGhostyle(page, options.ghostyle, options);
      await page.waitForTimeout(1500);

      const geometry = await faceBoxOnPage(page);
      if (!geometry) throw new Error('the lab did not answer when asked where the video is on the page. Re-run with --headed to watch it.');
      let clip;
      if (options.crop === 'frame' || !geometry.face) {
         if (options.crop === 'face') progress('the lab reports no face box right now, saving the whole frame instead');
         clip = geometry.viewer;
      } else {
         clip = cropFromBox(geometry.face, geometry.viewer, options);
      }

      progress('taking the picture');
      await freezeUi(page);
      const written = await writeImage(await captureClip(page, clip, captureScale), options.output, options);

      out();
      out(`source   : ${displayPath(options.baseline)}`);
      out(`feed     : ${options.feed.label}${options.feed.fit ? ' (4:3 frame as tall as the source, up to 1080)' : ''}`);
      out(`layers   : ${options.layers.join(', ')} (lab overlay mode: ${mode})${options.ghostyle ? `, ghostyle ${options.ghostyle}` : ''}`);
      out(`mirror   : ${options.mirror ? 'kept (--mirror), the lab\'s selfie view' : flipped ? 'undone, reads like the photograph' : 'the lab was not mirrored'}`);
      if (options.labelScale !== 1) out(`labels   : ${options.labelScale}x (window ${viewport.width}x${viewport.height}, captured at ${captureScale}x)`);
      if (options.saveIdentity) out(`identity : ${identity ? `saved, lab reports "${identity.state}"` : 'NOT saved'}`);
      if (geometry.face) {
         out(`face box : ${Math.round(geometry.face.width)}x${Math.round(geometry.face.height)} at ` +
             `${Math.round(geometry.face.x)},${Math.round(geometry.face.y)}${geometry.mirrored ? ' (mirrored, flipped back for the crop)' : ''}`);
      }
      out(`crop     : ${options.crop === 'face' && geometry.face ? `face, pad ${options.pad}, aspect ${options.aspect.join(':')}` : 'whole frame'}, ` +
          `${Math.round(clip.width)}x${Math.round(clip.height)} css px`);
      out(`wrote    : ${displayPath(written.file)}  ${written.width}x${written.height}  ${Math.round(written.bytes / 1024)} KB`);
   } finally {
      await session.close();
   }
}

// ---------------------------------------------------------------------------
// measure
// ---------------------------------------------------------------------------

async function measure(options, baseUrl, workDir) {
   const baselineY4m = toY4m(options.baseline, workDir, 'baseline', options);
   const dazzledY4m = toY4m(options.dazzled, workDir, 'dazzled', options);

   // Session 1: save the identity from the baseline and take its database.
   progress('session 1 of 2: baseline');
   let database;
   let baselineReadout;
   {
      const session = await openLab(baselineY4m, options, baseUrl);
      try {
         if (!session.detected) throw new Error(`face-api found no face in the baseline ${displayPath(options.baseline)}; there is no identity to save.`);
         const saved = await saveIdentity(session.page);
         if (!saved) throw new Error('the Save button was clicked but no identity was stored. Re-run with --debug or --headed.');
         baselineReadout = await readoutWithRetry(session.page);
         database = await exportDatabase(session.page);
         const faces = countFaces(database[STORAGE.db]);
         progress(`database exported: ${faces} face${faces === 1 ? '' : 's'}`);
      } finally {
         await session.close();
      }
   }

   // Session 2: load the dazzled picture with that identity already known.
   progress('session 2 of 2: dazzled');
   const samples = [];
   let detectedDazzled;
   {
      const session = await openLab(dazzledY4m, options, baseUrl, { seed: database });
      try {
         detectedDazzled = session.detected;
         // Polled rather than asked once: a busy frame can leave one evaluate
         // unanswered, and that is not proof the database is empty.
         const known = await waitFor(session.page, () => {
            const db = window.gstmxx && window.gstmxx.getDb && window.gstmxx.getDb();
            return Boolean(db && Array.isArray(db.faces) && db.faces.length > 0);
         }, 30000, undefined, 1000);
         if (!known) throw new Error('the dazzled session did not load the saved identity from storage; nothing to compare against.');
         // With no detection there is nothing the loop can measure: one look
         // at the readout is kept for the record and the sampling is skipped.
         const settled = await waitForReadout(session.page, session.detected ? 120000 : 15000);
         if (!settled) progress(session.detected ? 'the readout never settled; the readings below are whatever the lab shows' : 'no face, no distance to sample');
         const sampleCount = session.detected ? options.samples : 1;
         for (let index = 0; index < sampleCount; index += 1) {
            if (index) await session.page.waitForTimeout(options.interval * 1000);
            const reading = await readoutWithRetry(session.page, 3);
            samples.push({ atSeconds: Number((index * options.interval).toFixed(1)), ...reading });
            progress(`reading ${index + 1}/${options.samples}: ${reading.num} ${reading.state || ''}`);
         }
      } finally {
         await session.close();
      }
   }

   const result = summarise(options, baselineReadout, samples, detectedDazzled);
   printMeasure(result);
   if (options.json) {
      fs.mkdirSync(path.dirname(options.json), { recursive: true });
      fs.writeFileSync(options.json, `${JSON.stringify(result, null, 2)}\n`);
      out(`wrote    : ${displayPath(options.json)}`);
   }
   if (options.visualLog) {
      const written = await writeVisualLog(result, options);
      out(`wrote    : ${displayPath(written.file)}  ${written.width}x${written.height}  ${Math.round(written.bytes / 1024)} KB`);
   }
   return result;
}

function countFaces(raw) {
   try {
      const parsed = JSON.parse(raw || 'null');
      return parsed && Array.isArray(parsed.faces) ? parsed.faces.length : 0;
   } catch (error) {
      return 0;
   }
}

function summarise(options, baselineReadout, samples, detectedDazzled) {
   const threshold = samples.map((sample) => sample.matchThreshold).find((value) => Number.isFinite(value))
      ?? parseDistance((samples[samples.length - 1] || baselineReadout || {}).threshold);
   const distances = samples.map((sample) => parseDistance(sample.num)).filter((value) => value !== null);
   const states = [...new Set(samples.map((sample) => sample.state).filter(Boolean))];
   const faceLost = detectedDazzled === false || (!distances.length && states.some((state) => /no face/i.test(state)));

   let verdict;
   let outcome;
   if (faceLost) {
      outcome = 'no-face';
      verdict = 'Success: the detector lost the face altogether';
      /*
      verdict = detectedDazzled === false
         ? 'no face detected on the dazzled picture within 60s: the detector lost the face altogether (strongest result; --debug to confirm)'
         : 'no face found on the dazzled picture: the detector lost the face altogether (strongest result)';
         */
   } else if (!distances.length) {
      outcome = 'no-reading';
      verdict = 'no distance was reported; re-run with --debug';
   } else if (threshold === null) {
      outcome = 'no-threshold';
      verdict = `distance ${Math.max(...distances).toFixed(2)}, but the threshold could not be read`;
   } else if (Math.min(...distances) >= threshold) {
      outcome = 'escaped';
      verdict = `escaped: every reading is at or above the threshold ${threshold}`;
   } else if (Math.max(...distances) >= threshold) {
      outcome = 'unstable';
      verdict = `unstable: readings cross the threshold ${threshold} in both directions`;
   } else {
      outcome = 'recognised';
      verdict = `still recognised: every reading is below the threshold ${threshold}`;
   }

   return {
      tool: `lab-capture ${VERSION}`,
      feed: options.feed.label,
      measuredAt: new Date().toISOString(),
      baseline: displayPath(options.baseline),
      dazzled: displayPath(options.dazzled),
      baselineState: baselineReadout ? baselineReadout.state : null,
      threshold,
      distances,
      min: distances.length ? Number(Math.min(...distances).toFixed(3)) : null,
      max: distances.length ? Number(Math.max(...distances).toFixed(3)) : null,
      mean: distances.length ? Number((distances.reduce((a, b) => a + b, 0) / distances.length).toFixed(3)) : null,
      statesSeen: states,
      outcome,
      verdict,
      samples,
   };
}

function printMeasure(result) {
   out();
   out(`baseline : ${result.baseline}  (saved, lab reported "${result.baselineState || '?'}")`);
   out(`dazzled  : ${result.dazzled}`);
   out(`feed     : ${result.feed}`);
   out(`threshold: ${result.threshold ?? '?'}`);
   out(`readings : ${result.samples.map((sample) => `${sample.num ?? '—'} (${sample.state || 'no state'})`).join(', ')}`);
   if (result.min !== null) out(`distance : min ${result.min}  mean ${result.mean}  max ${result.max}`);
   out(`verdict  : ${result.verdict}`);
}

/**
 * One picture that tells the whole story: baseline on the left, dazzled on the
 * right, the readings and the verdict underneath. For a lab notebook or a
 * message, not for publication.
 */
async function writeVisualLog(result, options) {
   const { createCanvas, loadImage } = require('canvas');
   const loadOrNull = async (file) => {
      try { return await loadImage(file); } catch (error) { return null; }
   };
   const [left, right] = await Promise.all([loadOrNull(options.baseline), loadOrNull(options.dazzled)]);

   const panelH = 640;
   const gap = 24;
   const margin = 32;
   const fit = (image) => {
      if (!image) return { width: Math.round(panelH * 0.8), height: panelH };
      const scale = panelH / image.height;
      return { width: Math.round(image.width * scale), height: panelH };
   };
   const leftBox = fit(left);
   const rightBox = fit(right);
   const textH = 250;
   const width = margin * 2 + leftBox.width + gap + rightBox.width;
   const height = margin + 40 + panelH + textH + margin;

   const canvas = createCanvas(width, height);
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = '#14161a';
   ctx.fillRect(0, 0, width, height);

   const label = (text, x, y, color = '#eef2ff', font = '600 20px sans-serif', align = 'left') => {
      ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align; ctx.fillText(text, x, y);
   };
   const drawPanel = (image, box, x, title) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(x, margin + 40, box.width, box.height);
      if (image) ctx.drawImage(image, x, margin + 40, box.width, box.height);
      else label('(video source, no preview)', x + box.width / 2, margin + 40 + box.height / 2, '#9aa3b2', '18px sans-serif', 'center');
      label(title, x, margin + 24);
   };
   drawPanel(left, leftBox, margin, `baseline · ${path.basename(options.baseline)}`);
   drawPanel(right, rightBox, margin + leftBox.width + gap, `dazzled · ${path.basename(options.dazzled)}`);

   // Readings: one column of text, then a distance bar against the threshold.
   const textTop = margin + 40 + panelH + 36;
   const mono = '18px monospace';

   // I'm cleaning the look and feel of the readings
   // label(`identity saved from baseline, lab reported "${result.baselineState || '?'}"`, margin, textTop, '#c8d0e0', mono);
   // label(`readings on dazzled: ${result.samples.map((sample) => sample.num ?? '—').join('  ')}`, margin, textTop + 30, '#c8d0e0', mono);
   // label(`states: ${result.statesSeen.join(' / ') || '—'}`, margin, textTop + 60, '#c8d0e0', mono);

   const barX = margin;
   const barY = textTop + 90;
   const barW = width - margin * 2;
   const barH = 22;
   const scaleMax = 1.0;
   ctx.fillStyle = '#2a2f3a';
   ctx.fillRect(barX, barY, barW, barH);
   if (result.threshold !== null) {
      const tx = barX + Math.min(1, result.threshold / scaleMax) * barW;
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(tx - 1, barY - 6, 3, barH + 12);
      label(`threshold ${result.threshold}`, tx, barY + barH + 22, '#ffd166', '16px monospace', 'center');
   }
   const escapedColor = '#4be3a0';
   const matchedColor = '#ff6b6b';
   for (const distance of result.distances) {
      const dx = barX + Math.min(1, distance / scaleMax) * barW;
      ctx.fillStyle = result.threshold !== null && distance >= result.threshold ? escapedColor : matchedColor;
      ctx.beginPath(); ctx.arc(dx, barY + barH / 2, 8, 0, Math.PI * 2); ctx.fill();
   }
   if (result.outcome === 'no-face') {
      label('no face found on the dazzled picture', barX + barW, barY + barH - 4, escapedColor, '600 18px monospace', 'right');
   }
   label('0', barX, barY + barH + 22, '#9aa3b2', '16px monospace');
   label(String(scaleMax), barX + barW, barY + barH + 22, '#9aa3b2', '16px monospace', 'right');

   const verdictColor = ['escaped', 'no-face'].includes(result.outcome) ? escapedColor
      : result.outcome === 'recognised' ? matchedColor : '#ffd166';
   label(result.verdict, margin, barY + barH + 66, verdictColor, '600 22px sans-serif');
   label(`lab-capture ${VERSION} measure · ${result.measuredAt}`, width - margin, height - 12, '#6b7280', '14px monospace', 'right');

   const png = /\.png$/i.test(options.visualLog);
   const encoded = png ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg', { quality: options.quality / 100 });
   fs.mkdirSync(path.dirname(options.visualLog), { recursive: true });
   fs.writeFileSync(options.visualLog, encoded);
   return { file: options.visualLog, width, height, bytes: encoded.length };
}

// ---------------------------------------------------------------------------
// shots
// ---------------------------------------------------------------------------

async function shots(options, baseUrl, workDir) {
   fs.mkdirSync(options.output, { recursive: true });
   const extension = options.format === 'png' ? 'png' : 'jpg';
   const name = (suffix) => path.join(options.output, `${options.prefix}-${suffix}.${extension}`);
   const written = [];
   const notes = [];

   // A. Save an identity on the clean face, then show the landmark view.
   {
      const y4mFile = toY4m(options.baseline, workDir, 'baseline', options);
      const session = await openLab(y4mFile, options, baseUrl, { viewport: { width: 1280, height: 800 } });
      try {
         if (!session.detected) throw new Error(`no detection on the clean picture ${displayPath(options.baseline)}`);
         const saved = await saveIdentity(session.page);
         if (!saved) throw new Error('the Save button was clicked but no identity was stored');
         notes.push(`save   : ${JSON.stringify(await readout(session.page))}`);
         await freezeUi(session.page);
         const savedFile = name('save-id');
         await captureViewport(session.page, savedFile, options);
         written.push(savedFile);

         progress('switching to the landmark view');
         await clickAction(session.page, '.seg[data-view="2d"]', 'Landmark view toggle');
         await session.page.waitForTimeout(3000);
         await freezeUi(session.page);
         const plainFile = name('save-id-plain');
         await captureViewport(session.page, plainFile, options);
         written.push(plainFile);
         notes.push(`points : ${JSON.stringify(await readout(session.page))}`);
      } finally {
         await session.close();
      }
   }

   // B. Record a clip on the painted face and open the upload consent screen.
   {
      const y4mFile = toY4m(options.dazzled, workDir, 'dazzled', options);
      const session = await openLab(y4mFile, options, baseUrl, { viewport: { width: 1280, height: 1180 } });
      try {
         if (!session.detected) throw new Error(`no detection on the painted picture ${displayPath(options.dazzled)}`);
         await saveIdentity(session.page);
         progress(`recording ${options.record}s`);
         await clickAction(session.page, '#recordBtn', 'Record button');
         await session.page.waitForTimeout(options.record * 1000);
         notes.push(`record : ${JSON.stringify(await readout(session.page))}`);
         await clickAction(session.page, '#gm-nav-upload', 'Upload tab');
         await session.page.waitForTimeout(2500);
         const state = await withTimeout(session.page.evaluate(() => {
            const screen = document.getElementById('gm-screen-upload');
            return {
               screenClass: screen ? screen.className : null,
               clipMeta: (document.getElementById('gm-upload-clip-meta') || {}).textContent || null,
               submitDisabled: (document.getElementById('gm-upload-submit') || {}).disabled,
            };
         }), 10000).catch(() => ({ screenClass: null, clipMeta: null, submitDisabled: null }));
         notes.push(`upload : ${JSON.stringify(state)}`);
         if (state.screenClass && state.screenClass.includes('hidden')) {
            notes.push('upload : consent screen stayed hidden, no clip was recorded');
         }
         await withTimeout(session.page.evaluate(() => {
            const screen = document.getElementById('gm-screen-upload');
            if (screen) screen.scrollTop = 0;
            window.scrollTo(0, 0);
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
         }), 10000).catch(() => {});
         await freezeUi(session.page);
         const uploadFile = name('upload-consent');
         await captureViewport(session.page, uploadFile, options);
         written.push(uploadFile);
      } finally {
         await session.close();
      }
   }

   out();
   for (const note of notes) out(note);
   for (const file of written) out(`wrote  : ${displayPath(file)}`);
}

// ---------------------------------------------------------------------------

async function main() {
   const options = parseArgs(process.argv.slice(2));

   progress(`lab-capture ${VERSION}: ${options.command}`);
   let server = null;
   let baseUrl = options.baseUrl;
   if (!baseUrl) {
      server = await startLocalServer();
      baseUrl = server.baseUrl;
      progress(`serving ${path.basename(ROOT)} on ${baseUrl}`);
   } else {
      progress(`using ${baseUrl}`);
   }

   const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gstmxx-capture-'));
   try {
      if (options.command === 'render') await render(options, baseUrl, workDir);
      if (options.command === 'measure') await measure(options, baseUrl, workDir);
      if (options.command === 'shots') await shots(options, baseUrl, workDir);
   } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
      if (server) await server.close();
      progress('done');
   }
}

main().catch((error) => {
   process.stderr.write(`\n${String(error && error.message || error)}\n`);
   process.exit(1);
});
