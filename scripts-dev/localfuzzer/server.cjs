#!/usr/bin/env node
/**
 * Local fuzzer web service: a web page around scripts-dev/ghostyle-fuzz.cjs.
 *
 *   npm run localfuzzer            → http://127.0.0.1:11111
 *
 * Upload a video, pick a preset (or edit every option of atlas and trial),
 * and the job runs in a queue, one at a time: atlas, one trial run per
 * "cell" (recipe + options), a report after each cell and at the end. The page
 * shows progress, an estimate of the time left, the log, the results and the
 * Ghostyles to download. Everything lives under the data directory; nothing
 * leaves the machine.
 *
 * Environment:
 *   LOCALFUZZER_PORT           default 11111
 *   LOCALFUZZER_HOST           default 127.0.0.1 (the Docker image sets 0.0.0.0 and is
 *                              published on 127.0.0.1 only, see Dockerfile)
 *   LOCALFUZZER_DATA           default scratch/localfuzzer (the image uses /data)
 *   LOCALFUZZER_MAX_UPLOAD_MB  default 4096
 *   LOCALFUZZER_ALLOWED_HOSTS  extra Host header names accepted, comma-separated
 *                              (default: localhost, 127.0.0.1, [::1])
 *
 * No dependency beyond Node, ffmpeg/ffprobe, zip (optional; tar.gz otherwise)
 * and what ghostyle-fuzz.cjs itself needs. Documentation:
 * tutorials/localfuzzer-docker.md.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const lf = require('./jobs-core.cjs');

const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..', '..');
const FUZZ_CLI = path.join(ROOT, 'scripts-dev', 'ghostyle-fuzz.cjs');
const RECIPES_DIR = path.join(ROOT, 'scripts-dev', 'ghostyle-fuzz', 'recipes');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.LOCALFUZZER_PORT || 11111);
const HOST = process.env.LOCALFUZZER_HOST || '127.0.0.1';
const DATA = path.resolve(process.env.LOCALFUZZER_DATA || path.join(ROOT, 'scratch', 'localfuzzer'));
const JOBS_DIR = path.join(DATA, 'jobs');
const UPLOADS_DIR = path.join(DATA, 'uploads');
const COMPARE_DIR = path.join(DATA, 'compare');
const SETTINGS_FILE = path.join(DATA, 'settings.json');
const MAX_UPLOAD = Number(process.env.LOCALFUZZER_MAX_UPLOAD_MB || 4096) * 1024 * 1024;
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', ...(process.env.LOCALFUZZER_ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)]);
const STOP_GRACE_MS = 100000; // SIGINT lets the fuzzer finish its trial and materialise the top

let fuzzCore = null; // fuzz-core.mjs, loaded at start
let toolVersion = '?';
const HAS_ZIP = spawnSync('zip', ['-v'], { stdio: 'ignore' }).status === 0;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function log(message) { process.stdout.write(`[localfuzzer ${new Date().toISOString()}] ${message}\n`); }

function writeJsonAtomic(file, value) {
   const tmp = `${file}.${process.pid}.tmp`;
   fs.writeFileSync(tmp, `${JSON.stringify(value, null, 1)}\n`);
   fs.renameSync(tmp, file);
}

function readJson(file, fallback = null) {
   try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function slug(text, max = 40) {
   return String(text || '').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'video';
}

function newJobId() {
   const d = new Date();
   const p = (n) => String(n).padStart(2, '0');
   return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${crypto.randomBytes(2).toString('hex')}`;
}

function bundledRecipes() {
   const out = {};
   for (const f of fs.readdirSync(RECIPES_DIR).filter((x) => x.endsWith('.json')).sort()) {
      const json = readJson(path.join(RECIPES_DIR, f));
      if (json) out[f] = json;
   }
   return out;
}

function planContext() {
   return { recipes: bundledRecipes(), parseColour: fuzzCore.parseCssColour, normaliseRecipe: fuzzCore.normaliseRecipe };
}

/** The recipe id the fuzzer will log for a cell (mirrors recipeWithOverrides in ghostyle-fuzz.cjs). */
function cellRecipeId(cell, recipeJson) {
   const overrides = {};
   if (cell.color) overrides.color = cell.color;
   if (cell.noOverlap) overrides.overlap = false;
   if (cell.zones) overrides.zones = cell.zones;
   if (cell.paired) overrides.pairedSeeds = true;
   for (const key of Object.keys(overrides)) if (recipeJson[key] !== undefined && recipeJson[key] !== null) delete overrides[key];
   const recipe = fuzzCore.normaliseRecipe({ ...recipeJson, ...overrides });
   return `${recipe.name}-${fuzzCore.recipeHash(recipe)}`;
}

function probeVideo(file) {
   const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,codec_name:format=duration,format_name', '-of', 'json', file], { encoding: 'utf8', timeout: 60000 });
   if (r.status !== 0) return { error: String(r.stderr || r.error || 'ffprobe failed').trim().slice(0, 300) };
   try {
      const json = JSON.parse(r.stdout);
      const s = json.streams && json.streams[0];
      if (!s) return { error: 'no video stream in this file' };
      const [a, b] = String(s.avg_frame_rate || '0/1').split('/').map(Number);
      return { width: s.width, height: s.height, codec: s.codec_name, fps: b ? Math.round((a / b) * 100) / 100 : null, duration: Number(json.format && json.format.duration) || null, container: json.format && json.format.format_name };
   } catch (error) { return { error: `ffprobe output unreadable: ${error.message}` }; }
}

