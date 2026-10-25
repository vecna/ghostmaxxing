/**
 * @file Pure helpers of the local fuzzer web service (scripts-dev/localfuzzer).
 * @description
 * No I/O here: presets, plan validation, the command lines a plan runs, the
 * parsing of the fuzzer's progress lines and the time estimate. server.cjs
 * does the files, the queue and the child processes; the unit tests
 * (tests/unit/localfuzzer-core.test.js) cover this file.
 *
 * A **plan** is everything a job will run, as plain JSON:
 *
 *   { preset, gpu,
 *     atlas: { sampleFps, bin, maxImprints, candidates, anchorWindow, maxGap },
 *     cells: [{ name, recipe, trials, seed, top, prune, pruneSubset, pruneMargin,
 *               color, noOverlap, zones, paired }] }
 *
 * Each field maps one-to-one onto an option of scripts-dev/ghostyle-fuzz.cjs
 * (atlas, trial); report runs after every cell and at the end. `recipe` is the
 * file name of a bundled recipe (scripts-dev/ghostyle-fuzz/recipes/) or a
 * recipe object, which the server writes into the job folder.
 */

const ZONES = ['forehead', 'eyes', 'nose-cheeks', 'mouth-chin'];

/** Same defaults as the CLI (ghostyle-fuzz.cjs parseArgs). */
const ATLAS_DEFAULTS = { sampleFps: 15, bin: 10, maxImprints: 60, candidates: 3, anchorWindow: null, maxGap: 0.5 };
const CELL_DEFAULTS = {
   name: 'cell', recipe: 'three-bands.json', trials: 25, seed: 1000, top: 10,
   prune: true, pruneSubset: 12, pruneMargin: 0.15, color: null, noOverlap: false, zones: null, paired: true,
};

/** Seconds per imprint evaluation on swiftshader, measured on the October 2026 runs; replaced by the job's own measure once trials run. */
const DEFAULT_SECONDS_PER_EVAL = 1.25;
/** Imprints assumed before the atlas exists (the October atlases had 14, 27 and 40). */
const DEFAULT_IMPRINTS = 25;
/** Share of the full sweep a pruned run costs on average (October runs: 0.67-0.97); used only before the job has measured its own. */
const DEFAULT_PRUNE_FACTOR = 0.8;

const cell = (name, recipe, extra = {}) => ({ ...CELL_DEFAULTS, name, recipe, ...extra });

/**
 * The cells of tutorials/ghostyle-fuzz-reading-the-numbers.md and run-samples.sh.
 * Every cell uses seed 1000 and paired seeds (or a forced colour), so seed N is
 * the same strokes in every three-bands cell, on every video, in every job:
 * `compare` can line jobs up design by design.
 */
const STANDARD_CELLS = [
   cell('bands-palette', 'three-bands.json'),
   cell('bands-white', 'three-bands.json', { paired: false, color: 'white' }),
   cell('bands-black', 'three-bands.json', { paired: false, color: 'black' }),
   cell('bands-opaque', 'three-bands-opaque.json'),
   cell('bands-any-colour', 'three-bands-any-colour.json'),
   cell('bands-no-overlap', 'three-bands.json', { noOverlap: true }),
   cell('bands-eyes', 'three-bands.json', { noOverlap: true, zones: ['eyes'] }),
   cell('bands-nose', 'three-bands.json', { noOverlap: true, zones: ['nose-cheeks'] }),
   cell('bands-no-eyes', 'three-bands.json', { noOverlap: true, zones: ['forehead', 'nose-cheeks', 'mouth-chin'] }),
   cell('one-long-band', 'one-long-band.json'),
   cell('six-thin-lines', 'six-thin-lines.json'),
];

