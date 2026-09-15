#!/usr/bin/env node
/**
 * Drive lab.html with a fake webcam, measure the recognition distance and
 * capture workshop screenshots.
 *
 * Chromium replaces the camera with a Y4M file built by
 * `scripts-dev/build-face-fixtures.cjs`. The script starts a local static
 * server unless --base-url is given, waits for face-api to produce a
 * detection, saves an identity, and then reads `#gm-num`, `#gm-thr` and
 * `#gm-state` the way a participant reads them on screen.
 *
 * Subcommands:
 *   measure   Save the identity on the clean segment, sample the distance
 *             across the painted segment, print a table and write JSON.
 *   shots     Capture the workshop images: saved identity, landmark view,
 *             upload consent screen.
 *   probe     Dump the page state and console for one fixture. Use when a
 *             capture returns nothing and you need to know why.
 *
 * Usage:
 *   node scripts-dev/lab-capture.cjs measure --figure 9,10
 *   node scripts-dev/lab-capture.cjs shots --figure 9
 *   node scripts-dev/lab-capture.cjs probe --figure 9 --variant clean
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const httpServer = require('http-server');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'synthetic-faces', 'y4m');
const DEFAULT_SHOT_OUTPUT = path.join(ROOT, 'images', 'workshops');
const DEFAULT_MEASURE_OUTPUT = path.join(ROOT, 'tests', 'fixtures', 'synthetic-faces');
// render writes to scratch on purpose: these are candidates to look through,
// not deliverables. Move the keepers into images/home/ yourself.
const DEFAULT_RENDER_OUTPUT = path.join(ROOT, 'scratch', 'story');
const COMMANDS = ['measure', 'shots', 'probe', 'render'];

function usage() {
   return `
Drive lab.html with a fake webcam to measure distances and capture screenshots.

Usage:
  node scripts-dev/lab-capture.cjs <measure|shots|probe> --figure <list> [options]
  node scripts-dev/lab-capture.cjs render --image <file> [options]

Options:
  --figure <list>      Figure numbers, comma-separated, or all
                       (required for measure, shots and probe)
  --image <file>       render: any JPEG or PNG with one frontal face (required)
  --ghostyle <id>      render: Ghostyle id from ghostyles.json. Omitted, only
                       the clean pass is written
  --layers <list>      render: comma-separated, from none, box, landmarks, mesh,
                       ghostyle (default: box). "landmarks" is the box plus the
                       face-api 68-point scaffold, the "recognised" look
  --pad <n>            render: crop padding as a fraction of the face box
                       (default: 0.6)
  --aspect <w:h>       render: crop aspect (default: 4:5)
  --width <px>         render: output width (default: 1024)
  --name <stem>        render: output file stem (default: the image file name)
  --no-measure         render: skip saving a baseline and reading the distance
  --fixtures <path>    Y4M folder
                       (default: tests/fixtures/synthetic-faces/y4m)
  --output <path>      measure: JSON destination folder
                       (default: tests/fixtures/synthetic-faces)
                       shots: image destination folder
                       (default: images/workshops)
  --base-url <url>     Use an already-running server instead of starting one
  --lab <path>         Lab page path (default: /lab.html)
  --variant <name>     probe only: clean, painted or pair (default: pair)
  --samples <n>        measure: readings across the painted segment (default: 6)
  --interval <sec>     measure: seconds between readings (default: 1.2)
  --settle <sec>       Seconds to wait after the first detection (default: 3)
  --save-wait <sec>    measure: seconds allowed for the save to register
                       (default: 5)
  --record <sec>       shots: seconds of clip to record (default: 7)
  --format <ext>       shots: jpg or png (default: jpg)
  --quality <n>        shots: JPEG quality 1-100 (default: 82)
  --prefix <name>      shots: file name prefix (default: ws-lab)
  --headed             Show the browser
  --keep-open <sec>    Leave the browser open after each run, for debugging
  --help               Show this help

  --output <path>      render: destination folder (default: scratch/story)

Notes:
  measure needs figureN-pair.y4m. shots needs figureN-clean.y4m and
  figureN-painted.y4m. Build them first:
    npm run capture:fixtures -- --figure 9,10

  render takes an ordinary photograph instead, and needs ffmpeg on PATH. The
  clean pass and the Ghostyle pass are the same frame, because a Ghostyle is an
  overlay: nobody has to hold a pose between two pictures. It writes images and
  prints numbers, and writes no data file. Example:

    node scripts-dev/lab-capture.cjs render --image shots/candidate.jpg \\
      --ghostyle cv-dazzle-1 --layers box,ghostyle
`;
}

function requireValue(argv, index, option) {
   const value = argv[index + 1];
   if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
   return value;
}

function parseArgs(argv) {
   const options = {
      command: null,
      figures: null,
      fixtures: DEFAULT_FIXTURES,
      output: null,
      baseUrl: null,
      lab: '/lab.html',
      variant: 'pair',
      samples: 6,
      interval: 1.2,
      settle: 3,
      saveWait: 5,
      record: 7,
      format: 'jpg',
      quality: 82,
      prefix: 'ws-lab',
      headed: false,
      keepOpen: 0,
      image: null,
      ghostyle: null,
      layers: ['box'],
      pad: 0.6,
      aspect: [4, 5],
      width: 1024,
      name: null,
      measure: true,
   };

   for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index];
      if (arg === '--help') { process.stdout.write(usage()); process.exit(0); }
      if (!arg.startsWith('--') && !options.command) {
         if (!COMMANDS.includes(arg)) throw new Error(`Unknown subcommand: ${arg}. Expected ${COMMANDS.join(', ')}.`);
         options.command = arg;
         continue;
      }
      if (arg === '--headed') { options.headed = true; continue; }
      if (arg === '--figure') { options.figures = requireValue(argv, index, arg); index += 1; continue; }
      if (arg === '--fixtures') { options.fixtures = path.resolve(ROOT, requireValue(argv, index, arg)); index += 1; continue; }
      if (arg === '--output') { options.output = path.resolve(ROOT, requireValue(argv, index, arg)); index += 1; continue; }
      if (arg === '--base-url') { options.baseUrl = requireValue(argv, index, arg).replace(/\/$/, ''); index += 1; continue; }
      if (arg === '--lab') {
         const value = requireValue(argv, index, arg);
         options.lab = value.startsWith('/') ? value : `/${value}`;
         index += 1;
         continue;
      }
      if (arg === '--variant') {
         const value = requireValue(argv, index, arg);
         if (!['clean', 'painted', 'pair'].includes(value)) throw new Error(`--variant must be clean, painted or pair.`);
         options.variant = value;
         index += 1;
         continue;
      }
      if (arg === '--prefix') { options.prefix = requireValue(argv, index, arg); index += 1; continue; }
      if (arg === '--image') { options.image = path.resolve(ROOT, requireValue(argv, index, arg)); index += 1; continue; }
      if (arg === '--ghostyle') { options.ghostyle = requireValue(argv, index, arg); index += 1; continue; }
      if (arg === '--name') { options.name = requireValue(argv, index, arg); index += 1; continue; }
      if (arg === '--no-measure') { options.measure = false; continue; }
      if (arg === '--layers') {
         const value = requireValue(argv, index, arg).split(',').map((item) => item.trim()).filter(Boolean);
         const unknown = value.filter((item) => !LAYER_NAMES.includes(item));
         if (unknown.length) throw new Error(`--layers: unknown layer(s) ${unknown.join(', ')}. Expected ${LAYER_NAMES.join(', ')}.`);
         options.layers = value;
         index += 1;
         continue;
      }
      if (arg === '--aspect') {
         const value = requireValue(argv, index, arg);
         const parts = value.split(':').map(Number);
         if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part) || part <= 0)) {
            throw new Error('--aspect must look like 4:5.');
         }
         options.aspect = parts;
         index += 1;
         continue;
      }
      if (arg === '--pad' || arg === '--width') {
         const value = Number(requireValue(argv, index, arg));
         if (!Number.isFinite(value) || value < 0) throw new Error(`${arg} must be a non-negative number.`);
         if (arg === '--pad') options.pad = value;
         if (arg === '--width') options.width = Math.max(64, Math.round(value));
         index += 1;
         continue;
      }
      if (arg === '--format') {
         const value = requireValue(argv, index, arg).toLowerCase();
         if (!['jpg', 'jpeg', 'png'].includes(value)) throw new Error('--format must be jpg or png.');
         options.format = value === 'jpeg' ? 'jpg' : value;
         index += 1;
         continue;
      }
      if (['--samples', '--interval', '--settle', '--save-wait', '--record', '--quality', '--keep-open'].includes(arg)) {
         const value = Number(requireValue(argv, index, arg));
         if (!Number.isFinite(value) || value < 0) throw new Error(`${arg} must be a non-negative number.`);
         if (arg === '--samples') options.samples = Math.max(1, Math.round(value));
         if (arg === '--interval') options.interval = value;
         if (arg === '--settle') options.settle = value;
         if (arg === '--save-wait') options.saveWait = value;
         if (arg === '--record') options.record = value;
         if (arg === '--quality') options.quality = Math.min(100, Math.max(1, Math.round(value)));
         if (arg === '--keep-open') options.keepOpen = value;
         index += 1;
         continue;
      }
      throw new Error(`Unknown option: ${arg}`);
   }

   if (!options.command) throw new Error(`A subcommand is required: ${COMMANDS.join(', ')}.`);
   if (options.command === 'render') {
      if (!options.image) throw new Error('--image is required for render. Pass any JPEG or PNG with one frontal face.');
      if (options.ghostyle && !options.layers.includes('ghostyle')) options.layers = [...options.layers, 'ghostyle'];
      if (options.layers.includes('ghostyle') && !options.ghostyle) {
         throw new Error('--layers includes ghostyle but no --ghostyle id was given.');
      }
   } else if (!options.figures) {
      throw new Error('--figure is required. Pass numbers such as 9,10 or the word all.');
   }
   if (!options.output) {
      if (options.command === 'shots') options.output = DEFAULT_SHOT_OUTPUT;
      else if (options.command === 'render') options.output = DEFAULT_RENDER_OUTPUT;
      else options.output = DEFAULT_MEASURE_OUTPUT;
   }
   return options;
}

/** Print a repository-relative path, or an absolute one when it lies outside. */
function displayPath(file) {
   const relative = path.relative(ROOT, file);
   return relative.startsWith('..') ? file : relative;
}