function machineWarnings() {
   const warnings = [];
   try {
      const shm = fs.statfsSync('/dev/shm');
      const bytes = shm.bsize * shm.blocks;
      if (process.platform === 'linux' && bytes < 512 * 1024 * 1024) warnings.push(`/dev/shm is only ${Math.round(bytes / 1048576)} MB: Chromium may crash. Start the container with --shm-size=1g.`);
   } catch { /* not Linux */ }
   try {
      const st = fs.statfsSync(DATA);
      const free = st.bavail * st.bsize;
      if (free < 2 * 1024 ** 3) warnings.push(`Only ${(free / 1024 ** 3).toFixed(1)} GB free in the data folder; a Standard job writes about 50-300 MB.`);
   } catch { /* ignore */ }
   if (process.arch === 'x64' && fs.existsSync('/proc/sys/fs/binfmt_misc/rosetta')) warnings.push('This looks like an amd64 image emulated on Apple Silicon; pull the arm64 image for full speed.');
   if (!HAS_ZIP) warnings.push('zip is not installed: downloads come as .tar.gz.');
   return warnings;
}

// ---------------------------------------------------------------------------
// Jobs on disk
// ---------------------------------------------------------------------------

const jobs = new Map(); // id -> job (the content of job.json)
const jobDir = (id) => path.join(JOBS_DIR, id);
const jobFile = (id) => path.join(jobDir(id), 'job.json');
const jobLog = (id) => path.join(jobDir(id), 'job.log');
const atlasJson = (job) => path.join(jobDir(job.id), job.atlasDirName, 'pose-atlas.json');
const summaryFile = (id) => path.join(jobDir(id), 'summary.json');

function saveJob(job) { writeJsonAtomic(jobFile(job.id), job); }

function appendLog(id, text) { fs.appendFileSync(jobLog(id), text.endsWith('\n') ? text : `${text}\n`); }

function loadJobs() {
   for (const id of fs.existsSync(JOBS_DIR) ? fs.readdirSync(JOBS_DIR) : []) {
      const job = readJson(jobFile(id));
      if (!job) continue;
      if (job.status === 'running') {
         // The container (or the server) stopped in the middle of the job: resume it.
         job.status = 'queued';
         job.interrupted = (job.interrupted || 0) + 1;
         appendLog(id, `\n=== ${new Date().toISOString()} interrupted by a restart; queued to resume ===`);
         saveJob(job);
      }
      jobs.set(id, job);
   }
}

function recipePathFor(job, cell, index) {
   return typeof cell.recipe === 'string' ? path.join(RECIPES_DIR, cell.recipe) : path.join(jobDir(job.id), 'recipes', `${index + 1}-${slug(cell.name)}.json`);
}

function createJob({ label, plan, video, probe, reuseAtlasFrom }) {
   const id = newJobId();
   const dir = jobDir(id);
   fs.mkdirSync(path.join(dir, 'video'), { recursive: true });
   const name = slug(path.basename(video.name, path.extname(video.name)), 60) + (path.extname(video.name).toLowerCase() || '.mp4');
   const videoPath = path.join(dir, 'video', name);
   if (video.moveFrom) fs.renameSync(video.moveFrom, videoPath);
   else fs.copyFileSync(video.copyFrom, videoPath);
   const atlasDirName = `${slug(label || name, 30)}_${id.slice(-4)}`;
   const job = {
      id, label: label || path.basename(video.name, path.extname(video.name)), createdAt: new Date().toISOString(), status: 'queued',
      video: { name, original: video.name, size: fs.statSync(videoPath).size, probe },
      plan, atlasDirName, stepIndex: 0, progress: {}, interrupted: 0, error: null,
   };
   plan.cells.forEach((cell, i) => {
      if (typeof cell.recipe !== 'string') {
         fs.mkdirSync(path.join(dir, 'recipes'), { recursive: true });
         fs.writeFileSync(recipePathFor(job, cell, i), `${JSON.stringify(cell.recipe, null, 2)}\n`);
      }
   });
   job.steps = lf.buildSteps(plan, {
      video: videoPath, atlasDir: path.join(dir, atlasDirName), summaryJson: summaryFile(id),
      recipePath: (cell, i) => recipePathFor(job, cell, i),
   }).map((s) => ({ ...s, status: 'pending' }));
   // Same video and same atlas settings as an earlier job: copy its atlas (not its trials) and skip the step.
   if (reuseAtlasFrom) {
      const src = path.join(jobDir(reuseAtlasFrom.id), reuseAtlasFrom.atlasDirName);
      const dst = path.join(dir, atlasDirName);
      fs.mkdirSync(path.join(dst, 'frames'), { recursive: true });
      for (const f of ['pose-atlas.json', 'anchor.png', 'skin-mask.jpg']) if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(dst, f));
      for (const f of fs.readdirSync(path.join(src, 'frames'))) fs.copyFileSync(path.join(src, 'frames', f), path.join(dst, 'frames', f));
      job.steps[0].status = 'done';
      job.steps[0].note = `reused from job ${reuseAtlasFrom.id}`;
      job.stepIndex = 1;
      job.progress.imprints = (readJson(path.join(dst, 'pose-atlas.json')) || { imprints: [] }).imprints.length;
   }
   fs.writeFileSync(jobLog(id), `=== ${job.createdAt} job ${id}: ${job.label} (${job.video.original}), preset ${plan.preset} ===\n${job.steps[0].note ? `atlas ${job.steps[0].note}\n` : ''}`);
   saveJob(job);
   jobs.set(id, job);
   return job;
}