const PRESETS = {
   quick: {
      label: 'Quick',
      description: 'A first look: coarser pose bins (15°, fewer imprints) and three recipes × 30 trials. About 15-45 minutes.',
      plan: {
         preset: 'quick', gpu: false, atlas: { ...ATLAS_DEFAULTS, bin: 15 },
         cells: [cell('bands-palette', 'three-bands.json', { trials: 30 }), cell('bands-nose', 'three-bands.json', { trials: 30, noOverlap: true, zones: ['nose-cheeks'] }), cell('four-lines', 'four-lines.json', { trials: 30 })],
      },
   },
   standard: {
      label: 'Standard',
      description: 'The comparison matrix: 11 cells (palette vs forced colours, opacity, overlap, face zones, shapes) × 25 trials. About 2-6 hours.',
      plan: { preset: 'standard', gpu: false, atlas: { ...ATLAS_DEFAULTS }, cells: STANDARD_CELLS.map((c) => ({ ...c })) },
   },
   deep: {
      label: 'Deep',
      description: 'The same matrix × 100 trials with every imprint swept (no pruning): for an overnight run. About 8-20 hours.',
      plan: { preset: 'deep', gpu: false, atlas: { ...ATLAS_DEFAULTS }, cells: STANDARD_CELLS.map((c) => ({ ...c, trials: 100, prune: false })) },
   },
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }

/** A fresh copy of a preset's plan. */
function presetPlan(name) {
   if (!PRESETS[name]) throw new Error(`unknown preset ${name}`);
   return clone(PRESETS[name].plan);
}

/**
 * Validate and complete a plan.
 *
 * @param {object} raw The plan from the page.
 * @param {{recipes: Object<string, object>, parseColour: function(string): number[], normaliseRecipe: function(object): object}} ctx
 *   recipes: bundled recipe JSON by file name; parseColour / normaliseRecipe: from fuzz-core.mjs (they throw on bad input).
 * @returns {{plan: ?object, errors: string[]}}
 */
