import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import lf from '../../scripts-dev/localfuzzer/jobs-core.cjs';
import { normaliseRecipe, parseCssColour } from '../../scripts-dev/ghostyle-fuzz/fuzz-core.mjs';

const recipesDir = resolve(process.cwd(), 'scripts-dev/ghostyle-fuzz/recipes');
const recipes = Object.fromEntries(readdirSync(recipesDir).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(readFileSync(resolve(recipesDir, f), 'utf8'))]));
const ctx = { recipes, parseColour: parseCssColour, normaliseRecipe };

describe('localfuzzer core: presets and plans', () => {
   it('every preset is a valid plan whose recipes are bundled', () => {
      for (const name of Object.keys(lf.PRESETS)) {
         const { plan, errors } = lf.normalisePlan(lf.presetPlan(name), ctx);
         expect(errors).toEqual([]);
         expect(plan.preset).toBe(name);
         for (const c of plan.cells) expect(recipes[c.recipe]).toBeDefined();
      }
   });

   it('keeps the CLI defaults for omitted fields', () => {
      const { plan } = lf.normalisePlan({ cells: [{ recipe: 'three-bands.json' }] }, ctx);
      expect(plan.atlas).toEqual(lf.ATLAS_DEFAULTS);
      expect(plan.cells[0]).toMatchObject({ trials: 25, seed: 1000, prune: true, pruneSubset: 12, pruneMargin: 0.15, paired: true });
      expect(plan.preset).toBe('custom');
   });

   it('rejects what the fuzzer would reject, before queueing', () => {
      const bad = (cell, atlas = {}) => lf.normalisePlan({ atlas, cells: [{ recipe: 'three-bands.json', ...cell }] }, ctx).errors;
      expect(bad({ color: 'white', paired: true })).toEqual([expect.stringMatching(/exclude each other/)]);
      expect(bad({ color: 'blurple', paired: false })[0]).toMatch(/not a CSS/);
      expect(bad({ zones: ['chin'] })[0]).toMatch(/unknown zone/);
      expect(bad({ trials: 0 })[0]).toMatch(/trials/);
      expect(bad({ recipe: 'nope.json' })[0]).toMatch(/no bundled recipe/);
      expect(bad({}, { anchorWindow: '3-1' })[0]).toMatch(/anchor window/);
      expect(bad({}, { maxImprints: 1 })[0]).toMatch(/max imprints/);
      // a recipe that forces black cannot be asked for white, nor paired
      expect(bad({ recipe: 'three-bands-black.json', color: 'white', paired: false })[0]).toMatch(/recipe sets color/);
      expect(bad({ recipe: 'three-bands-black.json', paired: true })[0]).toMatch(/forces a colour/);
      expect(bad({ recipe: 'three-bands-black.json', color: '#000', paired: false })).toEqual([]);
      expect(bad({ recipe: { name: 'x', widht: 2 } })[0]).toMatch(/custom recipe: recipe: unknown key/);
      expect(lf.normalisePlan({ cells: [] }, ctx).errors[0]).toMatch(/at least one/);
   });

   it('drops a zone list that names every zone, and de-duplicates cell names', () => {
      const { plan } = lf.normalisePlan({ cells: [{ name: 'a', zones: lf.ZONES }, { name: 'a' }] }, ctx);
      expect(plan.cells[0].zones).toBeNull();
      expect(plan.cells.map((c) => c.name)).toEqual(['a', 'a-2']);
   });
});

describe('localfuzzer core: command lines', () => {
   const paths = { video: '/data/jobs/j/video.mp4', atlasDir: '/data/jobs/j/atlas', summaryJson: '/data/jobs/j/summary.json', recipePath: (c) => `/r/${typeof c.recipe === 'string' ? c.recipe : 'custom.json'}` };

   it('maps every plan field to its fuzzer option', () => {
      const { plan } = lf.normalisePlan({
         gpu: true,
         atlas: { sampleFps: 10, bin: 15, maxImprints: 30, candidates: 4, anchorWindow: '0-2', maxGap: 1 },
         cells: [{ name: 'x', recipe: 'three-bands.json', trials: 7, seed: 5, top: 3, prune: false, color: 'red', paired: false, noOverlap: true, zones: ['eyes', 'nose-cheeks'] }],
      }, ctx);
      const steps = lf.buildSteps(plan, paths);
      expect(steps.map((s) => s.kind)).toEqual(['atlas', 'trial', 'report']);
      expect(steps[0].args).toEqual(['atlas', '--video', paths.video, '--output', paths.atlasDir, '--sample-fps', '10', '--bin', '15', '--max-imprints', '30', '--candidates', '4', '--anchor-window', '0-2', '--max-gap', '1', '--gpu']);
      expect(steps[1].args).toEqual(['trial', '--atlas', '/data/jobs/j/atlas/pose-atlas.json', '--recipe', '/r/three-bands.json', '--trials', '7', '--seed', '5', '--top', '3', '--no-prune', '--color', 'red', '--no-overlap', '--zones', 'eyes,nose-cheeks', '--gpu']);
      expect(steps[2].args).toEqual(['report', '--atlas', '/data/jobs/j/atlas/pose-atlas.json', '--summary-json', paths.summaryJson]);
   });

   it('passes the prune options and --paired when set', () => {
      const { plan } = lf.normalisePlan({ cells: [{ recipe: 'three-bands.json', pruneSubset: 16, pruneMargin: 0.1 }] }, ctx);
      const args = lf.buildSteps(plan, paths)[1].args;
      expect(args).toEqual(expect.arrayContaining(['--prune-subset', '16', '--prune-margin', '0.1', '--paired']));
      expect(args).not.toContain('--no-prune');
      expect(lf.commandLine(['trial', '--color', 'rgb(1, 2, 3)'])).toBe("node scripts-dev/ghostyle-fuzz.cjs trial --color 'rgb(1, 2, 3)'");
   });
});