function resolveFigures(options) {
   if (options.figures === 'all') {
      if (!fs.existsSync(options.fixtures)) throw new Error(`Fixture folder not found: ${options.fixtures}`);
      const numbers = new Set();
      for (const entry of fs.readdirSync(options.fixtures)) {
         const match = /^figure(\d+)-(pair|clean)\.y4m$/.exec(entry);
         if (match) numbers.add(Number(match[1]));
      }
      const found = [...numbers].sort((a, b) => a - b);
      if (!found.length) throw new Error(`No Y4M fixtures in ${options.fixtures}. Run npm run capture:fixtures first.`);
      return found;
   }
   const numbers = options.figures.split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
      const value = Number(item);
      if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid figure number: ${item}`);
      return value;
   });
   return [...new Set(numbers)].sort((a, b) => a - b);
}

function fixtureFile(options, figure, variant) {
   const file = path.join(options.fixtures, `figure${figure}-${variant}.y4m`);
   if (!fs.existsSync(file)) {
      throw new Error(`Missing fixture ${path.relative(ROOT, file)}. Build it with:\n  npm run capture:fixtures -- --figure ${figure}`);
   }
   return file;
}

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
   return chromium.launch({
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
}

async function openLab(y4mFile, options, baseUrl, viewport) {
   const browser = await launch(y4mFile, options);
   const context = await browser.newContext({
      viewport: viewport || { width: 1280, height: 860 },
      permissions: ['camera'],
      deviceScaleFactor: 2,
   });
   // The lab reads its overlay mode from localStorage on boot
   // (bbox-overlay.js, OVERLAY_MODE_STORAGE_KEY). Seeding it here is the only
   // way in from outside: setOverlayMode is a module import, not a global, and
   // the button that cycles it is one of the controls render hides.
   if (options.overlayMode) {
      await context.addInitScript((mode) => {
         try { window.localStorage.setItem('ghostati-overlay-mode-v1', mode); } catch (error) { /* private mode */ }
      }, options.overlayMode);
   }
   const page = await context.newPage();
   const logs = [];
   page.on('console', (message) => logs.push(`[${message.type()}] ${message.text()}`.slice(0, 240)));
   page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`.slice(0, 240)));
   await page.goto(`${baseUrl}${options.lab}`, { waitUntil: 'load' });
   const detected = await waitFor(
      page,
      () => Boolean(window.gstmxx && window.gstmxx.getLastResult && window.gstmxx.getLastResult()),
      60000,
   );
   await page.waitForTimeout(options.settle * 1000);
   return { browser, page, logs, detected };
}