function normalisePlan(raw, ctx) {
   const errors = [];
   if (!raw || typeof raw !== 'object') return { plan: null, errors: ['the plan is not an object'] };
   const num = (where, value, { min = -Infinity, max = Infinity, integer = false, fallback }) => {
      const v = value === undefined || value === null || value === '' ? fallback : Number(value);
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
         errors.push(`${where} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max === Infinity ? '∞' : max}`);
         return fallback;
      }
      return v;
   };
   const a = { ...ATLAS_DEFAULTS, ...(raw.atlas || {}) };
   let anchorWindow = a.anchorWindow === undefined || a.anchorWindow === null ? '' : String(a.anchorWindow).trim();
   if (anchorWindow) {
      const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(anchorWindow);
      if (!m || Number(m[2]) <= Number(m[1])) errors.push('atlas anchor window must look like 0-2 (seconds, start < end)');
   } else anchorWindow = null;
   const atlas = {
      sampleFps: num('atlas sample fps', a.sampleFps, { min: 0.1, max: 120, fallback: ATLAS_DEFAULTS.sampleFps }),
      bin: num('atlas pose bin', a.bin, { min: 1, max: 90, fallback: ATLAS_DEFAULTS.bin }),
      maxImprints: num('atlas max imprints', a.maxImprints, { min: 2, max: 500, integer: true, fallback: ATLAS_DEFAULTS.maxImprints }),
      candidates: num('atlas candidates', a.candidates, { min: 1, max: 20, integer: true, fallback: ATLAS_DEFAULTS.candidates }),
      anchorWindow,
      maxGap: num('atlas max gap', a.maxGap, { min: 0, max: 3600, fallback: ATLAS_DEFAULTS.maxGap }),
   };
   const cellsIn = Array.isArray(raw.cells) ? raw.cells : [];
   if (!cellsIn.length) errors.push('the plan needs at least one trial cell');
   if (cellsIn.length > 50) errors.push('at most 50 trial cells per job');
   const names = new Set();
   const cells = cellsIn.slice(0, 50).map((c, i) => {
      const where = `cell ${i + 1}${c && c.name ? ` (${c.name})` : ''}`;
      const x = { ...CELL_DEFAULTS, ...(c || {}) };
      let name = String(x.name || `cell-${i + 1}`).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 40) || `cell-${i + 1}`;
      while (names.has(name)) name = `${name}-${i + 1}`;
      names.add(name);
      // Recipe: a bundled file name, or a recipe object.
      let recipe = x.recipe;
      let recipeJson = null;
      if (typeof recipe === 'string') {
         if (!ctx.recipes[recipe]) errors.push(`${where}: no bundled recipe ${recipe}`);
         else recipeJson = ctx.recipes[recipe];
      } else if (recipe && typeof recipe === 'object') {
         try { ctx.normaliseRecipe(recipe); recipeJson = recipe; } catch (error) { errors.push(`${where}: custom recipe: ${error.message}`); }
         recipe = clone(recipe);
      } else errors.push(`${where}: recipe missing`);
      let color = x.color === undefined || x.color === null || String(x.color).trim() === '' ? null : String(x.color).trim();
      if (color) { try { ctx.parseColour(color); } catch (error) { errors.push(`${where}: ${error.message}`); color = null; } }
      let zones = null;
      if (Array.isArray(x.zones) && x.zones.length) {
         zones = [...new Set(x.zones.map((z) => String(z).trim().toLowerCase()))];
         const bad = zones.filter((z) => !ZONES.includes(z));
         if (bad.length) errors.push(`${where}: unknown zone(s) ${bad.join(', ')}`);
         if (zones.length === ZONES.length) zones = null; // every zone = no constraint
      }
      const paired = Boolean(x.paired);
      const noOverlap = Boolean(x.noOverlap);
      // The CLI's own incompatibilities, caught before the job is queued.
      if (color && paired) errors.push(`${where}: a forced colour and paired seeds exclude each other (no palette to pair); untick one`);
      if (recipeJson) {
         const clash = (key, mine, same) => { if (recipeJson[key] !== undefined && recipeJson[key] !== null && mine !== null && !same) errors.push(`${where}: the recipe sets ${key} = ${JSON.stringify(recipeJson[key])}, the cell asks for ${JSON.stringify(mine)}`); };
         if (color) { let same = false; try { same = JSON.stringify(ctx.parseColour(recipeJson.color)) === JSON.stringify(ctx.parseColour(color)); } catch { same = false; } clash('color', color, same); }
         if (recipeJson.color && paired) errors.push(`${where}: the recipe forces a colour, so paired seeds cannot be used; untick paired`);
         if (noOverlap) clash('overlap', false, recipeJson.overlap === false);
         if (zones) clash('zones', zones, JSON.stringify([...(recipeJson.zones || [])].sort()) === JSON.stringify([...zones].sort()));
         if (paired) clash('pairedSeeds', true, recipeJson.pairedSeeds === true);
      }
      const prune = x.prune !== false;
      return {
         name, recipe,
         trials: num(`${where} trials`, x.trials, { min: 1, max: 100000, integer: true, fallback: CELL_DEFAULTS.trials }),
         seed: num(`${where} seed`, x.seed, { min: 0, max: 0xFFFFFFFF, integer: true, fallback: CELL_DEFAULTS.seed }),
         top: num(`${where} top`, x.top, { min: 0, max: 1000, integer: true, fallback: CELL_DEFAULTS.top }),
         prune,
         pruneSubset: num(`${where} prune subset`, x.pruneSubset, { min: 2, max: 500, integer: true, fallback: CELL_DEFAULTS.pruneSubset }),
         pruneMargin: num(`${where} prune margin`, x.pruneMargin, { min: 0, max: 1, fallback: CELL_DEFAULTS.pruneMargin }),
         color, noOverlap, zones, paired,
      };
   });
   const plan = { preset: PRESETS[raw.preset] ? raw.preset : 'custom', gpu: Boolean(raw.gpu), atlas, cells };
   return { plan: errors.length ? null : plan, errors };
}

/**
 * The fuzzer invocations of a job, in order. Paths come from the server.
 *
 * @param {object} plan A normalised plan.
 * @param {{video: string, atlasDir: string, recipePath: function(object, number): string, summaryJson: string}} paths
 * @returns {{id: string, kind: 'atlas'|'trial'|'report', title: string, args: string[], cell?: number}[]}
 */
