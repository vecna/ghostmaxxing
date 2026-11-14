import { describe, expect, it } from 'vitest';
import feedback from '../../scripts-dev/localfuzzer/feedback-core.cjs';

describe('localfuzzer anonymous beta feedback', () => {
   const summary = {
      atlas: { source: '/Users/alice/Diana.mp4', imprints: 12, yaw: [-30, 30], pitch: [-10, 10], skinLab: [1, 2, 3], unrecognisedBins: 2, sharpnessMedian: 42, cleanScoreMean: 0.91, noiseFloor: { median: 0.01, p90: 0.02 } },
      recipes: [{ recipeId: 'custom-deadbeef', trials: 8, complete: 7, pruned: 1, escape: 0.6, lostRate: 0.2, descriptorEscape: 0.4, coverage: 0.35, best: { seed: 4, scores: { escapeRate: 0.8, lostRate: 0.3, descriptorEscape: 0.5 }, coverage: 0.4 } }],
   };

   it('shares attempts, complete custom recipes and selected modules without local identity data', () => {
      const payload = feedback.buildFeedbackPayload({
         version: '1.1.0', runtime: { platform: 'darwin', arch: 'arm64', node: 'v24', backend: 'webgl' },
         job: { label: 'Diana', video: { original: 'Diana.mp4' }, plan: { preset: 'custom' }, startedAt: '2026-11-02T10:00:00Z', finishedAt: '2026-11-02T10:02:00Z' },
         summary,
         recipes: [{ cellName: 'my-cell', definition: { name: 'custom', count: 4 }, row: summary.recipes[0] }],
         selectedGhostyles: [{ recipeId: 'custom-deadbeef', seed: 4, scores: summary.recipes[0].best.scores, coverage: 0.4, palette: ['#fff'], source: '/* ==Ghostyle==\n * atlas source : /Users/alice/Diana.mp4\n */\nexport function paintUV() {}' }],
         subjectCode: 'D', feedback: 'clear enough',
      });
      expect(payload.attempts).toEqual({ total: 8, complete: 7, pruned: 1 });
      expect(payload.recipes[0].definition).toEqual({ name: 'custom', count: 4 });
      expect(payload.selectedGhostyles[0].source).toContain('filename withheld');
      const json = JSON.stringify(payload);
      expect(json).not.toContain('Diana');
      expect(json).not.toContain('/Users/');
      expect(json).not.toContain('skinLab');
   });
});