const readout = (page) => withTimeout(page.evaluate(() => {
   const text = (id) => {
      const element = document.getElementById(id);
      return element ? String(element.textContent || '').trim() : null;
   };
   return {
      num: text('gm-num'),
      threshold: text('gm-thr'),
      state: text('gm-state'),
      uploadDisabled: (document.getElementById('gm-nav-upload') || {}).getAttribute
         ? document.getElementById('gm-nav-upload').getAttribute('aria-disabled')
         : null,
   };
}), 8000).catch(() => ({ num: null, threshold: null, state: null, uploadDisabled: null }));

async function freezeUi(page) {
   await page.addStyleTag({
      content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
   }).catch(() => {});
   await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      window.scrollTo(0, 0);
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
   }).catch(() => {});
}

function shotOptions(file, options) {
   return options.format === 'png'
      ? { path: file, type: 'png' }
      : { path: file, type: 'jpeg', quality: options.quality };
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
         // A navigation destroys the execution context, and a frame busy with
         // inference can leave an evaluate unanswered. Both are normal here:
         // keep polling until the deadline rather than failing on one miss.
      }
      if (Date.now() >= deadline) return false;
      await page.waitForTimeout(pollMs);
   }
}

/**
 * Reject after `ms` if a page call has not answered.
 *
 * `page.evaluate` has no timeout of its own. When the lab's render loop blocks
 * the main thread the call never settles, which would hang the whole run.
 */
function withTimeout(promise, ms) {
   let timer = null;
   const guard = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`page call did not answer within ${ms}ms`)), ms);
   });
   promise.catch(() => {});
   return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/**
 * Click an element the way a participant would, and fall back to a direct DOM
 * click when Playwright's actionability check cannot run (see waitFor above).
 */
async function clickAction(page, selector, label) {
   // A busy frame can leave the presence check unanswered. That is not proof
   // the element is missing, so the click is attempted either way and only a
   // failure of every path is reported.
   await waitFor(page, (sel) => Boolean(document.querySelector(sel)), 45000, selector, 500);
   try {
      await page.click(selector, { timeout: 8000 });
      return 'click';
   } catch (actionabilityError) {
      // A frame busy with inference can leave one evaluate unanswered, so the
      // direct click is retried rather than treated as a failure.
      for (let attempt = 0; attempt < 3; attempt += 1) {
         const dispatched = await withTimeout(page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (!element) return false;
            element.scrollIntoView({ block: 'center' });
            element.click();
            return true;
         }, selector), 15000).catch(() => false);
         if (dispatched) return 'dispatch';
         await page.waitForTimeout(1500);
      }
      throw new Error(`${label || selector} could not be clicked: ${String(actionabilityError.message).split('\n')[0]}`);
   }
}

/**
 * Save the face currently on screen and wait for the saved-faces badge rather
 * than for a fixed delay, so a slow machine does not read the label too early.
 */
async function saveIdentity(page, options) {
   const how = await clickAction(page, '#saveBtn', 'Save button');
   const registered = await waitFor(page, () => {
      const db = window.gstmxx && window.gstmxx.getDb && window.gstmxx.getDb();
      const stored = db && Array.isArray(db.faces) ? db.faces.length : 0;
      if (stored > 0) return true;
      const counter = document.getElementById('dbCount');
      return Boolean(counter) && Number(counter.textContent) > 0;
   }, options.saveWait * 1000 + 10000);
   await page.waitForTimeout(1200);
   return { how, registered };
}