function buildSteps(plan, paths) {
   const atlasJson = `${paths.atlasDir}/pose-atlas.json`;
   const gpu = plan.gpu ? ['--gpu'] : [];
   const a = plan.atlas;
   const steps = [{
      id: 'atlas', kind: 'atlas', title: 'Pose atlas',
      args: ['atlas', '--video', paths.video, '--output', paths.atlasDir, '--sample-fps', String(a.sampleFps), '--bin', String(a.bin),
         '--max-imprints', String(a.maxImprints), '--candidates', String(a.candidates), ...(a.anchorWindow ? ['--anchor-window', a.anchorWindow] : []),
         '--max-gap', String(a.maxGap), ...gpu],
   }];
   plan.cells.forEach((c, i) => {
      steps.push({
         id: `trial-${i}`, kind: 'trial', cell: i, title: `${c.name}: ${c.trials} trial(s)`,
         args: ['trial', '--atlas', atlasJson, '--recipe', paths.recipePath(c, i), '--trials', String(c.trials), '--seed', String(c.seed), '--top', String(c.top),
            ...(c.prune ? ['--prune-subset', String(c.pruneSubset), '--prune-margin', String(c.pruneMargin)] : ['--no-prune']),
            ...(c.color ? ['--color', c.color] : []), ...(c.noOverlap ? ['--no-overlap'] : []), ...(c.zones ? ['--zones', c.zones.join(',')] : []),
            ...(c.paired ? ['--paired'] : []), ...gpu],
      });
   });
   steps.push({ id: 'report', kind: 'report', title: 'Report', args: reportArgs(atlasJson, paths.summaryJson) });
   return steps;
}

function reportArgs(atlasJson, summaryJson) {
   return ['report', '--atlas', atlasJson, '--summary-json', summaryJson];
}

