#!/usr/bin/env node
/**
 * Search for Ghostyles by random trial.
 *
 * From one video of one person, `atlas` builds a pose atlas: clean face-api
 * imprints at as many head poses as the video shows, the most frontal one as
 * anchor, and the person's skin swatch. `trial` then draws random overlays
 * from a recipe (for example three 5 × 2 cm bands at 80 % opacity, colours of
 * maximum contrast with the skin), paints each one on every pose through the
 * MediaPipe mesh and measures how far face-api moves from the clean face.
 * `report` aggregates every trial into one HTML page.
 *
 * Everything runs in a headless Chromium on a harness page
 * (scripts-dev/ghostyle-fuzz/harness.html) with the lab's own vendored
 * face-api and MediaPipe builds. Video frames come from ffmpeg, so any codec
 * ffmpeg reads works and frame numbers are exact.
 *
 * Usage:
 *   node scripts-dev/ghostyle-fuzz.cjs atlas  --video tests/fixtures/my-moving-face.mp4
 *   node scripts-dev/ghostyle-fuzz.cjs trial  --atlas scratch/fuzz/my-moving-face/pose-atlas.json \
 *                                             --recipe scripts-dev/ghostyle-fuzz/recipes/three-bands.json --trials 50
 *   node scripts-dev/ghostyle-fuzz.cjs report --atlas scratch/fuzz/my-moving-face/pose-atlas.json
 *
 * Documentation: tutorials/ghostyle-fuzz.md. Results describe face-api in
 * this lab only; they do not establish protection against other systems.
 *
 * History:
 *   1.0.0  2026-10-20  First version: atlas, trial, report.
 *   1.1.0  2026-10-24  trial: --color, --no-overlap, --zones, --paired (recipe
 *                      keys color, overlap, zones, pairedSeeds); atlas:
 *                      --out-root; scores split into lostRate and
 *                      descriptorEscape; report prints a per-recipe summary;
 *                      new `compare` sub-command across atlases. Recipes
 *                      without the new keys keep their 1.0.0 hash and trials.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { chromium } = require('@playwright/test');
const { buildReportHtml } = require('./ghostyle-fuzz/report.cjs');

const VERSION = '1.1.0';
const TOOL = `ghostyle-fuzz ${VERSION}`;
const ROOT = path.resolve(__dirname, '..');
const HARNESS_PATH = '/scripts-dev/ghostyle-fuzz/harness.html';
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, 'scratch', 'fuzz');
const COMMANDS = ['atlas', 'trial', 'report', 'compare'];

/** Pure helpers shared with the harness page (ES module). */
let core = null;
async function loadCore() {
   core = await import(pathToFileURL(path.join(__dirname, 'ghostyle-fuzz', 'fuzz-core.mjs')).href);
   return core;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const T0 = Date.now();
function progress(message) {
   const seconds = ((Date.now() - T0) / 1000).toFixed(1).padStart(7);
   process.stderr.write(`[${seconds}s] ${message}\n`);
}
function out(line = '') { process.stdout.write(`${line}\n`); }
function displayPath(file) {
   const relative = path.relative(ROOT, file);
   return relative.startsWith('..') ? file : relative;
}

function usage() {
   return `
${TOOL}

Search for Ghostyles by random trial over the head poses of one video.

Usage:
  node scripts-dev/ghostyle-fuzz.cjs atlas   --video <file> [options]
  node scripts-dev/ghostyle-fuzz.cjs trial   --atlas <pose-atlas.json> --recipe <recipe.json> [options]
  node scripts-dev/ghostyle-fuzz.cjs report  --atlas <pose-atlas.json> [--output <file.html>]
  node scripts-dev/ghostyle-fuzz.cjs compare --atlas <a.json> --atlas <b.json> [...] [--output <file.txt>]

atlas (once per video):
  --video <file>          Source video (any format ffmpeg reads). Never modified.
  --output <dir>          Atlas directory (default: <out-root>/<video-stem>/)
  --out-root <dir>        Parent of the default atlas directory (default: scratch/fuzz).
                          Not with --output.
  --sample-fps <n>        Frames per second scanned with MediaPipe (default: 15)
  --bin <deg>             Pose bin size for yaw and pitch (default: 10)
  --max-imprints <n>      Cap on imprints; the bins farthest from frontal go first (default: 60)
  --candidates <n>        Frames tried per bin with face-api, sharpest first (default: 3)
  --anchor-window <a-b>   Seconds where the anchor (frontal) frame is searched,
                          e.g. 0-2 for "the video starts frontal" (default: whole video)
  --max-gap <sec>         Gaps in face presence longer than this are warned about (default: 0.5)
  --force                 Replace an existing atlas (its trials no longer match it)

trial (the fuzzer; appends to <atlas dir>/trials.ndjson):
  --atlas <file>          A pose-atlas.json written by atlas
  --recipe <file>         Recipe JSON (see scripts-dev/ghostyle-fuzz/recipes/)
  --trials <n>            Number of trials (default: 1)
  --seed <n>              Master seed. Random when omitted, and printed. Trial k uses
                          seed + k, so --seed X --trials 1 repeats the trial of seed X.
  --top <k>               Trials materialised at the end: Pareto front of
                          (escapeRate, worstCase) first (default: 20)
  --no-prune              Sweep every imprint of every trial
  --prune-subset <n>      Imprints swept before a trial may be abandoned (default: 12)
  --prune-margin <x>      escapeRate slack before abandoning (default: 0.15)
  --color <css>           One colour for every stroke instead of the skin-contrast
                          palette: a CSS name, #rgb, #rrggbb or rgb(r,g,b). Not with
                          --paired. Changes the recipe id (trials stay apart).
  --no-overlap            Strokes must not overlap one another (redrawn until they
                          do not; the trial fails if the recipe cannot be packed).
  --zones <list>          Where stroke centres may fall, comma-separated among
                          forehead, eyes, nose-cheeks, mouth-chin (default: anywhere).
  --paired                Draw the palette from its own random stream so that a seed
                          gives the same strokes on every face. Not with --color.
  The four options above are the recipe keys color, overlap, zones, pairedSeeds;
  a recipe that already sets one of them to another value is an error.
  Ctrl-C stops after the current trial and still materialises the top.

report:
  --atlas <file>          A pose-atlas.json
  --output <file>         Report file (default: <atlas dir>/report.html)
  Prints a per-recipe summary (escape split into lostRate and descriptorEscape,
  face coverage) and writes the HTML.

compare (several atlases of the same recipes, e.g. three videos of one face):
  --atlas <file>          Repeat once per pose-atlas.json (2 or more)
  --output <file>         Also write the text to this file
  Prints the image-quality variables of each atlas, the outcome split per recipe
  and atlas, and, for seeds that drew the same strokes on every atlas (--paired or
  --color trials), the escape of each design face by face.

Common:
  --headed                Show the browser; trial shows every composite as it is measured
  --gpu                   Use the machine's GPU instead of swiftshader (faster)
  --version, --help
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
   if (!Number.isFinite(value) || value < min) throw new Error(`${option} must be a number of at least ${min}.`);
   return integer ? Math.round(value) : value;
}

function parseArgs(argv) {
   const options = {
      command: null,
      video: null,
      atlas: null,
      recipe: null,
      output: null,
      sampleFps: 15,
      bin: 10,
      maxImprints: 60,
      candidates: 3,
      anchorWindow: null,
      maxGap: 0.5,
      force: false,
      trials: 1,
      seed: null,
      top: 20,
      prune: true,
      pruneSubset: 12,
      pruneMargin: 0.15,
      headed: false,
      gpu: false,
      // 1.1.0
      atlases: [],
      outRoot: null,
      color: null,
      noOverlap: false,
      zones: null,
      paired: false,
   };
   const file = (raw) => path.resolve(process.cwd(), raw);
   const seen = new Set();
   for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index];
      if (arg === '--help' || arg === '-h') { process.stdout.write(usage()); process.exit(0); }
      if (arg === '--version' || arg === '-V') { out(TOOL); process.exit(0); }
      if (!arg.startsWith('--') && !options.command) {
         if (!COMMANDS.includes(arg)) throw new Error(`Unknown subcommand: ${arg}. Expected ${COMMANDS.join(', ')}.`);
         options.command = arg;
         continue;
      }
      if (arg.startsWith('--')) seen.add(arg);
      if (arg === '--headed') { options.headed = true; continue; }
      if (arg === '--gpu') { options.gpu = true; continue; }
      if (arg === '--force') { options.force = true; continue; }
      if (arg === '--no-prune') { options.prune = false; continue; }
      if (arg === '--no-overlap') { options.noOverlap = true; continue; }
      if (arg === '--paired') { options.paired = true; continue; }
      const value = requireValue(argv, index, arg);
      index += 1;
      switch (arg) {
         case '--video': options.video = file(value); break;
         case '--atlas': options.atlas = file(value); options.atlases.push(file(value)); break;
         case '--recipe': options.recipe = file(value); break;
         case '--output': options.output = file(value); break;
         case '--out-root': options.outRoot = file(value); break;
         case '--color': core.parseCssColour(value); options.color = value; break;
         case '--zones': {
            const zones = value.split(',').map((z) => z.trim().toLowerCase()).filter(Boolean);
            const bad = zones.filter((z) => !core.ZONES.includes(z));
            if (!zones.length || bad.length) throw new Error(`--zones: unknown zone(s) ${bad.join(', ') || '(none given)'}. Allowed: ${core.ZONES.join(', ')}`);
            options.zones = zones;
            break;
         }
         case '--sample-fps': options.sampleFps = parseNumber(arg, value, { min: 0.1 }); break;
         case '--bin': options.bin = parseNumber(arg, value, { min: 1 }); break;
         case '--max-imprints': options.maxImprints = parseNumber(arg, value, { min: 2, integer: true }); break;
         case '--candidates': options.candidates = parseNumber(arg, value, { min: 1, integer: true }); break;
         case '--anchor-window': {
            const match = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(value);
            if (!match || Number(match[2]) <= Number(match[1])) throw new Error('--anchor-window must look like 0-2 (seconds, start < end).');
            options.anchorWindow = [Number(match[1]), Number(match[2])];
            break;
         }
         case '--max-gap': options.maxGap = parseNumber(arg, value); break;
         case '--trials': options.trials = parseNumber(arg, value, { min: 1, integer: true }); break;
         case '--seed': {
            const seed = Number(value);
            if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new Error('--seed must be an integer between 0 and 4294967295.');
            options.seed = seed;
            break;
         }
         case '--top': options.top = parseNumber(arg, value, { integer: true }); break;
         case '--prune-subset': options.pruneSubset = parseNumber(arg, value, { min: 2, integer: true }); break;
         case '--prune-margin': options.pruneMargin = parseNumber(arg, value); break;
         default: throw new Error(`Unknown option: ${arg}`);
      }
   }
   if (!options.command) throw new Error(`A subcommand is required: ${COMMANDS.join(', ')}.\n${usage()}`);
   // Options that belong to one sub-command only, and pairs that exclude each other.
   const onlyWith = { '--color': 'trial', '--no-overlap': 'trial', '--zones': 'trial', '--paired': 'trial', '--out-root': 'atlas' };
   for (const [opt, command] of Object.entries(onlyWith)) {
      if (seen.has(opt) && options.command !== command) throw new Error(`${opt} is only valid with the ${command} sub-command.`);
   }
   if (seen.has('--color') && seen.has('--paired')) throw new Error('--color and --paired exclude each other: a forced colour draws no palette, so there is nothing to pair.');
   if (seen.has('--out-root') && seen.has('--output')) throw new Error('--out-root and --output exclude each other: --output names the atlas directory itself.');
   if (options.command === 'atlas') {
      if (!options.video) throw new Error('atlas needs --video <file>.');
      if (!fs.existsSync(options.video)) throw new Error(`No such file: ${options.video}`);
   } else if (options.command === 'compare') {
      if (options.atlases.length < 2) throw new Error('compare needs --atlas <pose-atlas.json> at least twice.');
      for (const a of options.atlases) if (!fs.existsSync(a)) throw new Error(`No such file: ${a}`);
   } else {
      if (!options.atlas) throw new Error(`${options.command} needs --atlas <pose-atlas.json>.`);
      if (options.atlases.length > 1) throw new Error(`${options.command} takes one --atlas; compare takes several.`);
      if (!fs.existsSync(options.atlas)) throw new Error(`No such file: ${options.atlas}`);
   }
   if (options.command === 'trial') {
      if (!options.recipe) throw new Error('trial needs --recipe <recipe.json>.');
      if (!fs.existsSync(options.recipe)) throw new Error(`No such file: ${options.recipe}`);
   }
   return options;
}

/**
 * The recipe of a trial run: the file, plus the CLI options that are recipe
 * keys. A key the file already sets to another value is an error rather than
 * a silent override: the recipe id is derived from the result and must mean
 * one thing.
 */
function recipeWithOverrides(options) {
   const raw = JSON.parse(fs.readFileSync(options.recipe, 'utf8'));
   const overrides = {};
   if (options.color !== null) overrides.color = options.color.trim().toLowerCase();
   if (options.noOverlap) overrides.overlap = false;
   if (options.zones) overrides.zones = options.zones;
   if (options.paired) overrides.pairedSeeds = true;
   const same = (key, a, b) => {
      if (key === 'color') { try { return JSON.stringify(core.parseCssColour(a)) === JSON.stringify(core.parseCssColour(b)); } catch { return false; } }
      if (key === 'zones') return JSON.stringify([...a].map(String).sort()) === JSON.stringify([...b].map(String).sort());
      return JSON.stringify(a) === JSON.stringify(b);
   };
   for (const [key, value] of Object.entries(overrides)) {
      if (raw[key] !== undefined && raw[key] !== null && !same(key, raw[key], value)) {
         throw new Error(`${displayPath(options.recipe)} sets ${key} = ${JSON.stringify(raw[key])}; the command line asks for ${JSON.stringify(value)}. Edit the recipe or drop the option.`);
      }
   }
   // The recipe's own spelling wins when both agree, so the recipe id does not depend on how the colour was typed.
   for (const key of Object.keys(overrides)) if (raw[key] !== undefined && raw[key] !== null) delete overrides[key];
   return core.normaliseRecipe({ ...raw, ...overrides });
}

// ---------------------------------------------------------------------------
// ffmpeg
// ---------------------------------------------------------------------------

function requireFfmpeg() {
   for (const tool of ['ffmpeg', 'ffprobe']) {
      const probe = spawnSync(tool, ['-version'], { stdio: 'ignore' });
      if (probe.error || probe.status !== 0) throw new Error(`${tool} is not on PATH. It reads the video frames.`);
   }
}

function probeVideo(file) {
   const result = spawnSync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,nb_frames,duration:format=duration',
      '-of', 'json', file,
   ], { encoding: 'utf8' });
   if (result.status !== 0) throw new Error(`ffprobe could not read ${file}: ${String(result.stderr).trim()}`);
   const json = JSON.parse(result.stdout);
   const stream = json.streams && json.streams[0];
   if (!stream) throw new Error(`${file} has no video stream.`);
   const rate = (text) => { const [a, b] = String(text || '0/1').split('/').map(Number); return b ? a / b : 0; };
   const fps = rate(stream.avg_frame_rate) || rate(stream.r_frame_rate);
   const duration = Number(stream.duration || (json.format && json.format.duration) || 0);
   if (!fps || !duration) throw new Error(`${file}: frame rate or duration unknown.`);
   return { width: stream.width, height: stream.height, fps, duration, frames: Number(stream.nb_frames) || Math.round(duration * fps) };
}

function ffmpeg(args, label) {
   const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
   if (result.status !== 0) throw new Error(`ffmpeg failed (${label}): ${String(result.stderr || '').trim().slice(0, 800)}`);
}

/** Every step-th frame as high-quality JPEG; file k is source frame k * step. */
function extractScanFrames(video, dir, step) {
   fs.mkdirSync(dir, { recursive: true });
   ffmpeg(['-i', video, '-vf', `select='not(mod(n\\,${step}))'`, '-fps_mode', 'vfr', '-q:v', '2', '-start_number', '0', path.join(dir, '%06d.jpg')], 'scan frames');
   return fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
}

/** The given source frames, lossless, in increasing frame order. */
function extractFrames(video, dir, frameNumbers) {
   fs.mkdirSync(dir, { recursive: true });
   const sorted = [...new Set(frameNumbers)].sort((a, b) => a - b);
   const files = new Map();
   // One ffmpeg pass per chunk keeps the select expression short.
   for (let start = 0; start < sorted.length; start += 60) {
      const chunk = sorted.slice(start, start + 60);
      const expr = chunk.map((n) => `eq(n\\,${n})`).join('+');
      const sub = path.join(dir, `chunk-${start}`);
      fs.mkdirSync(sub, { recursive: true });
      ffmpeg(['-i', video, '-vf', `select='${expr}'`, '-fps_mode', 'vfr', '-start_number', '0', path.join(sub, '%06d.png')], 'candidate frames');
      const produced = fs.readdirSync(sub).filter((f) => f.endsWith('.png')).sort();
      if (produced.length !== chunk.length) throw new Error(`ffmpeg returned ${produced.length} frames for ${chunk.length} requested; the video may have a variable frame rate.`);
      chunk.forEach((n, i) => files.set(n, path.join(sub, produced[i])));
   }
   return files;
}

// ---------------------------------------------------------------------------
// Static server: the repository, plus /__atlas/ and /__work/
// ---------------------------------------------------------------------------

const MIME = {
   '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
   '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
   '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.tflite': 'application/octet-stream', '.map': 'application/json',
};

async function startServer(mounts) {
   const server = http.createServer((req, res) => {
      try {
         const url = new URL(req.url, 'http://local');
         let pathname = decodeURIComponent(url.pathname);
         let base = ROOT;
         for (const [prefix, dir] of Object.entries(mounts)) {
            if (pathname.startsWith(prefix)) { base = dir; pathname = pathname.slice(prefix.length - 1); break; }
         }
         const target = path.resolve(base, `.${pathname}`);
         if (!target.startsWith(base)) { res.writeHead(403).end(); return; }
         fs.stat(target, (err, stat) => {
            if (err || !stat.isFile()) { res.writeHead(404).end(); return; }
            res.writeHead(200, {
               'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
               'Content-Length': stat.size,
               'Cache-Control': 'no-store',
            });
            fs.createReadStream(target).pipe(res);
         });
      } catch (error) {
         res.writeHead(500).end(String(error.message));
      }
   });
   await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
   return { baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

function findSystemChrome() {
   if (process.platform !== 'linux') return undefined;
   return ['/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
      .find((candidate) => fs.existsSync(candidate));
}

async function openHarness(options, baseUrl) {
   const args = ['--autoplay-policy=no-user-gesture-required', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'];
   if (options.gpu) args.push('--enable-gpu', '--use-angle=default');
   else args.push('--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader');
   let browser;
   try {
      browser = await chromium.launch({ headless: !options.headed, executablePath: findSystemChrome(), args });
   } catch (error) {
      throw new Error(`Chromium could not be started. Install Playwright's browser once with:\n  npm run prepare:e2e\n\n${String(error.message).split('\n')[0]}`);
   }
   const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
   const logs = [];
   page.on('console', (message) => logs.push(`[${message.type()}] ${message.text()}`.slice(0, 300)));
   page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`.slice(0, 300)));
   progress(`opening the harness (${options.gpu ? 'GPU' : 'swiftshader'})`);
   await page.goto(`${baseUrl}${HARNESS_PATH}`, { waitUntil: 'load' });
   const deadline = Date.now() + 30000;
   while (!(await page.evaluate(() => Boolean(window.fuzzReady)).catch(() => false))) {
      if (Date.now() > deadline) throw new Error(`the harness did not load.\n  ${logs.slice(-5).join('\n  ')}`);
      await page.waitForTimeout(250);
   }
   const call = async (fn, arg, timeoutMs = 600000) => {
      let timer;
      const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`harness ${fn} did not answer within ${timeoutMs / 1000}s`)), timeoutMs); });
      try {
         return await Promise.race([page.evaluate(([name, value]) => window.fuzz[name](value), [fn, arg]), guard]);
      } catch (error) {
         throw new Error(`${error.message.split('\n')[0]}\n  browser log: ${logs.slice(-4).join(' | ') || 'empty'}`);
      } finally {
         clearTimeout(timer);
      }
   };
   const info = await call('init', { gpu: options.gpu, headed: options.headed });
   progress(`harness ready: face-api backend ${info.backend}`);
   return { browser, page, call, info, logs, close: () => browser.close() };
}

// ---------------------------------------------------------------------------
// atlas
// ---------------------------------------------------------------------------

function pearson(xs, ys) {
   const n = xs.length;
   if (n < 3) return null;
   const mx = xs.reduce((a, b) => a + b, 0) / n;
   const my = ys.reduce((a, b) => a + b, 0) / n;
   let sxy = 0; let sxx = 0; let syy = 0;
   for (let i = 0; i < n; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
   return sxx && syy ? core.round(sxy / Math.sqrt(sxx * syy), 3) : null;
}

function presenceGaps(samples, duration) {
   const gaps = [];
   let start = null;
   for (const sample of samples) {
      if (!sample.present && start === null) start = sample.t;
      if (sample.present && start !== null) { gaps.push({ from: start, to: sample.t }); start = null; }
   }
   if (start !== null) gaps.push({ from: start, to: core.round(duration, 3) });
   return gaps.map((g) => ({ from: core.round(g.from, 3), to: core.round(g.to, 3), seconds: core.round(g.to - g.from, 3) }));
}

async function atlas(options) {
   requireFfmpeg();
   const source = probeVideo(options.video);
   const stem = path.basename(options.video, path.extname(options.video)).replace(/[^a-zA-Z0-9._-]+/g, '-') || 'video';
   const dir = options.output || path.join(options.outRoot || DEFAULT_OUTPUT_ROOT, stem);
   const atlasFile = path.join(dir, 'pose-atlas.json');
   if (fs.existsSync(atlasFile) && !options.force) {
      throw new Error(`${displayPath(atlasFile)} exists. Its trials are tied to it; pass --force to replace it, or --output for another directory.`);
   }
   fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });
   for (const old of fs.readdirSync(path.join(dir, 'frames'))) if (/^imprint-\d+\.png$/.test(old)) fs.rmSync(path.join(dir, 'frames', old));

   const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostyle-fuzz-'));
   const server = await startServer({ '/__work/': work, '/__atlas/': dir });
   let harness = null;
   try {
      const step = Math.max(1, Math.round(source.fps / options.sampleFps));
      progress(`${displayPath(options.video)}: ${source.width}x${source.height}, ${source.fps.toFixed(3)} fps, ${source.duration.toFixed(2)} s; scanning every ${step} frame(s)`);
      const scanFiles = extractScanFrames(options.video, path.join(work, 'scan'), step);
      progress(`${scanFiles.length} scan frames extracted`);

      harness = await openHarness(options, server.baseUrl);

      // 1. MediaPipe scan: presence, pose, sharpness.
      const samples = [];
      for (let start = 0; start < scanFiles.length; start += 25) {
         const items = scanFiles.slice(start, start + 25).map((f, i) => ({ n: (start + i) * step, url: `/__work/scan/${f}` }));
         const results = await harness.call('scanFrames', items);
         for (const r of results) samples.push({ ...r, t: core.round(r.n / source.fps, 4) });
         progress(`scanned ${Math.min(start + 25, scanFiles.length)}/${scanFiles.length} frames, face in ${samples.filter((s) => s.present).length}`);
      }
      const present = samples.filter((s) => s.present);
      if (!present.length) throw new Error('MediaPipe found no face in any frame.');
      const gaps = presenceGaps(samples, source.duration);
      for (const g of gaps) if (g.seconds > options.maxGap) progress(`warning: no face from ${g.from}s to ${g.to}s (${g.seconds}s)`);

      // 2. Bins and candidates.
      const binKey = (pose) => core.poseBin(pose, options.bin).join(',');
      const bins = new Map();
      for (const s of present) {
         const key = binKey(s.pose);
         if (!bins.has(key)) bins.set(key, []);
         bins.get(key).push(s);
      }
      const binCentreNorm = (key) => { const [y, p] = key.split(',').map(Number); return Math.hypot((y + 0.5) * options.bin, (p + 0.5) * options.bin); };
      let binKeys = [...bins.keys()].sort((a, b) => binCentreNorm(a) - binCentreNorm(b));
      const windowed = options.anchorWindow ? present.filter((s) => s.t >= options.anchorWindow[0] && s.t <= options.anchorWindow[1]) : present;
      if (!windowed.length) throw new Error(`no face in the anchor window ${options.anchorWindow.join('-')} s.`);
      const anchorCandidates = windowed.slice().sort((a, b) => core.poseNorm(a.pose) - core.poseNorm(b.pose)).slice(0, 6);
      const anchorBin = binKey(anchorCandidates[0].pose);
      if (binKeys.length > options.maxImprints) {
         progress(`${binKeys.length} pose bins filled; keeping the ${options.maxImprints} closest to frontal`);
         binKeys = binKeys.slice(0, options.maxImprints);
         if (!binKeys.includes(anchorBin)) binKeys[binKeys.length - 1] = anchorBin;
      }
      const candidatesByBin = new Map(binKeys.map((key) => [key, bins.get(key).slice().sort((a, b) => b.sharpness - a.sharpness).slice(0, options.candidates)]));
      const wanted = [...anchorCandidates, ...[...candidatesByBin.values()].flat()].map((s) => s.n);
      progress(`${binKeys.length} pose bins; extracting ${new Set(wanted).size} candidate frames losslessly`);
      const pngs = extractFrames(options.video, path.join(work, 'cand'), wanted);

      // 3. MediaPipe + face-api on the candidates.
      const analysis = new Map();
      const pending = [...pngs.entries()];
      for (let start = 0; start < pending.length; start += 10) {
         const items = pending.slice(start, start + 10).map(([n, file]) => ({ key: n, url: `/__work/${path.relative(work, file).split(path.sep).join('/')}` }));
         const results = await harness.call('analyse', items);
         for (const r of results) analysis.set(r.key, r);
         progress(`face-api on candidates ${Math.min(start + 10, pending.length)}/${pending.length}`);
      }
      const usable = (n) => { const a = analysis.get(n); return a && a.mediapipe && a.faceapi ? a : null; };

      // 4. Anchor, then one imprint per bin.
      const anchorSample = anchorCandidates.find((s) => usable(s.n));
      if (!anchorSample) throw new Error('face-api recognised none of the most frontal frames; there is no anchor. Check light and framing, or pass --anchor-window.');
      const chosen = new Map(); // bin key (from the lossless frame's own pose) -> n
      const anchorA = usable(anchorSample.n);
      chosen.set(binKey(anchorA.pose), anchorSample.n);
      const unrecognised = [];
      for (const key of binKeys) {
         let found = false;
         for (const s of candidatesByBin.get(key)) {
            const a = usable(s.n);
            if (!a) continue;
            const actual = binKey(a.pose);
            if (chosen.has(actual)) { found = found || actual === key; continue; }
            chosen.set(actual, s.n);
            found = true;
            break;
         }
         if (!found && !chosen.has(key)) unrecognised.push(key.split(',').map(Number));
      }

      const ordered = [...chosen.entries()].sort((a, b) => a[1] - b[1]);
      const imprints = ordered.map(([key, n], id) => {
         const a = usable(n);
         const framePath = `frames/imprint-${String(id).padStart(4, '0')}.png`;
         fs.copyFileSync(pngs.get(n), path.join(dir, framePath));
         return {
            id,
            t: core.round(n / source.fps, 4),
            frame: n,
            yaw: a.pose.yaw,
            pitch: a.pose.pitch,
            roll: a.pose.roll,
            bin: key.split(',').map(Number),
            width: a.width,
            height: a.height,
            score: a.faceapi.score,
            box: a.faceapi.box,
            sharpness: a.sharpness,
            irisPx: a.irisPx,
            pxPerCm: a.pxPerCm,
            ipdCm: a.ipdCm,
            noise: null,
            framePath,
            descriptor: a.faceapi.descriptor,
            landmarks68: a.faceapi.landmarks68,
            mesh: a.mesh,
            cues: a.cues,
         };
      });
      const noise = core.noiseFloor(imprints);
      imprints.forEach((imp, i) => { imp.noise = noise[i]; });
      const anchorImprint = imprints.find((imp) => imp.frame === anchorSample.n);
      fs.copyFileSync(path.join(dir, anchorImprint.framePath), path.join(dir, 'anchor.png'));
      if (anchorImprint.ipdCm < 5.5 || anchorImprint.ipdCm > 7.5) {
         progress(`warning: inter-pupil distance on the anchor comes out at ${anchorImprint.ipdCm} cm (expected 5.5-7.5): the iris scale may be off`);
      }

      // 5. Skin swatch.
      progress('measuring the skin swatch on the anchor');
      const skin = await harness.call('skinSwatch', { url: `/__atlas/${anchorImprint.framePath}`, mesh: anchorImprint.mesh, pxPerCm: anchorImprint.pxPerCm });
      fs.writeFileSync(path.join(dir, 'skin-mask.jpg'), Buffer.from(skin.maskPreview.split(',')[1], 'base64'));
      delete skin.maskPreview;

      // 6. Pose sign check: the matrix angles must agree with the image cues.
      const signCheck = {
         yaw: pearson(imprints.map((i) => i.yaw), imprints.map((i) => i.cues.yawCue)),
         pitch: pearson(imprints.map((i) => i.pitch), imprints.map((i) => -i.cues.pitchCue)),
         roll: pearson(imprints.map((i) => i.roll), imprints.map((i) => i.cues.rollCue)),
      };
      if (Object.values(signCheck).some((r) => r !== null && r < 0)) {
         progress(`warning: pose angle signs disagree with the image cues (${JSON.stringify(signCheck)}); see POSE_SIGN in fuzz-core.mjs`);
      }

      const noiseValues = noise.filter((v) => v !== null);
      const result = {
         schema: 1,
         tool: TOOL,
         createdAt: new Date().toISOString(),
         source: {
            file: displayPath(options.video),
            sha256FirstMiB: sha256FirstMiB(options.video),
            ...source,
         },
         config: {
            sampleFps: options.sampleFps, scanStep: step, bin: options.bin, maxImprints: options.maxImprints,
            candidates: options.candidates, anchorWindow: options.anchorWindow, maxGap: options.maxGap,
            threshold: core.MATCH_THRESHOLD, harness: harness.info,
         },
         anchorId: anchorImprint.id,
         skinSwatch: skin,
         presence: {
            samples: samples.map((s) => (s.present ? { t: s.t, present: true, yaw: s.pose.yaw, pitch: s.pose.pitch, roll: s.pose.roll } : { t: s.t, present: false })),
            gaps,
            presentShare: core.round(present.length / samples.length, 4),
         },
         noiseFloor: { median: core.round(core.median(noiseValues), 4), p90: core.round(core.quantile(noiseValues, 0.9), 4) },
         poseSignCheck: signCheck,
         unrecognisedBins: unrecognised,
         imprints,
      };
      fs.writeFileSync(atlasFile, `${JSON.stringify(result)}\n`);

      const yaws = imprints.map((i) => i.yaw);
      const pitches = imprints.map((i) => i.pitch);
      out();
      out(`atlas    : ${displayPath(atlasFile)}`);
      out(`source   : ${result.source.file}  ${source.width}x${source.height}  ${source.fps.toFixed(2)} fps  ${source.duration.toFixed(2)} s`);
      out(`presence : face in ${(100 * result.presence.presentShare).toFixed(1)}% of ${samples.length} samples; ${gaps.length ? gaps.map((g) => `gap ${g.from}-${g.to}s`).join(', ') : 'no gaps'}`);
      out(`imprints : ${imprints.length}  yaw ${Math.min(...yaws).toFixed(0)}..${Math.max(...yaws).toFixed(0)}°  pitch ${Math.min(...pitches).toFixed(0)}..${Math.max(...pitches).toFixed(0)}°  (${unrecognised.length} bin(s) seen but not recognised by face-api)`);
      out(`anchor   : imprint ${anchorImprint.id} at ${anchorImprint.t}s, yaw ${anchorImprint.yaw}° pitch ${anchorImprint.pitch}° roll ${anchorImprint.roll}°, ${anchorImprint.pxPerCm} px/cm, IPD ${anchorImprint.ipdCm} cm`);
      out(`skin     : L* ${skin.lab[0]} a* ${skin.lab[1]} b* ${skin.lab[2]} (${skin.hexForDisplay}), L* p10-p90 ${skin.lRange.join('-')}, ${skin.pixels} px`);
      out(`noise    : clean drift between neighbouring poses, median ${result.noiseFloor.median}, p90 ${result.noiseFloor.p90}`);
      out(`next     : node scripts-dev/ghostyle-fuzz.cjs trial --atlas ${displayPath(atlasFile)} --recipe scripts-dev/ghostyle-fuzz/recipes/three-bands.json --trials 20`);
   } finally {
      if (harness) await harness.close();
      await server.close();
      fs.rmSync(work, { recursive: true, force: true });
   }
}

function sha256FirstMiB(file) {
   const fd = fs.openSync(file, 'r');
   try {
      const buffer = Buffer.alloc(1024 * 1024);
      const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
      return crypto.createHash('sha256').update(buffer.subarray(0, read)).digest('hex');
   } finally {
      fs.closeSync(fd);
   }
}

// ---------------------------------------------------------------------------
// trial
// ---------------------------------------------------------------------------

function readAtlas(file) {
   const data = JSON.parse(fs.readFileSync(file, 'utf8'));
   if (data.schema !== 1 || !Array.isArray(data.imprints)) throw new Error(`${displayPath(file)} is not a pose atlas written by this tool.`);
   return data;
}

function readNdjson(file) {
   if (!fs.existsSync(file)) return [];
   return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line, i) => {
      try { return JSON.parse(line); } catch (error) { throw new Error(`${displayPath(file)} line ${i + 1} is not JSON`); }
   });
}

function profileCsv(rows) {
   const header = ['id', 't', 'yaw', 'pitch', 'detection', 'score', 'dPair', 'dAtlas', 'nearestId', 'noise', 'escaped'];
   const lines = rows.map((r) => header.map((key) => (key === 'escaped' ? core.escapes(r) : (r[key] ?? ''))).join(','));
   return `${header.join(',')}\n${lines.join('\n')}\n`;
}

async function trial(options) {
   const atlasData = readAtlas(options.atlas);
   const dir = path.dirname(options.atlas);
   const recipe = recipeWithOverrides(options);
   const recipeId = `${recipe.name}-${core.recipeHash(recipe)}`;
   const masterSeed = options.seed ?? crypto.randomBytes(4).readUInt32BE(0);
   const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '')}-${masterSeed}`;
   const ndjson = path.join(dir, 'trials.ndjson');
   const colours = recipe.color ? `colour ${recipe.color} (forced)` : `palette ${recipe.palette.size} (${recipe.palette.contrast}${recipe.pairedSeeds ? ', paired seeds' : ''})`;
   const constraints = [recipe.overlap === false ? 'no overlap' : null, recipe.zones ? `zones ${recipe.zones.join('+')}` : null].filter(Boolean).join(', ');
   progress(`recipe ${recipeId}: ${recipe.count} × ${recipe.shape} ${recipe.lengthCm}×${recipe.widthCm} cm, opacity ${recipe.opacity}, ${colours}${constraints ? `, ${constraints}` : ''}`);
   progress(`master seed ${masterSeed}${options.seed === null ? ' (random; pass --seed to repeat)' : ''}, ${options.trials} trial(s)`);

   const server = await startServer({ '/__atlas/': dir });
   let harness = null;
   let stop = false;
   const onSigint = () => { if (stop) process.exit(130); stop = true; progress('Ctrl-C: stopping after the current trial (again to quit now)'); };
   process.on('SIGINT', onSigint);
   try {
      harness = await openHarness(options, server.baseUrl);
      const loaded = await harness.call('loadAtlas', { atlasUrl: '/__atlas/pose-atlas.json', recipe, recipeId });
      progress(`atlas loaded: ${loaded.imprints} imprints`);
      const drift = await harness.call('control');
      const driftValues = drift.filter((v) => v !== null);
      const controlDrift = { max: core.round(Math.max(...driftValues), 6), median: core.round(core.median(driftValues), 6), missing: drift.length - driftValues.length };
      progress(`control: clean frames re-described, descriptor drift median ${controlDrift.median}, max ${controlDrift.max}${controlDrift.missing ? `, ${controlDrift.missing} not found again` : ''}`);
      if (controlDrift.max > 0.05) progress('warning: this environment describes the clean frames differently from the atlas run (GPU vs swiftshader?); distances below are shifted by up to that much');

      const header = { type: 'run', runId, tool: TOOL, startedAt: new Date().toISOString(), masterSeed, trials: options.trials, recipe, recipeId, backend: harness.info.backend, gpu: options.gpu, controlDrift, prune: options.prune ? { subset: options.pruneSubset, margin: options.pruneMargin, top: options.top } : null };
      fs.appendFileSync(ndjson, `${JSON.stringify(header)}\n`);

      const subset = options.prune && atlasData.imprints.length > options.pruneSubset ? core.stratifiedSubset(atlasData.imprints, options.pruneSubset) : [];
      const completed = [];
      const all = [];
      for (let k = 0; k < options.trials && !stop; k += 1) {
         const seed = core.trialSeed(masterSeed, k);
         let prune = null;
         if (subset.length && options.top > 0 && completed.length >= options.top) {
            const kth = (cmp) => completed.slice().sort(cmp)[options.top - 1].scores;
            prune = {
               escape: kth((a, b) => b.scores.escapeRate - a.scores.escapeRate).escapeRate,
               worst: core.worstCaseValue(kth((a, b) => core.worstCaseValue(b.scores) - core.worstCaseValue(a.scores))),
               margin: options.pruneMargin,
            };
            if (!Number.isFinite(prune.worst)) prune.worst = 1e9;
         }
         const result = await harness.call('runTrial', { seed, subset, prune });
         const scores = core.scoreProfile(result.rows);
         const line = { type: 'trial', runId, recipeId, seed, k, pruned: result.pruned, scores, coverage: result.coverage, palette: result.palette, strokes: result.strokes, rows: result.rows, ms: result.ms };
         fs.appendFileSync(ndjson, `${JSON.stringify(line)}\n`);
         all.push(line);
         if (!result.pruned) completed.push(line);
         progress(`trial ${k + 1}/${options.trials} seed ${seed}: ${result.pruned ? `pruned after ${result.rows.length} imprints` : `escape ${(100 * scores.escapeRate).toFixed(1)}% (lost ${(100 * scores.lostRate).toFixed(1)}% + descriptor ${(100 * scores.descriptorEscape).toFixed(1)}%)  worst ${scores.allLost ? 'all lost' : scores.worstCase}  coverage ${(100 * result.coverage).toFixed(1)}%`}  (${(result.ms / 1000).toFixed(1)} s)`);
      }

      const top = core.selectTop(completed, options.top);
      const front = core.paretoFront(completed);
      if (top.length) progress(`materialising ${top.length} trial(s)`);
      for (const line of top) {
         const folder = path.join(dir, 'runs', `${recipeId}-${line.seed}`);
         fs.mkdirSync(folder, { recursive: true });
         const extraComment = [
            `scores       : escapeRate ${line.scores.escapeRate} (lostRate ${line.scores.lostRate} + descriptorEscape ${line.scores.descriptorEscape}), worstCase ${line.scores.allLost ? 'all lost' : line.scores.worstCase}, medianMargin ${line.scores.medianMargin}, lost ${line.scores.lost}/${line.scores.imprints}, coverage ${line.coverage}${front.has(line) ? ', Pareto front' : ''}`,
            `measured     : ${TOOL}, run ${runId}, face-api ${harness.info.backend}, threshold ${core.MATCH_THRESHOLD}; this lab only, not a claim of protection`,
         ].join('\n');
         const made = await harness.call('materialise', { seed: line.seed, extraComment, rows: line.rows });
         fs.writeFileSync(path.join(folder, 'anchor-overlay.jpg'), Buffer.from(made.jpeg.split(',')[1], 'base64'));
         fs.writeFileSync(path.join(folder, 'poses-overlay.jpg'), Buffer.from(made.sheet.split(',')[1], 'base64'));
         fs.writeFileSync(path.join(folder, `ghostyle-fuzz-${line.seed}.js`), made.source);
         fs.writeFileSync(path.join(folder, 'evasion-profile.csv'), profileCsv(line.rows));
         fs.writeFileSync(path.join(folder, 'trial.json'), `${JSON.stringify({ ...line, recipe, atlas: displayPath(options.atlas) }, null, 1)}\n`);
      }

      out();
      out(`run      : ${runId}  (${all.length} trial(s), ${all.filter((l) => l.pruned).length} pruned)`);
      out(`log      : ${displayPath(ndjson)}`);
      if (completed.length) {
         const best = top[0];
         out(`best     : seed ${best.seed}  escape ${(100 * best.scores.escapeRate).toFixed(1)}%  worst ${best.scores.allLost ? 'all lost' : best.scores.worstCase}`);
         out(`pareto   : ${[...front].map((l) => l.seed).join(', ')}`);
         out(`files    : ${displayPath(path.join(dir, 'runs'))}/${recipeId}-<seed>/`);
      }
      out(`next     : node scripts-dev/ghostyle-fuzz.cjs report --atlas ${displayPath(options.atlas)}`);
   } finally {
      process.off('SIGINT', onSigint);
      if (harness) await harness.close();
      await server.close();
   }
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

/**
 * The trial lines of an atlas directory, one per (recipe, seed): the latest
 * line, a complete sweep beating a pruned one. Scores written by 1.0.0 get the
 * 1.1.0 split (lostRate, descriptorEscape) recomputed from their rows.
 */
function loadTrials(dir) {
   const lines = readNdjson(path.join(dir, 'trials.ndjson'));
   const runs = lines.filter((l) => l.type === 'run');
   const byKey = new Map();
   for (const line of lines.filter((l) => l.type === 'trial')) {
      const key = `${line.recipeId}#${line.seed}`;
      const previous = byKey.get(key);
      if (!previous || previous.pruned || !line.pruned) byKey.set(key, line);
   }
   const trials = [...byKey.values()].map((line) => ({ ...line, scores: { ...core.scoreProfile(line.rows), ...line.scores } }));
   return { runs, trials, recipeOf: new Map(runs.map((r) => [r.runId, r.recipe])) };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pctText = (v, digits = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${(100 * v).toFixed(digits)}%`);
function table(rows, header) {
   const widths = header.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
   const line = (cells) => cells.map((c, i) => (i === 0 ? String(c).padEnd(widths[i]) : String(c).padStart(widths[i]))).join('  ');
   return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

/** Per-recipe summary of one atlas's trials, as printed by report and compare. */
function recipeSummaryRows(trials) {
   const byRecipe = new Map();
   for (const t of trials) { if (!byRecipe.has(t.recipeId)) byRecipe.set(t.recipeId, []); byRecipe.get(t.recipeId).push(t); }
   const rows = [];
   for (const [recipeId, list] of byRecipe) {
      const complete = list.filter((t) => !t.pruned);
      const pool = complete.length ? complete : list;
      const allRows = pool.flatMap((t) => t.rows);
      const detected = allRows.filter((r) => r.detection !== 'lost');
      const best = pool.slice().sort((a, b) => (b.scores.escapeRate - a.scores.escapeRate) || (core.worstCaseValue(b.scores) - core.worstCaseValue(a.scores)))[0];
      rows.push({
         recipeId,
         trials: list.length,
         complete: complete.length,
         escape: mean(pool.map((t) => t.scores.escapeRate)),
         lostRate: mean(pool.map((t) => t.scores.lostRate)),
         descriptorEscape: mean(pool.map((t) => t.scores.descriptorEscape)),
         descriptorEscapeDetected: detected.length ? detected.filter((r) => r.dAtlas >= core.MATCH_THRESHOLD).length / detected.length : null,
         coverage: mean(pool.map((t) => t.coverage)),
         secondsPerTrial: mean(list.map((t) => t.ms)) / 1000,
         best,
      });
   }
   return rows;
}

function printRecipeSummary(rows) {
   out(table(rows.map((r) => [
      r.recipeId, r.trials, r.complete, pctText(r.escape), pctText(r.lostRate), pctText(r.descriptorEscape), pctText(r.descriptorEscapeDetected), pctText(r.coverage),
      r.best ? `${r.best.seed} (${pctText(r.best.scores.escapeRate, 0)})` : '—',
   ]), ['recipe', 'trials', 'complete', 'escape', '= lost', '+ descriptor', 'descr|detected', 'face covered', 'best seed']));
   out('escape = share of imprints that escaped; lost = detector found no face; descriptor = face found but ≥ threshold from every clean imprint;');
   out('descr|detected = the same over detected imprints only; face covered = share of the face oval under the strokes (means over complete sweeps).');
}

function report(options) {
   const atlasData = readAtlas(options.atlas);
   const dir = path.dirname(options.atlas);
   const outputFile = options.output || path.join(dir, 'report.html');
   const rel = (file) => path.relative(path.dirname(outputFile), file).split(path.sep).join('/');
   const { runs, trials: loaded, recipeOf } = loadTrials(dir);
   const trials = loaded.map((line) => {
      const folder = path.join(dir, 'runs', `${line.recipeId}-${line.seed}`);
      const files = fs.existsSync(path.join(folder, 'anchor-overlay.jpg')) ? {
         image: rel(path.join(folder, 'anchor-overlay.jpg')),
         ghostyle: rel(path.join(folder, `ghostyle-fuzz-${line.seed}.js`)),
         csv: rel(path.join(folder, 'evasion-profile.csv')),
         sheet: rel(path.join(folder, 'poses-overlay.jpg')),
      } : null;
      return {
         recipeId: line.recipeId,
         recipe: recipeOf.get(line.runId),
         seed: line.seed,
         runId: line.runId,
         pruned: line.pruned,
         scores: line.scores,
         coverage: line.coverage,
         palette: line.palette,
         strokes: line.strokes.map(({ uvPolygon, ...rest }) => rest),
         rows: line.rows,
         files,
      };
   });
   const data = {
      tool: TOOL,
      generatedAt: new Date().toISOString(),
      threshold: core.MATCH_THRESHOLD,
      atlasArg: displayPath(options.atlas),
      anchorImage: rel(path.join(dir, 'anchor.png')),
      atlas: {
         source: atlasData.source,
         config: atlasData.config,
         anchorId: atlasData.anchorId,
         skinSwatch: atlasData.skinSwatch,
         presence: { gaps: atlasData.presence.gaps, presentShare: atlasData.presence.presentShare },
         unrecognisedBins: atlasData.unrecognisedBins,
         noiseFloor: atlasData.noiseFloor,
         imprints: atlasData.imprints.map((imp) => ({ id: imp.id, t: imp.t, yaw: imp.yaw, pitch: imp.pitch, roll: imp.roll, bin: imp.bin, noise: imp.noise, width: imp.width, height: imp.height })),
      },
      runs: runs.map(({ runId, startedAt, masterSeed, trials: n, recipeId, backend, gpu, controlDrift }) => ({ runId, startedAt, masterSeed, trials: n, recipeId, backend, gpu, controlDrift })),
      trials,
   };
   fs.mkdirSync(path.dirname(outputFile), { recursive: true });
   fs.writeFileSync(outputFile, buildReportHtml(data));
   out();
   printRecipeSummary(recipeSummaryRows(loaded));
   out();
   out(`report   : ${displayPath(outputFile)}  (${trials.length} trial(s), ${runs.length} run(s))`);
}

// ---------------------------------------------------------------------------
// compare
// ---------------------------------------------------------------------------

/** Spearman rank correlation (average ranks on ties). */
function spearman(xs, ys) {
   const ranks = (values) => {
      const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
      const r = new Array(values.length);
      for (let i = 0; i < order.length;) {
         let j = i;
         while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
         const avg = (i + j) / 2 + 1;
         for (let k = i; k <= j; k += 1) r[order[k][1]] = avg;
         i = j + 1;
      }
      return r;
   };
   return pearson(ranks(xs), ranks(ys));
}

function compare(options) {
   const text = [];
   const say = (line = '') => { text.push(line); out(line); };
   const faces = options.atlases.map((file) => {
      const atlas = readAtlas(file);
      const dir = path.dirname(file);
      const name = path.basename(dir);
      return { file, dir, name, atlas, ...loadTrials(dir) };
   });
   const names = faces.map((f) => f.name);
   if (new Set(names).size !== names.length) throw new Error('compare: the atlas directories must have distinct names.');

   say(`${TOOL} compare: ${names.join(', ')}`);
   say();
   say('1. Image quality: what each atlas offers face-api, and the variables that decide how hard it is');
   say(table(faces.map((f) => {
      const imps = f.atlas.imprints;
      const anchor = imps.find((i) => i.id === f.atlas.anchorId);
      const yaws = imps.map((i) => i.yaw); const pitches = imps.map((i) => i.pitch);
      const med = (xs) => core.median(xs);
      return [
         f.name, `${f.atlas.source.width}×${f.atlas.source.height}`, f.atlas.source.duration.toFixed(1), imps.length,
         `${Math.min(...yaws).toFixed(0)}..${Math.max(...yaws).toFixed(0)}`, `${Math.min(...pitches).toFixed(0)}..${Math.max(...pitches).toFixed(0)}`,
         anchor.pxPerCm.toFixed(1), med(imps.map((i) => i.sharpness)).toFixed(0), mean(imps.map((i) => i.score)).toFixed(2),
         `${f.atlas.noiseFloor.median} / ${f.atlas.noiseFloor.p90}`, f.atlas.skinSwatch.lab[0].toFixed(1), f.atlas.unrecognisedBins.length, pctText(f.atlas.presence.presentShare, 0), f.atlas.presence.gaps.length,
      ];
   }), ['atlas', 'frame', 'seconds', 'imprints', 'yaw °', 'pitch °', 'px/cm', 'sharpness', 'clean score', 'noise med / p90', 'skin L*', 'unrecognised bins', 'presence', 'gaps']));
   say('px/cm: face scale on the anchor (iris = 1.17 cm); sharpness: variance of the Laplacian on the face crop, higher = crisper (motion blur and soft focus lower it);');
   say('clean score: face-api detection confidence on the clean imprints (0.5 is the detection threshold; the weak pass goes down to 0.1);');
   say('noise: descriptor distance between neighbouring clean poses (median / 90th percentile; the identity threshold is 0.6);');
   say('unrecognised bins: poses MediaPipe saw but face-api never recognised clean, so they cannot be measured.');

   say();
   say('2. Outcome per recipe and atlas');
   const recipeIds = [...new Set(faces.flatMap((f) => f.trials.map((t) => t.recipeId)))].sort();
   const summaryRows = [];
   for (const recipeId of recipeIds) {
      for (const f of faces) {
         const row = recipeSummaryRows(f.trials.filter((t) => t.recipeId === recipeId))[0];
         if (row) summaryRows.push([recipeId, f.name, row.trials, row.complete, pctText(row.escape), pctText(row.lostRate), pctText(row.descriptorEscape), pctText(row.descriptorEscapeDetected), pctText(row.coverage), row.secondsPerTrial.toFixed(1)]);
      }
   }
   say(table(summaryRows, ['recipe', 'atlas', 'trials', 'complete', 'escape', '= lost', '+ descriptor', 'descr|detected', 'face covered', 's/trial']));
   say('means over complete sweeps; escapeRate is not comparable across atlases of different size and pose range, the split tells which mechanism moved.');

   say();
   say('3. Same seed, same design, different face');
   say('A seed names the same strokes on every face only when the palette did not consume randomness (--color) or had its own stream (--paired);');
   say('with a 1.0.0 recipe the palette rejections depend on the skin, so most seeds draw different strokes on different faces and are not comparable.');
   for (const recipeId of recipeIds) {
      const having = faces.filter((f) => f.trials.some((t) => t.recipeId === recipeId));
      if (having.length < 2) continue;
      const bySeed = having.map((f) => new Map(f.trials.filter((t) => t.recipeId === recipeId).map((t) => [t.seed, t])));
      const shared = [...bySeed[0].keys()].filter((seed) => bySeed.every((m) => m.has(seed)));
      const signature = (t) => JSON.stringify(t.strokes.map((s) => [s.centreIndex, s.angleDeg]));
      const matched = shared.filter((seed) => { const sig = signature(bySeed[0].get(seed)); return bySeed.every((m) => signature(m.get(seed)) === sig); });
      say();
      say(`${recipeId}: ${shared.length} seed(s) run on all of ${having.map((f) => f.name).join(', ')}; ${matched.length} draw the same strokes everywhere`);
      if (matched.length < 3) continue;
      for (let i = 0; i < having.length; i += 1) {
         for (let j = i + 1; j < having.length; j += 1) {
            const both = matched.filter((seed) => !bySeed[i].get(seed).pruned && !bySeed[j].get(seed).pruned);
            if (both.length < 5) continue;
            const rho = spearman(both.map((s) => bySeed[i].get(s).scores.escapeRate), both.map((s) => bySeed[j].get(s).scores.escapeRate));
            say(`   ${having[i].name} vs ${having[j].name}: ${both.length} complete pairs, mean escape ${pctText(mean(both.map((s) => bySeed[i].get(s).scores.escapeRate)))} vs ${pctText(mean(both.map((s) => bySeed[j].get(s).scores.escapeRate)))}, Spearman rank correlation ${rho === null ? '—' : rho.toFixed(2)}`);
         }
      }
      const ranked = matched.map((seed) => {
         const ts = bySeed.map((m) => m.get(seed));
         const esc = ts.map((t) => t.scores.escapeRate);
         return { seed, ts, esc, min: Math.min(...esc), mean: mean(esc) };
      }).sort((a, b) => (b.min - a.min) || (b.mean - a.mean));
      const top = ranked.slice(0, 15);
      say(table(top.map((r) => [r.seed, ...r.ts.map((t) => `${pctText(t.scores.escapeRate, 0)} (${pctText(t.scores.lostRate, 0)}+${pctText(t.scores.descriptorEscape, 0)})${t.pruned ? '*' : ''}`), pctText(r.min, 0), pctText(r.mean, 0)]),
         ['seed', ...having.map((f) => `${f.name} escape (lost+descr)`), 'min', 'mean']));
      say('   designs ranked by their worst face (min), the robust ones first; * = pruned sweep, measured on the subset only');
   }
   if (options.output) {
      fs.mkdirSync(path.dirname(options.output), { recursive: true });
      fs.writeFileSync(options.output, `${text.join('\n')}\n`);
      out();
      out(`compare  : ${displayPath(options.output)}`);
   }
}

// ---------------------------------------------------------------------------

async function main() {
   await loadCore(); // parseArgs validates --color and --zones with the core
   const options = parseArgs(process.argv.slice(2));
   progress(`${TOOL}: ${options.command}`);
   if (options.command === 'atlas') await atlas(options);
   if (options.command === 'trial') await trial(options);
   if (options.command === 'report') report(options);
   if (options.command === 'compare') compare(options);
   progress('done');
}

main().catch((error) => {
   process.stderr.write(`\n${String(error && error.message || error)}\n`);
   process.exit(1);
});