/** How many trials of a cell are already in trials.ndjson (a prefix of the seed range). */
function trialsAlreadyDone(job, cellIndex) {
   const cell = job.plan.cells[cellIndex];
   const ndjson = path.join(jobDir(job.id), job.atlasDirName, 'trials.ndjson');
   if (!fs.existsSync(ndjson)) return 0;
   const recipeJson = typeof cell.recipe === 'string' ? readJson(path.join(RECIPES_DIR, cell.recipe)) : cell.recipe;
   const recipeId = cellRecipeId(cell, recipeJson);
   const seeds = new Set();
   for (const line of fs.readFileSync(ndjson, 'utf8').split('\n')) {
      if (!line.includes(recipeId)) continue;
      try { const d = JSON.parse(line); if (d.type === 'trial' && d.recipeId === recipeId) seeds.add(d.seed); } catch { /* partial last line */ }
   }
   let done = 0;
   while (done < cell.trials && seeds.has((cell.seed + done) >>> 0)) done += 1;
   return done;
}

function jobEta(job) {
   if (['done', 'failed', 'cancelled'].includes(job.status)) return 0;
   return lf.estimateRemaining(job.plan, { stepIndex: job.stepIndex, progress: job.progress }, job.video.probe && job.video.probe.duration);
}

function jobPercent(job) {
   if (job.status === 'done') return 100;
   const total = lf.estimateRemaining(job.plan, { stepIndex: 0, progress: { imprints: job.progress.imprints, evals: job.progress.evals, seconds: job.progress.seconds, trialsSeen: job.progress.trialsSeen, costShare: job.progress.costShare } }, job.video.probe && job.video.probe.duration);
   return Math.max(0, Math.min(99, Math.round(100 * (1 - jobEta(job) / total))));
}

function publicJob(job, { full = false } = {}) {
   const summary = readJson(summaryFile(job.id));
   const queue = [...jobs.values()].filter((j) => j.status === 'queued').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
   const position = job.status === 'queued' ? queue.indexOf(job) + 1 : null;
   const ahead = [...jobs.values()].filter((j) => j.status === 'running' || (j.status === 'queued' && queue.indexOf(j) < queue.indexOf(job)));
   const out = {
      id: job.id, label: job.label, createdAt: job.createdAt, startedAt: job.startedAt || null, finishedAt: job.finishedAt || null,
      status: job.status, error: job.error, interrupted: job.interrupted, preset: job.plan.preset,
      video: job.video, imprints: job.progress.imprints || null, atlasDirName: job.atlasDirName,
      stepIndex: job.stepIndex, steps: job.steps.map(({ id, kind, title, status, note, startedAt, endedAt }) => ({ id, kind, title, status, note, startedAt, endedAt })),
      current: job.progress.current || null, percent: jobPercent(job), etaSeconds: jobEta(job),
      startsInSeconds: position ? ahead.reduce((s, j) => s + jobEta(j), 0) : null, queuePosition: position,
      secondsPerEval: job.progress.evals >= 30 ? Math.round(1000 * job.progress.seconds / job.progress.evals) / 1000 : null,
      headline: summary && summary.materialised && summary.materialised[0] ? { seed: summary.materialised[0].seed, recipeId: summary.materialised[0].recipeId, scores: summary.materialised[0].scores, coverage: summary.materialised[0].coverage } : null,
      hasReport: Boolean(summary),
   };
   if (full) {
      out.plan = job.plan;
      out.summary = summary;
      out.commands = job.steps.map((s) => lf.commandLine(s.args.map((a) => (a.startsWith(DATA) ? `$DATA${a.slice(DATA.length)}` : a.startsWith(ROOT) ? path.relative(ROOT, a) : a))));
   }
   return out;
}

// ---------------------------------------------------------------------------
// The worker: one job at a time
// ---------------------------------------------------------------------------

let current = null; // { job, child, cancelRequested, shuttingDown }
let shuttingDown = false;
const children = new Set(); // detached fuzzer processes: never left behind if the server dies
function killGroup(child) { try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } } }
process.on('exit', () => { for (const c of children) killGroup(c); });