/** Shell-quoted command line, for display and for the job log. */
function commandLine(args) {
   return ['node scripts-dev/ghostyle-fuzz.cjs', ...args.map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`))].join(' ');
}

/**
 * Read one line of fuzzer output (stdout or stderr) into a progress event, or null.
 * The formats are those of ghostyle-fuzz.cjs 1.1.0.
 */
function parseLogLine(line) {
   let m;
   if ((m = /scanned (\d+)\/(\d+) frames/.exec(line))) return { type: 'scan', done: +m[1], total: +m[2] };
   if ((m = /face-api on candidates (\d+)\/(\d+)/.exec(line))) return { type: 'candidates', done: +m[1], total: +m[2] };
   if ((m = /^imprints\s*:\s*(\d+)/.exec(line))) return { type: 'imprints', imprints: +m[1] };
   if ((m = /atlas loaded: (\d+) imprints/.exec(line))) return { type: 'imprints', imprints: +m[1] };
   if ((m = /trial (\d+)\/(\d+) seed (\d+): pruned after (\d+) imprints\s+\(([\d.]+) s\)/.exec(line))) {
      return { type: 'trial', done: +m[1], total: +m[2], seed: +m[3], pruned: true, evaluated: +m[4], seconds: +m[5] };
   }
   if ((m = /trial (\d+)\/(\d+) seed (\d+): escape ([\d.]+)%.*?\(([\d.]+) s\)\s*$/.exec(line))) {
      return { type: 'trial', done: +m[1], total: +m[2], seed: +m[3], pruned: false, escape: +m[4] / 100, seconds: +m[5] };
   }
   if ((m = /materialising (\d+) trial/.exec(line))) return { type: 'materialise', count: +m[1] };
   return null;
}

/**
 * Fold a progress event into a job's progress state (mutates and returns it).
 * state: { imprints, evals, seconds, prunedShare: {pruned, trials}, current: {done, total, phase} }
 */
function applyProgress(state, event) {
   if (!event) return state;
   if (event.type === 'imprints') state.imprints = event.imprints;
   if (event.type === 'scan' || event.type === 'candidates') state.current = { phase: event.type, done: event.done, total: event.total };
   if (event.type === 'materialise') state.current = { ...(state.current || {}), phase: 'materialise' };
   if (event.type === 'trial') {
      state.current = { phase: 'trial', done: event.done, total: event.total };
      const evaluated = event.pruned ? event.evaluated : (state.imprints || null);
      if (evaluated) { state.evals = (state.evals || 0) + evaluated; state.seconds = (state.seconds || 0) + event.seconds; }
      state.trialsSeen = (state.trialsSeen || 0) + 1;
      state.prunedTrials = (state.prunedTrials || 0) + (event.pruned ? 1 : 0);
      state.costShare = (state.costShare || 0) + (event.pruned && state.imprints ? event.evaluated / state.imprints : 1);
   }
   return state;
}

/**
 * Imprints to expect before the atlas exists: about 25 at 10° bins (the
 * October atlases had 14-40), scaling with the number of yaw × pitch cells,
 * within the --max-imprints cap.
 */
function expectedImprints(plan, factor = 1) {
   const n = DEFAULT_IMPRINTS * factor * (10 / plan.atlas.bin) ** 2;
   return Math.max(4, Math.min(plan.atlas.maxImprints, Math.round(n)));
}

/** Seconds per imprint evaluation: measured once 3+ trials ran, the default before. */
function secondsPerEval(state) {
   return state && state.evals >= 30 ? state.seconds / state.evals : DEFAULT_SECONDS_PER_EVAL;
}

/**
 * Estimated seconds left for a job.
 *
 * @param {object} plan
 * @param {{stepIndex: number, progress: object}} at  Index of the step running now (or next), and the progress state.
 * @param {number} [videoSeconds] Duration of the video, for the atlas estimate.
 */
function estimateRemaining(plan, at, videoSeconds = 30) {
   const progress = at.progress || {};
   const imprints = progress.imprints || expectedImprints(plan);
   const spe = secondsPerEval(progress);
   const measuredShare = progress.trialsSeen >= 10 ? progress.costShare / progress.trialsSeen : null;
   const trialSeconds = (c) => imprints * spe * (c.prune ? (measuredShare ?? DEFAULT_PRUNE_FACTOR) : 1);
   const materialiseSeconds = (c) => Math.min(c.top, c.trials) * imprints * 0.15;
   // Per cell: Chromium and the models start (~25 s), the control step re-describes every clean imprint (~1 s each), intermediate report.
   const cellOverhead = 30 + imprints * 1.0;
   let total = 0;
   // Step 0 is the atlas: MediaPipe on every sampled frame, then face-api on ~3 candidates per pose bin.
   if (at.stepIndex <= 0) {
      const atlasSeconds = videoSeconds * plan.atlas.sampleFps * 0.12 + Math.min(plan.atlas.maxImprints, 40) * plan.atlas.candidates * 2.4 + 20;
      const cur = progress.current;
      const share = !cur ? 0 : cur.phase === 'scan' ? 0.4 * cur.done / cur.total : cur.phase === 'candidates' ? 0.4 + 0.6 * cur.done / cur.total : 0;
      total += atlasSeconds * (1 - share);
   }
   plan.cells.forEach((c, i) => {
      const stepIndex = i + 1;
      if (stepIndex < at.stepIndex) return;
      const done = stepIndex === at.stepIndex && progress.current && progress.current.phase === 'trial' ? progress.current.done : 0;
      total += (c.trials - done) * trialSeconds(c) + materialiseSeconds(c) + (done ? 0 : cellOverhead);
   });
   return Math.round(total + 10); // final report
}

/** "2 h 05 min", "12 min", "40 s". */
function formatDuration(seconds) {
   if (!Number.isFinite(seconds)) return '—';
   const s = Math.max(0, Math.round(seconds));
   if (s < 60) return `${s} s`;
   const m = Math.round(s / 60);
   if (m < 60) return `${m} min`;
   return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

module.exports = {
   ZONES, ATLAS_DEFAULTS, CELL_DEFAULTS, PRESETS, STANDARD_CELLS, DEFAULT_SECONDS_PER_EVAL, DEFAULT_IMPRINTS,
   presetPlan, normalisePlan, expectedImprints, buildSteps, reportArgs, commandLine, parseLogLine, applyProgress, secondsPerEval, estimateRemaining, formatDuration,
};