async function measureFigure(figure, options, baseUrl) {
   const y4mFile = fixtureFile(options, figure, 'pair');
   const { browser, page, logs, detected } = await openLab(y4mFile, options, baseUrl);
   try {
      if (!detected) return { figure, error: 'no detection within 60s', console: logs.slice(-6) };

      const before = await readout(page);
      const save = await saveIdentity(page, options);
      const saved = await readout(page);
      if (!save.registered) {
         return { figure, error: 'the Save button was clicked but no identity was stored', console: logs.slice(-6) };
      }

      const samples = [];
      for (let index = 0; index < options.samples; index += 1) {
         await page.waitForTimeout(options.interval * 1000);
         const sample = await readout(page);
         samples.push({ atSeconds: Number(((index + 1) * options.interval).toFixed(1)), ...sample });
      }

      const distances = samples.map((sample) => Number.parseFloat(sample.num)).filter((value) => Number.isFinite(value));
      const threshold = Number.parseFloat(String(saved.threshold || '').replace(/[^\d.]/g, '')) || null;
      const peak = distances.length ? Math.max(...distances) : null;
      const states = [...new Set(samples.map((sample) => sample.state).filter(Boolean))];
      return {
         figure,
         fixture: path.relative(ROOT, y4mFile),
         beforeSave: before.state,
         savedAs: saved.state,
         threshold,
         min: distances.length ? Number(Math.min(...distances).toFixed(2)) : null,
         peak: peak === null ? null : Number(peak.toFixed(2)),
         crossedThreshold: peak !== null && threshold !== null ? peak >= threshold : null,
         statesSeen: states,
         samples,
      };
   } catch (error) {
      return { figure, error: String(error?.message || error).split('\n')[0].slice(0, 160), console: logs.slice(-6) };
   } finally {
      if (options.keepOpen) await page.waitForTimeout(options.keepOpen * 1000);
      await browser.close();
   }
}