function runFuzzer(job, args, onLine) {
   return new Promise((resolve) => {
      // Own process group: a SIGTERM/SIGINT sent to the group of npm or the server (docker stop, Ctrl-C) does not
      // reach the fuzzer directly; the server sends it SIGINT itself, so it finishes its trial and writes its top.
      const child = spawn(process.execPath, [FUZZ_CLI, ...args], { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
      children.add(child);
      child.on('exit', () => children.delete(child));
      if (current && current.job === job) current.child = child;
      const tail = [];
      const take = (stream) => readline.createInterface({ input: stream }).on('line', (line) => {
         appendLog(job.id, line);
         tail.push(line); if (tail.length > 30) tail.shift();
         if (onLine) onLine(line);
      });
      take(child.stdout); take(child.stderr);
      child.on('close', (code, signal) => { if (current && current.child === child) current.child = null; resolve({ code, signal, tail }); });
      child.on('error', (error) => { appendLog(job.id, `spawn error: ${error.message}`); resolve({ code: -1, signal: null, tail: [error.message] }); });
   });
}

async function quietReport(job) {
   if (!fs.existsSync(atlasJson(job))) return;
   const step = job.steps[job.steps.length - 1];
   appendLog(job.id, `\n--- report (intermediate) ---\n$ ${lf.commandLine(step.args)}`);
   await runFuzzer(job, step.args);
}

async function runJob(job) {
   current = { job, child: null, cancelRequested: false };
   job.status = 'running';
   job.startedAt = job.startedAt || new Date().toISOString();
   job.error = null;
   saveJob(job);
   let lastSave = 0;
   const persist = (force) => { const now = Date.now(); if (force || now - lastSave > 2000) { lastSave = now; saveJob(job); } };
   log(`job ${job.id} starts at step ${job.stepIndex}`);
   for (let i = job.stepIndex; i < job.steps.length; i += 1) {
      const step = job.steps[i];
      if (step.status === 'done') continue;
      job.stepIndex = i;
      let args = step.args;
      let offset = 0;
      if (step.kind === 'atlas' && fs.existsSync(atlasJson(job))) {
         // An atlas from an interrupted run is complete only if pose-atlas.json was written (it is written last).
         step.status = 'done'; step.note = 'already built';
         job.progress.imprints = (readJson(atlasJson(job)) || { imprints: [] }).imprints.length;
         continue;
      }
      if (step.kind === 'trial') {
         const cell = job.plan.cells[step.cell];
         offset = trialsAlreadyDone(job, step.cell);
         if (offset >= cell.trials) { step.status = 'done'; step.note = 'trials already in the log'; continue; }
         if (offset) {
            args = args.slice();
            args[args.indexOf('--seed') + 1] = String((cell.seed + offset) >>> 0);
            args[args.indexOf('--trials') + 1] = String(cell.trials - offset);
            step.note = `resumed after ${offset} trial(s)`;
         }
      }
      if (step.kind === 'atlas' && fs.existsSync(path.join(jobDir(job.id), job.atlasDirName))) {
         // A half-built atlas directory (no pose-atlas.json yet) is rebuilt from scratch.
         fs.rmSync(path.join(jobDir(job.id), job.atlasDirName), { recursive: true, force: true });
      }
      step.status = 'running';
      step.startedAt = new Date().toISOString();
      job.progress.current = null;
      persist(true);
      appendLog(job.id, `\n=== ${step.startedAt} step ${i + 1}/${job.steps.length}: ${step.title}${step.note ? ` (${step.note})` : ''} ===\n$ ${lf.commandLine(args)}`);
      const result = await runFuzzer(job, args, (line) => {
         const event = lf.parseLogLine(line);
         if (!event) return;
         if (event.type === 'trial' && offset) { event.done += offset; event.total += offset; }
         lf.applyProgress(job.progress, event);
         persist(false);
      });
      step.endedAt = new Date().toISOString();
      step.exitCode = result.code;
      if (current.cancelRequested || shuttingDown) {
         step.status = 'pending'; // a SIGINT-ed trial run exits 0 after fewer trials: resume picks up from the log
         break;
      }
      if (result.code !== 0) {
         step.status = 'failed';
         job.status = 'failed';
         const hint = step.kind === 'atlas' ? ' The atlas needs a face that face-api recognises in the video: check light, framing, and that the face is not too small.' : '';
         job.error = `${step.title} failed (exit ${result.code ?? result.signal}).${hint}\n${result.tail.slice(-8).join('\n')}`;
         break;
      }
      step.status = 'done';
      if (step.kind === 'atlas') job.progress.imprints = (readJson(atlasJson(job)) || { imprints: [] }).imprints.length;
      persist(true);
      if (step.kind === 'trial') await quietReport(job); // partial results on the page while the next cells run
   }
   if (shuttingDown) {
      job.status = 'queued'; // resume on the next start
      job.interrupted = (job.interrupted || 0) + 1;
      appendLog(job.id, `=== ${new Date().toISOString()} server stopping: the job will resume on the next start ===`);
   } else if (current.cancelRequested) {
      job.status = 'cancelled';
      job.finishedAt = new Date().toISOString();
      appendLog(job.id, `=== ${job.finishedAt} cancelled; results so far are kept ===`);
      await quietReport(job);
   } else if (job.status !== 'failed') {
      job.status = 'done';
      job.stepIndex = job.steps.length;
      job.finishedAt = new Date().toISOString();
      appendLog(job.id, `\n=== ${job.finishedAt} done ===`);
   } else {
      job.finishedAt = new Date().toISOString();
      await quietReport(job);
   }
   job.progress.current = null;
   saveJob(job);
   log(`job ${job.id} ${job.status}`);
   current = null;
}

let pumping = false;
async function pump() {
   if (pumping || shuttingDown) return;
   pumping = true;
   try {
      for (;;) {
         if (shuttingDown) break;
         const next = [...jobs.values()].filter((j) => j.status === 'queued').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
         if (!next) break;
         try { await runJob(next); } catch (error) {
            log(`job ${next.id} crashed: ${error.stack}`);
            next.status = 'failed'; next.error = `internal error: ${error.message}`; saveJob(next); current = null;
         }
      }
   } finally { pumping = false; }
}

function cancelJob(job) {
   if (job.status === 'queued') {
      job.status = 'cancelled'; job.finishedAt = new Date().toISOString(); saveJob(job);
      appendLog(job.id, `=== ${job.finishedAt} cancelled before it started ===`);
      return;
   }
   if (!current || current.job !== job) return;
   current.cancelRequested = true;
   appendLog(job.id, `=== ${new Date().toISOString()} cancel requested: stopping after the current trial ===`);
   const child = current.child;
   if (child) {
      child.kill('SIGINT');
      setTimeout(() => { if (current && current.child === child) killGroup(child); }, STOP_GRACE_MS).unref();
   }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8', '.ndjson': 'application/x-ndjson', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };

function send(res, status, body, headers = {}) {
   const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
   const payload = isJson ? JSON.stringify(body) : body;
   res.writeHead(status, { 'Content-Type': isJson ? 'application/json' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
   res.end(payload);
}
const fail = (res, status, message) => send(res, status, { error: message });

function readBody(req, limit = 2 * 1024 * 1024) {
   return new Promise((resolve, reject) => {
      const chunks = []; let size = 0;
      req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('request body too large')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('body is not JSON')); } });
      req.on('error', reject);
   });
}

function serveFile(res, file, { download = null, csp = true } = {}) {
   fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) { fail(res, 404, 'not found'); return; }
      const headers = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      if (csp) headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'";
      if (download) headers['Content-Disposition'] = `attachment; filename="${download.replace(/"/g, '')}"`;
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(res);
   });
}

