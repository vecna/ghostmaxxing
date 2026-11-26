/**
 * Privacy-preserving feedback payloads for the Local Fuzzer beta.
 *
 * Keep shared records reproducible using experiment parameters and aggregate
 * measurements. Custom labels, free text and generated source stay local.
 */

const CONSENT_VERSION = '2026-11-v2';

const number = (value) => Number.isFinite(value) ? value : null;
const integer = (value) => Number.isSafeInteger(value) ? value : null;
const recipeHash = (value) => value?.match(/(?:^|-)([a-f0-9]{8})(-g\d{1,4})?$/i)?.slice(1).join('') || null;

function scoreSet(value) {
   const v = value || {};
   return {
      escapeRate: number(v.escapeRate ?? v.escape),
      lostRate: number(v.lostRate),
      descriptorEscape: number(v.descriptorEscape),
      descriptorEscapeDetected: number(v.descriptorEscapeDetected),
      worstCase: number(v.worstCase),
      medianMargin: number(v.medianMargin),
      allLost: Boolean(v.allLost),
   };
}

function buildFeedbackPayload({ version, runtime, job, summary, recipes, selectedGhostyles = [] }) {
   if (!summary || !Array.isArray(summary.recipes) || !summary.recipes.length) throw new Error('the job has no result summary yet');
   if (!Array.isArray(recipes) || !recipes.length) throw new Error('the job has no recipes to share');
   const atlas = summary.atlas || {};
   const totals = summary.recipes.reduce((out, row) => {
      out.total += integer(row.trials) || 0;
      out.complete += integer(row.complete) || 0;
      out.pruned += integer(row.pruned) || 0;
      return out;
   }, { total: 0, complete: 0, pruned: 0 });
   const started = Date.parse(job.startedAt || '');
   const finished = Date.parse(job.finishedAt || '');

   return {
      schemaVersion: '1',
      consentVersion: CONSENT_VERSION,
      app: { name: 'ghostmaxxing-localfuzzer', version: String(version || '') },
      runtime: {
         platform: String(runtime.platform || ''),
         arch: String(runtime.arch || ''),
         node: String(runtime.node || ''),
         backend: String(runtime.backend || ''),
      },
      preset: String(job.plan && job.plan.preset || ''),
      durationSeconds: Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, (finished - started) / 1000) : null,
      method: {
         geometryVersion: integer(job.geometryVersion),
         matchThreshold: number(summary.threshold),
         atlas: job.plan?.atlas || {},
      },
      atlas: {
         imprints: integer(atlas.imprints),
         yaw: Array.isArray(atlas.yaw) ? atlas.yaw.slice(0, 2).map(number) : [],
         pitch: Array.isArray(atlas.pitch) ? atlas.pitch.slice(0, 2).map(number) : [],
         unrecognisedBins: integer(atlas.unrecognisedBins),
         sharpnessMedian: number(atlas.sharpnessMedian),
         cleanScoreMean: number(atlas.cleanScoreMean),
         noiseFloor: atlas.noiseFloor ? { median: number(atlas.noiseFloor.median), p90: number(atlas.noiseFloor.p90) } : null,
      },
      attempts: totals,
      recipes: recipes.map(({ definition: { name, ...definition }, row, plan }) => ({
         recipeId: recipeHash(row.recipeId),
         definition,
         plan,
         trials: integer(row.trials),
         complete: integer(row.complete),
         pruned: integer(row.pruned),
         secondsPerTrial: number(row.secondsPerTrial),
         aggregate: scoreSet(row),
         coverage: number(row.coverage),
         best: row.best ? { seed: integer(row.best.seed), scores: scoreSet(row.best.scores), coverage: number(row.best.coverage) } : null,
      })),
      selectedGhostyles: selectedGhostyles.map((item) => ({
         recipeId: recipeHash(item.recipeId),
         seed: integer(item.seed),
         scores: scoreSet(item.scores),
         coverage: number(item.coverage),
         palette: Array.isArray(item.palette) ? item.palette.slice(0, 32).map(String) : [],
      })),
   };
}

module.exports = { CONSENT_VERSION, buildFeedbackPayload };