async function shotFigure(figure, options, baseUrl) {
   fs.mkdirSync(options.output, { recursive: true });
   const extension = options.format === 'png' ? 'png' : 'jpg';
   const name = (suffix) => path.join(options.output, `${options.prefix}-${suffix}.${extension}`);
   const written = [];
   const notes = [];

   // A. Save an identity on the clean face, then show the landmark view.
   {
      const y4mFile = fixtureFile(options, figure, 'clean');
      const { browser, page, detected } = await openLab(y4mFile, options, baseUrl, { width: 1280, height: 800 });
      try {
         if (!detected) throw new Error('no detection on the clean fixture');
         const save = await saveIdentity(page, options);
         if (!save.registered) throw new Error('the Save button was clicked but no identity was stored');
         const saved = await readout(page);
         notes.push(`save   : ${JSON.stringify(saved)}`);
         await freezeUi(page);
         const savedFile = name('save-id');
         await page.screenshot(shotOptions(savedFile, options));
         written.push(savedFile);

         const hasLandmarkToggle = await withTimeout(
            page.evaluate(() => Boolean(document.querySelector('[data-view="2d"]'))), 10000,
         ).catch(() => false);
         if (hasLandmarkToggle) {
            await clickAction(page, '[data-view="2d"]', 'Landmark view toggle');
            await page.waitForTimeout(4000);
            await freezeUi(page);
            const plainFile = name('save-id-plain');
            await page.screenshot(shotOptions(plainFile, options));
            written.push(plainFile);
            notes.push(`points : ${JSON.stringify(await readout(page))}`);
         } else {
            notes.push('points : [data-view="2d"] not found, skipped');
         }
      } finally {
         if (options.keepOpen) await page.waitForTimeout(options.keepOpen * 1000);
         await browser.close();
      }
   }

   // B. Record a clip on the painted face and open the upload consent screen.
   {
      const y4mFile = fixtureFile(options, figure, 'painted');
      const { browser, page, detected } = await openLab(y4mFile, options, baseUrl, { width: 1280, height: 1180 });
      try {
         if (!detected) throw new Error('no detection on the painted fixture');
         await saveIdentity(page, options);
         await clickAction(page, '#recordBtn', 'Record button');
         await page.waitForTimeout(options.record * 1000);
         notes.push(`record : ${JSON.stringify(await readout(page))}`);
         await clickAction(page, '#gm-nav-upload', 'Upload tab');
         await page.waitForTimeout(2500);
         const state = await withTimeout(page.evaluate(() => {
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
         await withTimeout(page.evaluate(() => {
            const screen = document.getElementById('gm-screen-upload');
            if (screen) screen.scrollTop = 0;
            window.scrollTo(0, 0);
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
         }), 10000).catch(() => {});
         await freezeUi(page);
         const uploadFile = name('upload-consent');
         await page.screenshot(shotOptions(uploadFile, options));
         written.push(uploadFile);
      } finally {
         if (options.keepOpen) await page.waitForTimeout(options.keepOpen * 1000);
         await browser.close();
      }
   }

   return { figure, written, notes };
}

async function probeFigure(figure, options, baseUrl) {
   const y4mFile = fixtureFile(options, figure, options.variant);
   const { browser, page, logs, detected } = await openLab(y4mFile, options, baseUrl);
   try {
      const state = await withTimeout(page.evaluate(() => {
         const video = document.getElementById('video');
         return {
            video: video ? { width: video.videoWidth, height: video.videoHeight, paused: video.paused, hasStream: Boolean(video.srcObject) } : null,
            gstmxx: typeof window.gstmxx,
            api: window.gstmxx ? Object.keys(window.gstmxx).slice(0, 40) : [],
            bodyClass: document.body.className,
         };
      }), 10000).catch((error) => ({ error: String(error.message) }));
      return { figure, fixture: path.relative(ROOT, y4mFile), detected, state, readout: await readout(page), console: logs.slice(-20) };
   } finally {
      if (options.keepOpen) await page.waitForTimeout(options.keepOpen * 1000);
      await browser.close();
   }
}

// ---------------------------------------------------------------------------
// render — put one arbitrary photograph through the lab and save what the lab
// draws on it.
//
// This is the picture-picking tool, not a measurement harness. `measure` runs
// the built fixtures and reports numbers; `render` takes any still you point
// it at, feeds it to the lab as a fake webcam, turns on the layers you ask
// for, and writes a cropped PNG or JPEG you can drop straight into a page.
//
// The clean pass and the Ghostyle pass are the SAME FRAME. The Ghostyle is an
// overlay drawn on the video, so nobody has to hold a pose between the two
// pictures: crop, light, distance and expression are identical by
// construction, and the only thing that differs is the thing being tested.
// ---------------------------------------------------------------------------

/** `--layers` names to the lab's own overlay modes. `ghostyle` is not an
 *  overlay mode: it toggles the effect, so it is handled separately. */
const LAYER_OVERLAY = {
   none: null,
   box: 'bbox',        // the face box plus its metric labels
   landmarks: '2d',    // the box AND the face-api 68-point scaffold: "recognised"
   mesh: 'mesh',       // MediaPipe mesh dots
};
const LAYER_NAMES = [...Object.keys(LAYER_OVERLAY), 'ghostyle'];

/** Lab chrome that must not appear inside a crop. */
const LAB_CHROME = [
   '.viewbar', '.rail', '.rec-dot', '.bottombar', '.scrim-top', '.scrim-bottom',
   '.status-pill', '#placeholder', '.screen', '#gm-pluginbar', '.locale-control',
];

function ffmpegAvailable() {
   const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
   return !probe.error && probe.status === 0;
}

/**
 * Turn a still into the Y4M the fake webcam wants.
 *
 * Same recipe as tutorials/lab-screenshots.md. The still is fitted to a
 * 640x480 frame and padded rather than stretched, because face-api's landmark
 * positions are only meaningful if the face keeps its aspect ratio. A 4:3
 * source fills the frame exactly and gets no bars; anything else is centred,
 * and the bars are then inside the crop unless --pad is lowered.
 */
function stillToY4m(imageFile, workDir) {
   if (!ffmpegAvailable()) {
      throw new Error('ffmpeg is not on PATH. render needs it to turn a still into a fake webcam feed.');
   }
   const y4mFile = path.join(workDir, 'render-source.y4m');
   const result = spawnSync('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-loop', '1', '-i', imageFile, '-t', '6', '-r', '15',
      '-vf', 'scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2:color=0x9a938c,format=yuv420p',
      '-pix_fmt', 'yuv420p', y4mFile,
   ], { encoding: 'utf8' });
   if (result.status !== 0) {
      throw new Error(`ffmpeg could not read ${displayPath(imageFile)}: ${String(result.stderr || '').trim()}`);
   }
   return y4mFile;
}

/** Hide the lab's own interface so a wide crop cannot catch a button. */
async function hideLabChrome(page) {
   await page.addStyleTag({
      content: `${LAB_CHROME.join(', ')} { display: none !important; }
                html, body { background: #000 !important; }
                /* The lab fades the Ghostyle out two seconds after each pass
                   (engine.js clearOverlay), which is right for a live tool and
                   wrong for a still. The canvas is repainted every pass, so
                   pinning the opacity shows the current drawing rather than a
                   stale one. An inline style without !important loses to this. */
                #overlay { opacity: 1 !important; transition: none !important; }`,
   }).catch(() => {});
}

/** Which view tab a `--layers` list needs, and the overlay mode inside it.
 *
 * The lab hides the whole overlay canvas in the Camera view
 * (lab-ui.js: bbox.classList.toggle('gm-canvas-hidden', v === 'off')), so a
 * box or a scaffold is only reachable through the 2D or 3D tab. Within a tab
 * the mode can still be cycled, which is how box-only is reached: the 2D tab
 * would otherwise draw the full 68-point scaffold as well.
 */
function viewPlanFor(layers) {
   const wanted = layers.filter((layer) => layer !== 'ghostyle');
   const has = (name) => wanted.includes(name);
   if (!wanted.length || (wanted.length === 1 && has('none'))) return { view: 'off', mode: null };
   if (has('box') && has('mesh')) return { view: '3d', mode: 'entrambi' };
   if (has('mesh')) return { view: '3d', mode: 'mesh' };
   if (has('landmarks')) return { view: '2d', mode: '2d' };
   return { view: '2d', mode: 'bbox' };
}

/**
 * Put the lab into the view the requested layers need.
 *
 * Everything here is done by clicking the lab's own controls, because
 * setOverlayMode is a module import rather than a global: the view tabs are
 * the supported way in, and #overlayModeBtn (hidden in the page, but present)
 * cycles the mode within a view.
 */
async function applyLayers(page, options) {
   const plan = viewPlanFor(options.layers);
   await clickAction(page, `.seg[data-view="${plan.view}"]`, `the ${plan.view} view tab`);
   await page.waitForTimeout(1500);
   if (!plan.mode) return 'none';

   for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await withTimeout(page.evaluate(() => {
         const button = document.getElementById('overlayModeBtn');
         return button ? button.dataset.overlayMode || null : null;
      }), 8000).catch(() => null);
      if (current === plan.mode) break;
      // A null reading means the button has not been clicked yet and carries no
      // mode, not that the mode is unreachable: click and look again.
      await clickAction(page, '#overlayModeBtn', 'the overlay mode button').catch(() => {});
      await page.waitForTimeout(900);
   }
   return plan.mode;
}

/**
 * Where the face is, in page pixels.
 *
 * face-api reports the box in the overlay canvas's own coordinate space, so it
 * has to be scaled by the canvas's on-screen size and offset by its position.
 * The lab mirrors the canvas with a CSS transform when the camera is a selfie
 * camera, and a mirrored box has to be flipped back or the crop lands on the
 * wrong cheek.
 */
async function faceBoxOnPage(page) {
   return withTimeout(page.evaluate(() => {
      const overlay = document.getElementById('overlay');
      const result = window.gstmxx && window.gstmxx.getLastResult && window.gstmxx.getLastResult();
      if (!overlay || !result) return null;
      const raw = (result.detection && result.detection.box) || result.box || null;
      if (!raw) return null;

      const rect = overlay.getBoundingClientRect();
      const intrinsicW = overlay.width || rect.width;
      const intrinsicH = overlay.height || rect.height;
      const scaleX = rect.width / intrinsicW;
      const scaleY = rect.height / intrinsicH;

      const transform = window.getComputedStyle(overlay).transform || 'none';
      const mirrored = transform !== 'none' && Number((transform.match(/matrix\(([-\d.]+)/) || [])[1]) < 0;

      const x = mirrored ? intrinsicW - (raw.x + raw.width) : raw.x;
      return {
         x: rect.left + x * scaleX,
         y: rect.top + raw.y * scaleY,
         width: raw.width * scaleX,
         height: raw.height * scaleY,
         viewer: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
         mirrored,
      };
   }), 10000).catch(() => null);
}

/**
 * Grow the face box into the crop that is actually saved.
 *
 * Padding is a fraction of the box, so the head fills the same proportion of
 * every card whatever the source resolution or how close the person stood.
 * That is what makes two cards comparable; a fixed pixel pad does not.
 */
function cropFromBox(box, options) {
   const [aw, ah] = options.aspect;
   const padded = {
      width: box.width * (1 + options.pad * 2),
      height: box.height * (1 + options.pad * 2),
   };
   const centreX = box.x + box.width / 2;
   const centreY = box.y + box.height / 2;

   let width = padded.width;
   let height = (width / aw) * ah;
   if (height < padded.height) {
      height = padded.height;
      width = (height / ah) * aw;
   }

   // Clamp to the frame by scaling BOTH sides, never one: clamping them
   // independently silently changes the aspect, and two cards cropped to
   // different shapes stop being comparable.
   const bounds = box.viewer;
   const fit = Math.min(1, bounds.width / width, bounds.height / height);
   width *= fit;
   height *= fit;
   let x = centreX - width / 2;
   // Faces sit high in a portrait crop: the chin needs less room than the hair
   // and the shoulders, so the box is nudged up rather than centred.
   let y = centreY - height * 0.46;
   x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - width));
   y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - height));
   return { x, y, width, height };
}

