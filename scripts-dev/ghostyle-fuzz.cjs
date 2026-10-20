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

const VERSION = '1.0.0';
const TOOL = `ghostyle-fuzz ${VERSION}`;
const ROOT = path.resolve(__dirname, '..');
const HARNESS_PATH = '/scripts-dev/ghostyle-fuzz/harness.html';
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, 'scratch', 'fuzz');
const COMMANDS = ['atlas', 'trial', 'report'];

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
  node scripts-dev/ghostyle-fuzz.cjs atlas  --video <file> [options]
  node scripts-dev/ghostyle-fuzz.cjs trial  --atlas <pose-atlas.json> --recipe <recipe.json> [options]
  node scripts-dev/ghostyle-fuzz.cjs report --atlas <pose-atlas.json> [--output <file.html>]

atlas (once per video):
  --video <file>          Source video (any format ffmpeg reads). Never modified.
  --output <dir>          Atlas directory (default: scratch/fuzz/<video-stem>/)
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
  Ctrl-C stops after the current trial and still materialises the top.

report:
  --atlas <file>          A pose-atlas.json
  --output <file>         Report file (default: <atlas dir>/report.html)

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
   };
   const file = (raw) => path.resolve(process.cwd(), raw);
   for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index];
      if (arg === '--help' || arg === '-h') { process.stdout.write(usage()); process.exit(0); }
      if (arg === '--version' || arg === '-V') { out(TOOL); process.exit(0); }
      if (!arg.startsWith('--') && !options.command) {
         if (!COMMANDS.includes(arg)) throw new Error(`Unknown subcommand: ${arg}. Expected ${COMMANDS.join(', ')}.`);
         options.command = arg;
         continue;
      }
      if (arg === '--headed') { options.headed = true; continue; }
      if (arg === '--gpu') { options.gpu = true; continue; }
      if (arg === '--force') { options.force = true; continue; }
      if (arg === '--no-prune') { options.prune = false; continue; }
      const value = requireValue(argv, index, arg);
      index += 1;
      switch (arg) {
         case '--video': options.video = file(value); break;
         case '--atlas': options.atlas = file(value); break;
         case '--recipe': options.recipe = file(value); break;
         case '--output': options.output = file(value); break;
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
   if (options.command === 'atlas') {
      if (!options.video) throw new Error('atlas needs --video <file>.');
      if (!fs.existsSync(options.video)) throw new Error(`No such file: ${options.video}`);
   } else {
      if (!options.atlas) throw new Error(`${options.command} needs --atlas <pose-atlas.json>.`);
      if (!fs.existsSync(options.atlas)) throw new Error(`No such file: ${options.atlas}`);
   }
   if (options.command === 'trial') {
      if (!options.recipe) throw new Error('trial needs --recipe <recipe.json>.');
      if (!fs.existsSync(options.recipe)) throw new Error(`No such file: ${options.recipe}`);
   }
   return options;
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
   const dir = options.output || path.join(DEFAULT_OUTPUT_ROOT, stem);
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
   const recipe = core.normaliseRecipe(JSON.parse(fs.readFileSync(options.recipe, 'utf8')));
   const recipeId = `${recipe.name}-${core.recipeHash(recipe)}`;
   const masterSeed = options.seed ?? crypto.randomBytes(4).readUInt32BE(0);
   const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '')}-${masterSeed}`;
   const ndjson = path.join(dir, 'trials.ndjson');
   progress(`recipe ${recipeId}: ${recipe.count} × ${recipe.shape} ${recipe.lengthCm}×${recipe.widthCm} cm, opacity ${recipe.opacity}, palette ${recipe.palette.size} (${recipe.palette.contrast})`);
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
         progress(`trial ${k + 1}/${options.trials} seed ${seed}: ${result.pruned ? `pruned after ${result.rows.length} imprints` : `escape ${(100 * scores.escapeRate).toFixed(1)}%  worst ${scores.allLost ? 'all lost' : scores.worstCase}  lost ${scores.lost}/${scores.imprints}`}  (${(result.ms / 1000).toFixed(1)} s)`);
      }

      const top = core.selectTop(completed, options.top);
      const front = core.paretoFront(completed);
      if (top.length) progress(`materialising ${top.length} trial(s)`);
      for (const line of top) {
         const folder = path.join(dir, 'runs', `${recipeId}-${line.seed}`);
         fs.mkdirSync(folder, { recursive: true });
         const extraComment = [
            `scores       : escapeRate ${line.scores.escapeRate}, worstCase ${line.scores.allLost ? 'all lost' : line.scores.worstCase}, medianMargin ${line.scores.medianMargin}, lost ${line.scores.lost}/${line.scores.imprints}${front.has(line) ? ', Pareto front' : ''}`,
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

function report(options) {
   const atlasData = readAtlas(options.atlas);
   const dir = path.dirname(options.atlas);
   const outputFile = options.output || path.join(dir, 'report.html');
   const rel = (file) => path.relative(path.dirname(outputFile), file).split(path.sep).join('/');
   const lines = readNdjson(path.join(dir, 'trials.ndjson'));
   const runs = lines.filter((l) => l.type === 'run');
   const recipeOf = new Map(runs.map((r) => [r.runId, r.recipe]));
   // Latest line per (recipe, seed); a complete sweep beats a pruned one.
   const byKey = new Map();
   for (const line of lines.filter((l) => l.type === 'trial')) {
      const key = `${line.recipeId}#${line.seed}`;
      const previous = byKey.get(key);
      if (!previous || previous.pruned || !line.pruned) byKey.set(key, line);
   }
   const trials = [...byKey.values()].map((line) => {
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
   out(`report   : ${displayPath(outputFile)}  (${trials.length} trial(s), ${runs.length} run(s))`);
}

// ---------------------------------------------------------------------------

async function main() {
   const options = parseArgs(process.argv.slice(2));
   await loadCore();
   progress(`${TOOL}: ${options.command}`);
   if (options.command === 'atlas') await atlas(options);
   if (options.command === 'trial') await trial(options);
   if (options.command === 'report') report(options);
   progress('done');
}

main().catch((error) => {
   process.stderr.write(`\n${String(error && error.message || error)}\n`);
   process.exit(1);
});
