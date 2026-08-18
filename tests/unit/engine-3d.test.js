import { describe, it, expect, beforeEach } from 'vitest';
import { cosineSimilarity, decideMatchState3d, seekFaceInDb3d, evaluateMatch3d } from '../../lab-js/engine-3d.js';
import { state } from '../../lab-js/state.js';

describe('engine-3d.js biometric pipeline', () => {
  beforeEach(() => {
    state.MATCH_THRESHOLD_3D = 0.85;
    state.db3d = {
      faces: []
    };
  });

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const vecA = [1, 2, 3];
      const vecB = [1, 2, 3];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1, 5);
    });

    it('returns -1 for opposite vectors', () => {
      const vecA = [1, 1];
      const vecB = [-1, -1];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(-1, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      const vecA = [1, 0];
      const vecB = [0, 1];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0, 5);
    });

    it('handles zero vectors gracefully', () => {
      const vecA = [0, 0];
      const vecB = [1, 1];
      expect(cosineSimilarity(vecA, vecB)).toBe(0);
    });
  });

  describe('seekFaceInDb3d', () => {
    it('returns null values if db3d is null or empty', () => {
      state.db3d = null;
      expect(seekFaceInDb3d([1, 2, 3])).toEqual({ liveMaxSim: null, liveMaxId: null });

      state.db3d = { faces: [] };
      expect(seekFaceInDb3d([1, 2, 3])).toEqual({ liveMaxSim: null, liveMaxId: null });
    });

    it('finds the face with the highest cosine similarity', () => {
      state.db3d = {
        faces: [
          { id: 1, descriptor3d: [1, 0] },
          { id: 2, descriptor3d: [0.8, 0.6] }
        ]
      };
      // Query [0.8, 0.6] is identical to face ID 2 (similarity 1), and similar to ID 1 (similarity 0.8)
      const result = seekFaceInDb3d([0.8, 0.6]);
      expect(result.liveMaxId).toBe(2);
      expect(result.liveMaxSim).toBeCloseTo(1, 5);
    });
  });

  describe('decideMatchState3d', () => {
    it('returns unknown if liveMaxSim is null and no ghostyle', () => {
      const result = decideMatchState3d({
        liveMaxSim: null,
        liveMaxId: null,
        obfMaxSim: null,
        obfMaxId: null
      });
      expect(result.detectionState).toBe('unknown');
    });

    it('returns matched if liveMaxSim >= threshold and no ghostyle', () => {
      const result = decideMatchState3d({
        liveMaxSim: 0.9,
        liveMaxId: 4,
        obfMaxSim: null,
        obfMaxId: null
      });
      expect(result.detectionState).toBe('matched');
      expect(result.headline).toContain('ID 4');
    });

    it('returns eluded if liveMaxSim < threshold and no ghostyle', () => {
      const result = decideMatchState3d({
        liveMaxSim: 0.7,
        liveMaxId: 4,
        obfMaxSim: null,
        obfMaxId: null
      });
      expect(result.detectionState).toBe('eluded');
    });

    it('returns matched based on obfMaxSim if ghostyle is present', () => {
      const result = decideMatchState3d({
        liveMaxSim: 0.95,
        liveMaxId: 4,
        obfMaxSim: 0.88,
        obfMaxId: 4
      });
      expect(result.detectionState).toBe('matched');
      expect(result.headline).toContain('Ghostyle presente');
    });

    it('returns eluded based on obfMaxSim if ghostyle is present and obfMaxSim < threshold', () => {
      const result = decideMatchState3d({
        liveMaxSim: 0.95,
        liveMaxId: 4,
        obfMaxSim: 0.6,
        obfMaxId: 4
      });
      expect(result.detectionState).toBe('eluded');
    });
  });

  describe('evaluateMatch3d', () => {
    it('returns null if result3d is null', () => {
      expect(evaluateMatch3d(null)).toBeNull();
    });

    it('evaluates match correctly with live and obfuscated inputs', () => {
      state.db3d = {
        faces: [
          { id: 1, descriptor3d: [1, 0, 0] }
        ]
      };
      const result3d = {
        liveInfo3d: { liveMaxSim: 0.9, liveMaxId: 1 },
        composite3d: { embedding: [0, 1, 0] } // orthogonal, so similarity will be 0
      };

      const result = evaluateMatch3d(result3d);
      expect(result.liveMaxSim).toBe(0.9);
      expect(result.liveMaxId).toBe(1);
      expect(result.obfMaxSim).toBe(0);
      expect(result.obfMaxId).toBe(1);
      expect(result.detectionState).toBe('eluded'); // since obfMaxSim (0) < threshold (0.85)
    });
  });
});