/**
 * Screenshot one region.
 *
 * The default 30s budget is not enough here. The lab runs face-api and
 * MediaPipe on the render loop, headless Chromium starves requestAnimationFrame
 * under swiftshader, and Playwright's own stability wait then outlives its
 * timeout on a page that is in fact fine. A longer budget and one retry is the
 * same lesson waitFor learned further up this file.
 */
async function captureClip(page, clip) {
   const shot = () => page.screenshot({ clip, timeout: 90000, animations: 'disabled', caret: 'initial', scale: 'css' });
   try {
      return await shot();
   } catch (error) {
      await page.waitForTimeout(2000);
      return shot();
   }
}

/** Resize a screenshot buffer to the requested width and write it. */
async function writeImage(buffer, file, options) {
   const { createCanvas, loadImage } = require('canvas');
   const image = await loadImage(buffer);
   const width = options.width;
   const height = Math.round((width / image.width) * image.height);
   const surface = createCanvas(width, height);
   surface.getContext('2d').drawImage(image, 0, 0, width, height);
   const out = options.format === 'png'
      ? surface.toBuffer('image/png')
      : surface.toBuffer('image/jpeg', { quality: options.quality / 100 });
   fs.mkdirSync(path.dirname(file), { recursive: true });
   fs.writeFileSync(file, out);
   return { file, width, height, bytes: out.length };
}

/** The match readout, retried: one starved frame should not lose the number. */
async function readoutWithRetry(page, attempts = 4) {
   for (let attempt = 0; attempt < attempts; attempt += 1) {
      const reading = await readout(page);
      if (reading && reading.num) return reading;
      await page.waitForTimeout(1500);
   }
   return readout(page);
}