describe('localfuzzer core: progress and time', () => {
   it('reads the fuzzer progress lines', () => {
      expect(lf.parseLogLine('[   41.5s] scanned 350/477 frames, face in 350')).toEqual({ type: 'scan', done: 350, total: 477 });
      expect(lf.parseLogLine('[  99.4s] face-api on candidates 20/49')).toEqual({ type: 'candidates', done: 20, total: 49 });
      expect(lf.parseLogLine('imprints : 15  yaw -20..17°')).toEqual({ type: 'imprints', imprints: 15 });
      expect(lf.parseLogLine('[    3.0s] atlas loaded: 27 imprints')).toEqual({ type: 'imprints', imprints: 27 });
      expect(lf.parseLogLine('[   71.0s] trial 1/2 seed 7: escape 40.0% (lost 13.3% + descriptor 26.7%)  worst 0.2172  coverage 10.6%  (33.5 s)'))
         .toEqual({ type: 'trial', done: 1, total: 2, seed: 7, pruned: false, escape: 0.4, seconds: 33.5 });
      expect(lf.parseLogLine('[  171.0s] trial 30/400 seed 30: pruned after 12 imprints  (14.2 s)'))
         .toEqual({ type: 'trial', done: 30, total: 400, seed: 30, pruned: true, evaluated: 12, seconds: 14.2 });
      expect(lf.parseLogLine('[   75.3s] materialising 5 trial(s)')).toEqual({ type: 'materialise', count: 5 });
      expect(lf.parseLogLine('anything else')).toBeNull();
   });

   it('measures seconds per evaluation and the cost of pruned trials', () => {
      const st = {};
      lf.applyProgress(st, { type: 'imprints', imprints: 20 });
      for (let i = 0; i < 4; i += 1) lf.applyProgress(st, { type: 'trial', done: i + 1, total: 10, pruned: false, seconds: 40 });
      lf.applyProgress(st, { type: 'trial', done: 5, total: 10, pruned: true, evaluated: 10, seconds: 20 });
      expect(st.evals).toBe(90);
      expect(lf.secondsPerEval(st)).toBeCloseTo(180 / 90);
      expect(st.costShare).toBeCloseTo(4.5);
      expect(lf.secondsPerEval({})).toBe(lf.DEFAULT_SECONDS_PER_EVAL);
   });

   it('estimates less time as the job advances, and nothing for finished cells', () => {
      const plan = lf.presetPlan('quick');
      const imprints = lf.expectedImprints(plan);
      const before = lf.estimateRemaining(plan, { stepIndex: 0, progress: {} }, 30);
      const afterAtlas = lf.estimateRemaining(plan, { stepIndex: 1, progress: { imprints } }, 30);
      const midway = lf.estimateRemaining(plan, { stepIndex: 2, progress: { imprints, current: { phase: 'trial', done: 15, total: 30 } } }, 30);
      expect(before).toBeGreaterThan(afterAtlas);
      expect(afterAtlas).toBeGreaterThan(midway);
      // Deep is the longest preset, Quick the shortest
      const at = { stepIndex: 1, progress: { imprints: 25 } };
      expect(lf.estimateRemaining(lf.presetPlan('deep'), at)).toBeGreaterThan(lf.estimateRemaining(lf.presetPlan('standard'), at));
      expect(lf.estimateRemaining(lf.presetPlan('standard'), at)).toBeGreaterThan(lf.estimateRemaining(lf.presetPlan('quick'), at));
      expect(lf.formatDuration(7500)).toBe('2 h 05 min');
      // expected imprints follow the bin size and the cap
      expect(lf.expectedImprints(lf.presetPlan('standard'))).toBe(25);
      expect(lf.expectedImprints(lf.presetPlan('quick'))).toBe(11);
      expect(lf.expectedImprints({ atlas: { bin: 5, maxImprints: 60 } })).toBe(60);
      expect(lf.formatDuration(40)).toBe('40 s');
   });
});