/** Resolve a path inside a base directory, or null when it escapes it. */
function inside(base, rel) {
   const target = path.resolve(base, `.${path.sep}${rel}`);
   return target === base || target.startsWith(base + path.sep) ? target : null;
}

function streamArchive(res, job, what) {
   const dir = jobDir(job.id);
   const a = job.atlasDirName;
   let entries;
   if (what === 'ghostyles') {
      fs.writeFileSync(path.join(dir, 'README.txt'), ghostylesReadme(job));
      entries = ['README.txt', 'summary.json', `${a}/report.html`, `${a}/anchor.png`, `${a}/runs`];
   } else {
      entries = ['job.json', 'job.log', 'summary.json', 'recipes', `${a}/pose-atlas.json`, `${a}/trials.ndjson`];
   }
   entries = entries.filter((e) => fs.existsSync(path.join(dir, e)));
   if (!entries.length) { fail(res, 404, 'nothing to download yet'); return; }
   const base = `${slug(job.label, 40)}-${what}`;
   const [cmd, args, ext, type] = HAS_ZIP ? ['zip', ['-r', '-q', '-', ...entries], 'zip', 'application/zip'] : ['tar', ['czf', '-', ...entries], 'tar.gz', 'application/gzip'];
   res.writeHead(200, { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${base}.${ext}"`, 'Cache-Control': 'no-store' });
   const child = spawn(cmd, args, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] });
   child.stdout.pipe(res);
   res.on('close', () => child.kill());
}

function ghostylesReadme(job) {
   const summary = readJson(summaryFile(job.id));
   const lines = [
      `Ghostyles from the local fuzzer — job ${job.id}: ${job.label}`,
      `video ${job.video.original}, preset ${job.plan.preset}, ${job.status}${job.finishedAt ? ` at ${job.finishedAt}` : ''}`,
      '',
      'Every number here is face-api\'s, measured on this video with the lab\'s own models. "Escaped" means escaped',
      'this detector on this face; it is not a claim of protection against other face-recognition systems.',
      '',
      'Contents',
      `  ${job.atlasDirName}/report.html    open in a browser: every trial, sortable, with the evasion profile`,
      `  ${job.atlasDirName}/runs/<recipe-id>-<seed>/`,
      '      ghostyle-fuzz-<seed>.js   the Ghostyle (paintUV plugin); its comment block has the scores and the command that reproduces it',
      '      anchor-overlay.jpg        the frontal frame with the overlay',
      '      poses-overlay.jpg         every head pose with the overlay and its result',
      '      evasion-profile.csv       one row per pose: detection, distances, escaped',
      '  summary.json                  per-recipe summary and the materialised trials, best first',
      '',
      'Trying a Ghostyle in the lab: copy the .js into ghostyles/ of a ghostmaxxing checkout, add an entry to',
      'ghostyles.json, and check it with `npm run validate-plugin -- ghostyles/<file>.js`',
      '(see tutorials/ghostyle-fuzz.md §7.1 and tutorials/ghostyle-authoring.md).',
      '',
      'escape = lost + descriptor: "lost" is the share of poses where the detector found no face, "descriptor" the',
      'share where a face was found but its descriptor is ≥ 0.6 from every clean pose (the identity moved).',
   ];
   if (summary && summary.materialised && summary.materialised.length) {
      lines.push('', 'Best Ghostyles (escape = lost + descriptor, face covered)');
      for (const m of summary.materialised.slice(0, 15)) lines.push(`  ${m.folder}  ${(100 * m.scores.escapeRate).toFixed(0)}% = ${(100 * m.scores.lostRate).toFixed(0)}% + ${(100 * m.scores.descriptorEscape).toFixed(0)}%, covered ${(100 * m.coverage).toFixed(0)}%`);
   }
   return `${lines.join('\n')}\n`;
}

