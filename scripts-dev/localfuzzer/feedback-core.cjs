/**
 * Privacy-preserving feedback payloads for the Local Fuzzer beta.
 *
 * This module deliberately knows nothing about videos, frames, descriptors,
 * skin samples, file names, job labels or logs. The server passes only the
 * allow-listed experiment summary, complete recipe definitions and Ghostyle
 * sources the participant explicitly selected.
 */

const CONSENT_VERSION = '2026-11-v1';

function sanitiseGhostyleSource(source) {
   return String(source || '')
      .replace(/^\s*\*\s*atlas source\s*:.*$/gmi, ' * atlas source : local video; filename withheld')
      .replace(/(file:\/\/|[A-Za-z]:\\|\/(?:Users|home|data|private|tmp)\/)[^\s*]+/g, '[local-path-withheld]');
}

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const integer = (value) => (Number.isInteger(Number(value)) ? Number(value) : null);

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

function buildFeedbackPayload({ version, runtime, job, summary, recipes, selectedGhostyles = [], subjectCode = '', feedback = '' }) {
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
      subjectCode: String(subjectCode || '').trim().slice(0, 32),
      feedback: String(feedback || '').trim().slice(0, 4000),
      preset: String(job.plan && job.plan.preset || ''),
      durationSeconds: Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, (finished - started) / 1000) : null,
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
      recipes: recipes.map(({ cellName, definition, row }) => ({
         recipeId: String(row.recipeId || ''),
         cellName: String(cellName || ''),
         definition,
         trials: integer(row.trials),
         complete: integer(row.complete),
         pruned: integer(row.pruned),
         secondsPerTrial: number(row.secondsPerTrial),
         aggregate: scoreSet(row),
         coverage: number(row.coverage),
         best: row.best ? { seed: integer(row.best.seed), scores: scoreSet(row.best.scores), coverage: number(row.best.coverage) } : null,
      })),
      selectedGhostyles: selectedGhostyles.map((item) => ({
         recipeId: String(item.recipeId || ''),
         seed: integer(item.seed),
         scores: scoreSet(item.scores),
         coverage: number(item.coverage),
         palette: Array.isArray(item.palette) ? item.palette.slice(0, 32).map(String) : [],
         source: sanitiseGhostyleSource(item.source),
      })),
   };
}

module.exports = { CONSENT_VERSION, buildFeedbackPayload, sanitiseGhostyleSource };