async function renderImage(options, baseUrl) {
   const imageFile = options.image;
   if (!fs.existsSync(imageFile)) throw new Error(`No such image: ${displayPath(imageFile)}`);

   const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gstmxx-render-'));
   const extension = options.format === 'png' ? 'png' : 'jpg';
   const stem = options.name || path.basename(imageFile).replace(/\.[^.]+$/, '');
   const written = [];
   const notes = [];

   try {
      const y4mFile = stillToY4m(imageFile, workDir);
      const { browser, page, logs, detected } = await openLab(y4mFile, options, baseUrl, { width: 1280, height: 960 });
      try {
         if (!detected) {
            throw new Error(
               `face-api found no face in ${displayPath(imageFile)}.\n` +
               '  The lab cannot draw a box, landmarks or a Ghostyle on a frame it has not detected.\n' +
               '  Try a frontal, evenly lit photograph where the head is a reasonable share of the frame.\n' +
               `  Browser log: ${logs.slice(-3).join(' | ') || 'empty'}`,
            );
         }
         // The baseline is saved first, while the lab's own controls are still
         // visible: saveIdentity waits for the saved-faces badge, and that
         // badge is one of the things hideLabChrome removes.
         let baseline = null;
         if (options.measure) {
            const save = await saveIdentity(page, options);
            baseline = await readoutWithRetry(page);
            // saveIdentity watches the saved-faces badge, which a busy frame can
            // leave unread. The readout is the better witness: if the lab is
            // reporting a state and a number, an identity is stored.
            const stored = save.registered
               || Boolean(baseline && baseline.num && baseline.state && !/save your face/i.test(baseline.state));
            notes.push(`baseline : ${stored ? `saved, lab reports "${baseline.state}"` : 'NOT SAVED, the distance below is meaningless'}`);
         }

         await hideLabChrome(page);
         const mode = await applyLayers(page, options);
         notes.push(`overlay  : ${mode}`);
         await page.waitForTimeout(1800);

         const box = await faceBoxOnPage(page);
         if (!box) {
            throw new Error(
               `a face was detected in ${displayPath(imageFile)} but the lab reported no box for it, ` +
               'so there is nothing to crop to. Re-run with --headed to watch what the lab does.',
            );
         }
         const clip = cropFromBox(box, options);
         notes.push(`face box : ${Math.round(box.width)}x${Math.round(box.height)} at ` +
                    `${Math.round(box.x)},${Math.round(box.y)}${box.mirrored ? ' (mirrored, flipped back)' : ''}`);
         notes.push(`crop     : ${Math.round(clip.width)}x${Math.round(clip.height)} at ` +
                    `${Math.round(clip.x)},${Math.round(clip.y)}, pad ${options.pad}, aspect ${options.aspect.join(':')}`);

         // --- clean pass: the frame as the lab sees it, before any Ghostyle.
         await freezeUi(page);
         const cleanFile = path.join(options.output, `${stem}-clean.${extension}`);
         written.push(await writeImage(await captureClip(page, clip), cleanFile, options));

         // --- Ghostyle pass: the same frame, with the effect on.
         let painted = null;
         if (options.ghostyle) {
            // 2D Ghostyles are activated through their own button, not through
            // window.gstmxx: only the 3D helpers are exposed there. The button
            // lives in a drawer this command has already hidden, so the click
            // is dispatched rather than performed.
            const selector = `.preview-btn[data-effect="${options.ghostyle}"]`;
            const present = await waitFor(
               page, (sel) => Boolean(document.querySelector(sel)), 20000, selector,
            );
            if (!present) {
               const known = await withTimeout(page.evaluate(() => Array.from(
                  document.querySelectorAll('.preview-btn[data-effect]'),
               ).map((button) => button.dataset.effect)), 8000).catch(() => []);
               throw new Error(
                  `no Ghostyle called "${options.ghostyle}" in the lab.\n` +
                  `  Loaded ids: ${known.join(', ') || 'none'}\n` +
                  '  Ids come from ghostyles.json.',
               );
            }
            // Saving an identity puts the lab in its busy state, which disables
            // every Ghostyle button. A disabled button swallows the click
            // silently, so wait for the controls to come back first.
            const ready = await waitFor(
               page, (sel) => { const button = document.querySelector(sel); return Boolean(button) && !button.disabled; },
               30000, selector,
            );
            if (!ready) throw new Error(`the lab left Ghostyle "${options.ghostyle}" disabled; it is still busy.`);
            // The click is retried, not trusted once. Under a headless browser
            // the lab can still be finishing the work the save started when
            // the button is pressed, and a press that lands then is dropped
            // without any error: the button is simply not listening yet.
            let active = null;
            for (let round = 0; round < 3 && active !== options.ghostyle; round += 1) {
               if (round) await page.waitForTimeout(3000);
               await clickAction(page, selector, `Ghostyle ${options.ghostyle}`);
               await page.waitForTimeout(options.settle * 1000);
               for (let attempt = 0; attempt < 8; attempt += 1) {
                  active = await withTimeout(page.evaluate(() => window.gstmxx.getActiveEffect()), 10000).catch(() => null);
                  if (active === options.ghostyle) break;
                  await page.waitForTimeout(1500);
               }
            }
            if (active !== options.ghostyle) {
               throw new Error(
                  `Ghostyle "${options.ghostyle}" did not become active after three attempts ` +
                  `(active: ${active || 'none'}). Re-run with --headed to watch the lab.`,
               );
            }
            notes.push(`ghostyle : ${options.ghostyle} active`);
            await freezeUi(page);
            const paintedFile = path.join(options.output, `${stem}-${options.ghostyle}.${extension}`);
            written.push(await writeImage(await captureClip(page, clip), paintedFile, options));
            painted = await readoutWithRetry(page);
         }

         return { image: imageFile, written, notes, baseline, painted, logs };
      } finally {
         if (options.keepOpen) await page.waitForTimeout(options.keepOpen * 1000);
         await browser.close();
      }
   } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
   }
}