async function handleUpload(req, res, url) {
   const name = String(url.searchParams.get('name') || 'video.mp4').slice(0, 200);
   const declared = Number(req.headers['content-length'] || 0);
   if (declared > MAX_UPLOAD) { fail(res, 413, `the file is larger than ${Math.round(MAX_UPLOAD / 1048576)} MB`); req.resume(); return; }
   fs.mkdirSync(UPLOADS_DIR, { recursive: true });
   const uploadId = crypto.randomBytes(8).toString('hex');
   const file = path.join(UPLOADS_DIR, `${uploadId}${path.extname(name).toLowerCase().replace(/[^.\w]/g, '') || '.mp4'}`);
   const out = fs.createWriteStream(file);
   let size = 0; let aborted = false;
   req.on('data', (c) => { size += c.length; if (size > MAX_UPLOAD && !aborted) { aborted = true; out.destroy(); fs.rmSync(file, { force: true }); fail(res, 413, 'upload too large'); req.destroy(); } });
   req.pipe(out);
   out.on('finish', () => {
      if (aborted) return;
      const probe = probeVideo(file);
      if (probe.error) { fs.rmSync(file, { force: true }); fail(res, 400, `not a readable video: ${probe.error.split('\n').pop().replace(file, name)}`); return; }
      fs.writeFileSync(`${file}.json`, JSON.stringify({ name, size, probe }));
      send(res, 200, { uploadId: path.basename(file), name, size, probe });
   });
   out.on('error', (error) => { if (!aborted) fail(res, 500, error.message); });
}

async function handleApi(req, res, url) {
   const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
   const method = req.method;
   // Mutating calls must carry a custom header: a cross-site page cannot add it without a CORS preflight, which is never granted.
   if (method !== 'GET' && req.headers['x-localfuzzer'] !== '1') { fail(res, 403, 'missing X-Localfuzzer header'); return; }

   if (parts[1] === 'info' && method === 'GET') {
      send(res, 200, {
         version: VERSION, tool: toolVersion, dataDir: DATA, cpus: os.cpus().length, arch: process.arch, memoryGb: Math.round(os.totalmem() / 1024 ** 3),
         presets: Object.fromEntries(Object.entries(lf.PRESETS).map(([k, p]) => [k, { label: p.label, description: p.description, plan: p.plan }])),
         recipes: bundledRecipes(), zones: lf.ZONES, atlasDefaults: lf.ATLAS_DEFAULTS, cellDefaults: lf.CELL_DEFAULTS,
         settings: readJson(SETTINGS_FILE), warnings: machineWarnings(), running: current ? current.job.id : null,
      });
      return;
   }
   if (parts[1] === 'settings' && method === 'PUT') {
      const body = await readBody(req);
      if (body.plan === null) { fs.rmSync(SETTINGS_FILE, { force: true }); send(res, 200, { ok: true }); return; }
      const { plan, errors } = lf.normalisePlan(body.plan, planContext());
      if (errors.length) { send(res, 400, { error: 'invalid settings', errors }); return; }
      writeJsonAtomic(SETTINGS_FILE, { plan, savedAt: new Date().toISOString() });
      send(res, 200, { ok: true, plan });
      return;
   }
   if (parts[1] === 'preview' && method === 'POST') {
      // Validation, the exact commands and the time estimate of a plan, before it is queued.
      const body = await readBody(req);
      const { plan, errors } = lf.normalisePlan(body.plan, planContext());
      if (errors.length) { send(res, 400, { error: 'invalid plan', errors }); return; }
      const duration = Number(body.duration) || 30;
      const seconds = (imprints) => lf.estimateRemaining(plan, { stepIndex: 0, progress: { imprints } }, duration);
      const steps = lf.buildSteps(plan, {
         video: '$DATA/jobs/<job>/video/<video>', atlasDir: '$DATA/jobs/<job>/<atlas>', summaryJson: '$DATA/jobs/<job>/summary.json',
         recipePath: (cell, i) => (typeof cell.recipe === 'string' ? `scripts-dev/ghostyle-fuzz/recipes/${cell.recipe}` : `$DATA/jobs/<job>/recipes/${i + 1}-${slug(cell.name)}.json`),
      });
      send(res, 200, {
         plan, trials: plan.cells.reduce((s, c) => s + c.trials, 0),
         estimate: { low: seconds(lf.expectedImprints(plan, 0.55)), typical: seconds(lf.expectedImprints(plan)), high: seconds(lf.expectedImprints(plan, 1.7)) },
         commands: steps.map((s) => lf.commandLine(s.args)),
      });
      return;
   }
   if (parts[1] === 'upload' && method === 'PUT') { await handleUpload(req, res, url); return; }
   if (parts[1] === 'compare' && method === 'POST') {
      const body = await readBody(req);
      const picked = (body.jobIds || []).map((id) => jobs.get(id)).filter(Boolean);
      if (picked.length < 2) { fail(res, 400, 'pick at least two jobs'); return; }
      const missing = picked.filter((j) => !fs.existsSync(atlasJson(j)));
      if (missing.length) { fail(res, 400, `no atlas yet for ${missing.map((j) => j.label).join(', ')}`); return; }
      fs.mkdirSync(COMPARE_DIR, { recursive: true });
      const output = path.join(COMPARE_DIR, `compare-${newJobId()}.txt`);
      const r = spawnSync(process.execPath, [FUZZ_CLI, 'compare', ...picked.flatMap((j) => ['--atlas', atlasJson(j)]), '--output', output], { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
      if (r.status !== 0) { fail(res, 500, String(r.stderr || 'compare failed').trim().split('\n').slice(-3).join(' ')); return; }
      send(res, 200, { text: fs.readFileSync(output, 'utf8'), file: path.basename(output), jobs: picked.map((j) => ({ id: j.id, label: j.label, atlas: j.atlasDirName })) });
      return;
   }
   if (parts[1] === 'jobs' && parts.length === 2) {
      if (method === 'GET') {
         const list = [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((j) => publicJob(j));
         send(res, 200, { jobs: list, running: current ? current.job.id : null });
         return;
      }
      if (method === 'POST') {
         const body = await readBody(req);
         const { plan, errors } = lf.normalisePlan(body.plan, planContext());
         if (errors.length) { send(res, 400, { error: 'invalid plan', errors }); return; }
         let video; let probe; let reuseAtlasFrom = null;
         if (body.fromJob) {
            const src = jobs.get(body.fromJob);
            if (!src) { fail(res, 404, 'no such job to reuse the video of'); return; }
            const srcVideo = path.join(jobDir(src.id), 'video', src.video.name);
            if (!fs.existsSync(srcVideo)) { fail(res, 400, 'that job no longer has its video'); return; }
            video = { name: src.video.original, copyFrom: srcVideo }; probe = src.video.probe;
            if (JSON.stringify(src.plan.atlas) === JSON.stringify(plan.atlas) && fs.existsSync(atlasJson(src))) reuseAtlasFrom = src;
         } else {
            const uploadId = path.basename(String(body.uploadId || ''));
            const file = path.join(UPLOADS_DIR, uploadId);
            const meta = readJson(`${file}.json`);
            if (!uploadId || !fs.existsSync(file) || !meta) { fail(res, 400, 'upload not found: send the video again'); return; }
            video = { name: meta.name, moveFrom: file }; probe = meta.probe;
            fs.rmSync(`${file}.json`, { force: true });
         }
         const job = createJob({ label: String(body.label || '').trim().slice(0, 80), plan, video, probe, reuseAtlasFrom });
         log(`job ${job.id} queued (${plan.preset}, ${plan.cells.length} cell(s))`);
         setImmediate(pump);
         send(res, 201, publicJob(job, { full: true }));
         return;
      }
   }
   if (parts[1] === 'jobs' && parts[2]) {
      const job = jobs.get(parts[2]);
      if (!job) { fail(res, 404, 'no such job'); return; }
      const action = parts[3];
      if (!action && method === 'GET') { send(res, 200, publicJob(job, { full: true })); return; }
      if (!action && method === 'DELETE') {
         if (current && current.job === job) { fail(res, 409, 'the job is running: cancel it first'); return; }
         jobs.delete(job.id);
         fs.rmSync(jobDir(job.id), { recursive: true, force: true });
         log(`job ${job.id} deleted`);
         send(res, 200, { ok: true });
         return;
      }
      if (action === 'log' && method === 'GET') {
         const file = jobLog(job.id);
         const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
         let from = Number(url.searchParams.get('from') || 0);
         if (!(from >= 0) || from > size) from = 0;
         if (url.searchParams.get('tail')) from = Math.max(0, size - Number(url.searchParams.get('tail')));
         const length = Math.min(size - from, 512 * 1024);
         const buffer = Buffer.alloc(length);
         if (length) { const fd = fs.openSync(file, 'r'); fs.readSync(fd, buffer, 0, length, from); fs.closeSync(fd); }
         send(res, 200, { from, to: from + length, size, text: buffer.toString('utf8') });
         return;
      }
      if (action === 'cancel' && method === 'POST') {
         if (!['queued', 'running'].includes(job.status)) { fail(res, 409, `the job is ${job.status}`); return; }
         cancelJob(job);
         send(res, 200, publicJob(job));
         return;
      }
      if (action === 'resume' && method === 'POST') {
         if (!['cancelled', 'failed'].includes(job.status)) { fail(res, 409, `the job is ${job.status}`); return; }
         job.status = 'queued'; job.error = null; job.finishedAt = null;
         for (const s of job.steps) if (s.status === 'failed' || s.status === 'running') s.status = 'pending';
         job.stepIndex = job.steps.findIndex((s) => s.status !== 'done');
         if (job.stepIndex < 0) job.stepIndex = job.steps.length - 1;
         appendLog(job.id, `\n=== ${new Date().toISOString()} resumed from the page ===`);
         saveJob(job);
         setImmediate(pump);
         send(res, 200, publicJob(job));
         return;
      }
      if (action === 'download' && method === 'GET') {
         const what = url.searchParams.get('what');
         if (!['ghostyles', 'logs'].includes(what)) { fail(res, 400, 'what=ghostyles or what=logs'); return; }
         streamArchive(res, job, what);
         return;
      }
   }
   fail(res, 404, 'unknown API call');
}

function handle(req, res) {
   const hostHeader = String(req.headers.host || '').toLowerCase();
   const hostName = hostHeader.startsWith('[') ? hostHeader.slice(0, hostHeader.indexOf(']') + 1) : hostHeader.split(':')[0];
   if (!ALLOWED_HOSTS.has(hostName)) {
      // DNS-rebinding guard: a page on another origin that resolves its name to 127.0.0.1 gets nothing.
      fail(res, 421, `host ${hostName} not allowed; open http://localhost:${PORT}/ or set LOCALFUZZER_ALLOWED_HOSTS`);
      return;
   }
   let url;
   try { url = new URL(req.url, `http://${hostHeader || 'localhost'}`); } catch { fail(res, 400, 'bad url'); return; }
   const p = decodeURIComponent(url.pathname);
   if (p.startsWith('/api/')) {
      handleApi(req, res, url).catch((error) => { log(`API error: ${error.stack}`); if (!res.headersSent) fail(res, 500, error.message); });
      return;
   }
   if (req.method !== 'GET' && req.method !== 'HEAD') { fail(res, 405, 'method not allowed'); return; }
   // Files of a job: report.html, images, Ghostyles, summary, log.
   let m;
   if ((m = /^\/jobs\/([\w-]+)\/files\/(.+)$/.exec(p))) {
      const job = jobs.get(m[1]);
      const file = job && inside(jobDir(job.id), m[2]);
      if (!file) { fail(res, 404, 'not found'); return; }
      serveFile(res, file, { csp: false, download: url.searchParams.get('download') ? path.basename(file) : null });
      return;
   }
   if (p === '/' || p === '/index.html') { serveFile(res, path.join(PUBLIC_DIR, 'index.html')); return; }
   const file = inside(PUBLIC_DIR, p.slice(1));
   if (file) { serveFile(res, file); return; }
   fail(res, 404, 'not found');
}

// ---------------------------------------------------------------------------

async function main() {
   fuzzCore = await import(pathToFileURL(path.join(ROOT, 'scripts-dev', 'ghostyle-fuzz', 'fuzz-core.mjs')).href);
   const v = spawnSync(process.execPath, [FUZZ_CLI, '--version'], { encoding: 'utf8' });
   toolVersion = String(v.stdout || '').trim() || '?';
   for (const d of [DATA, JOBS_DIR, UPLOADS_DIR, COMPARE_DIR]) fs.mkdirSync(d, { recursive: true });
   try { fs.accessSync(DATA, fs.constants.W_OK); } catch { throw new Error(`the data directory ${DATA} is not writable by uid ${process.getuid ? process.getuid() : '?'}`); }
   // Uploads that never became a job (page closed before "Start") are dropped after a day.
   for (const f of fs.readdirSync(UPLOADS_DIR)) {
      const file = path.join(UPLOADS_DIR, f);
      if (Date.now() - fs.statSync(file).mtimeMs > 24 * 3600 * 1000) fs.rmSync(file, { force: true });
   }
   if (spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status !== 0) throw new Error('ffprobe is not on PATH');
   loadJobs();
   const server = http.createServer(handle);
   server.requestTimeout = 0; // uploads of large videos
   server.headersTimeout = 60000;
   server.listen(PORT, HOST, () => {
      log(`${toolVersion}, localfuzzer ${VERSION}: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/  data: ${DATA}  (${jobs.size} job(s))`);
      for (const w of machineWarnings()) log(`warning: ${w}`);
      setImmediate(pump);
   });
   const stop = (signal) => {
      if (shuttingDown) { log('second signal: exiting now'); process.exit(1); }
      shuttingDown = true;
      log(`${signal}: stopping; the running job stops after its current trial and resumes on the next start`);
      server.close();
      const child = current && current.child;
      if (!child) { process.exit(0); return; }
      child.kill('SIGINT');
      const timer = setTimeout(() => { killGroup(child); }, STOP_GRACE_MS);
      const wait = setInterval(() => { if (!current) { clearTimeout(timer); clearInterval(wait); process.exit(0); } }, 250);
   };
   process.on('SIGTERM', () => stop('SIGTERM'));
   process.on('SIGINT', () => stop('SIGINT'));
}

main().catch((error) => { process.stderr.write(`localfuzzer: ${error.message}\n`); process.exit(1); });