/** Everything render learned, on stdout. None of it is written to a data file:
 *  the page carries these numbers as hand-written HTML. */
function printRenderReport(result, options) {
   const distance = (readingValue) => {
      const value = Number.parseFloat(String(readingValue == null ? '' : readingValue).replace(/[^\d.]/g, ''));
      return Number.isFinite(value) ? value : null;
   };
   process.stdout.write('\n');
   process.stdout.write(`source   : ${displayPath(result.image)}\n`);
   process.stdout.write(`layers   : ${options.layers.join(', ')}${options.ghostyle ? ` + ghostyle ${options.ghostyle}` : ''}\n`);
   for (const note of result.notes) process.stdout.write(`${note}\n`);

   const threshold = distance((result.painted || result.baseline || {}).threshold);
   const paintedDistance = distance((result.painted || {}).num);
   if (result.painted) {
      const verdict = threshold === null || paintedDistance === null
         ? 'no reading'
         : paintedDistance >= threshold
            ? `crossed the threshold (${paintedDistance} against ${threshold})`
            : `still matched (${paintedDistance} against ${threshold})`;
      process.stdout.write(`distance : ${verdict}\n`);
      process.stdout.write(`readout  : ${JSON.stringify(result.painted)}\n`);
   } else if (options.measure) {
      process.stdout.write('distance : no Ghostyle applied, nothing to compare against the baseline\n');
   }
   for (const file of result.written) {
      process.stdout.write(`wrote    : ${displayPath(file.file)}  ${file.width}x${file.height}  ${Math.round(file.bytes / 1024)} KB\n`);
   }
   process.stdout.write('\nThese numbers are for picking a picture. Put the ones you publish into the page by hand.\n');
}

function printMeasureTable(results, options) {
   const width = { figure: 10, saved: 22, min: 7, peak: 7 };
   process.stdout.write('\n');
   process.stdout.write(`${'figure'.padEnd(width.figure)}${'saved as'.padEnd(width.saved)}${'min'.padStart(width.min)}${'peak'.padStart(width.peak)}   verdict\n`);
   process.stdout.write(`${'-'.repeat(width.figure + width.saved + width.min + width.peak + 12)}\n`);
   for (const result of results) {
      if (result.error) {
         process.stdout.write(`${`figure${result.figure}`.padEnd(width.figure)}ERROR ${result.error}\n`);
         continue;
      }
      const verdict = result.crossedThreshold === null
         ? 'no reading'
         : result.crossedThreshold
            ? `eluded, crossed ${result.threshold}`
            : `still matched, under ${result.threshold}`;
      process.stdout.write(
         `${`figure${result.figure}`.padEnd(width.figure)}${String(result.savedAs || '').padEnd(width.saved)}` +
         `${String(result.min ?? '-').padStart(width.min)}${String(result.peak ?? '-').padStart(width.peak)}   ${verdict}\n`,
      );
   }
   process.stdout.write(`\nSamples per figure: ${options.samples} at ${options.interval}s intervals.\n`);
}

async function main() {
   const options = parseArgs(process.argv.slice(2));
   const figures = options.command === 'render' ? [] : resolveFigures(options);

   let server = null;
   let baseUrl = options.baseUrl;
   if (!baseUrl) {
      server = await startLocalServer();
      baseUrl = server.baseUrl;
      process.stdout.write(`Serving ${path.relative(path.dirname(ROOT), ROOT)} on ${baseUrl}\n`);
   } else {
      process.stdout.write(`Using ${baseUrl}\n`);
   }

   try {
      if (options.command === 'measure') {
         const results = [];
         for (const figure of figures) {
            process.stdout.write(`figure${figure}: measuring\n`);
            const result = await measureFigure(figure, options, baseUrl);
            results.push(result);
            if (result.error) process.stdout.write(`  error: ${result.error}\n`);
            else process.stdout.write(`  saved as "${result.savedAs}", distance ${result.min} .. ${result.peak} against ${result.threshold}\n`);
         }
         printMeasureTable(results, options);
         fs.mkdirSync(options.output, { recursive: true });
         const jsonFile = path.join(options.output, 'lab-measurements.json');
         fs.writeFileSync(jsonFile, `${JSON.stringify({
            capturedAt: new Date().toISOString(),
            lab: `${baseUrl}${options.lab}`,
            samples: options.samples,
            intervalSeconds: options.interval,
            results,
         }, null, 2)}\n`);
         process.stdout.write(`Wrote ${displayPath(jsonFile)}\n`);
      }

      if (options.command === 'shots') {
         for (const figure of figures) {
            process.stdout.write(`figure${figure}: capturing\n`);
            const result = await shotFigure(figure, options, baseUrl);
            for (const note of result.notes) process.stdout.write(`  ${note}\n`);
            for (const file of result.written) process.stdout.write(`  wrote ${displayPath(file)}\n`);
         }
      }

      if (options.command === 'render') {
         const result = await renderImage(options, baseUrl);
         printRenderReport(result, options);
      }

      if (options.command === 'probe') {
         for (const figure of figures) {
            const result = await probeFigure(figure, options, baseUrl);
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
         }
      }
   } finally {
      if (server) await server.close();
   }
}

main().catch((error) => {
   process.stderr.write(`${String(error?.message || error)}\n`);
   process.exit(1);
});
