import { describe, it, expect } from 'vitest';
import {
  distanceToDiversity,
  seekFaceInDb,
  computeCompositeMetrics,
  decideMatchState,
} from '../../lab-js/landmark-analysis.js';

describe('landmark-analysis', () => {
  it('distanceToDiversity maps expected values', () => {
    expect(distanceToDiversity(0.0)).toBe(0);
    expect(distanceToDiversity(1.0)).toBe(100);
    expect(distanceToDiversity(0.58)).toBe(58);
  });

  it('seekFaceInDb returns closest match id and distance', () => {
    const liveResult = { detection: { score: 0.88 }, descriptor: [0, 0] };
    const dbFaces = [
      { id: 7, descriptor: [0.1, 0.1] },
      { id: 9, descriptor: [0.7, 0.7] },
    ];

    const found = seekFaceInDb(liveResult, dbFaces);
    expect(found.liveScore).toBe(0.88);
    expect(found.liveMinId).toBe(7);
    expect(found.liveMinDist).toBeLessThan(0.2);
  });

  it('computeCompositeMetrics computes nearest obfuscated match', () => {
    const composite = {
      obfuscatedResult: {
        detection: { score: 0.66 },
        descriptor: [0.1, 0.1],
      },
      weakDetection: false,
    };
    const dbFaces = [
      { id: 1, descriptor: [0.1, 0.1] },
      { id: 2, descriptor: [0.9, 0.9] },
    ];

    const metrics = computeCompositeMetrics(composite, dbFaces);
    expect(metrics.obfScore).toBe(0.66);
    expect(metrics.obfMinId).toBe(1);
    expect(metrics.weakDetection).toBe(false);
    expect(metrics.detectionTotallyFailed).toBe(false);
  });

  it('decideMatchState formats matched headline in diversity scale', () => {
    const matched = decideMatchState({
      liveMinDist: 0.23,
      liveMinId: 3,
      obfMinDist: null,
      obfMinId: null,
      weakDetection: false,
      detectionTotallyFailed: false,
      matchThreshold: 0.58,
    });

    expect(matched.detectionState).toBe('matched');
    expect(matched.headline).toBe('Corrispondenza trovata: ID 3 (diversita 23% sotto soglia 58%).');
  });

  it('decideMatchState formats no-match headline in diversity scale', () => {
    const noMatch = decideMatchState({
      liveMinDist: 0.78,
      liveMinId: null,
      obfMinDist: null,
      obfMinId: null,
      weakDetection: false,
      detectionTotallyFailed: false,
      matchThreshold: 0.58,
    });

    expect(noMatch.detectionState).toBe('eluded');
    expect(noMatch.headline).toBe('Nessuna corrispondenza: diversita 78% sopra soglia 58%.');
  });

  it('decideMatchState formats ghostyle-under-threshold headline in diversity scale', () => {
    const ghostyleMatch = decideMatchState({
      liveMinDist: 0.2,
      liveMinId: 3,
      obfMinDist: 0.31,
      obfMinId: 3,
      weakDetection: false,
      detectionTotallyFailed: false,
      matchThreshold: 0.58,
    });

    expect(ghostyleMatch.detectionState).toBe('unclear');
    expect(ghostyleMatch.headline).toBe('Il rilevatore con il Ghostyle vede il volto con ID 3 - diversita 31%.');
  });

  it('decideMatchState formats ghostyle-no-match headline in diversity scale', () => {
    const ghostyleNoMatch = decideMatchState({
      liveMinDist: 0.2,
      liveMinId: 3,
      obfMinDist: 0.64,
      obfMinId: null,
      weakDetection: false,
      detectionTotallyFailed: false,
      matchThreshold: 0.58,
    });

    expect(ghostyleNoMatch.detectionState).toBe('eluded');
    expect(ghostyleNoMatch.headline).toBe('Ghostyle attivo: volto rilevato ma diversita 64% sopra soglia 58%.');
  });

  it('decideMatchState keeps totallyFailed and weakDetection messages unchanged', () => {
    const failed = decideMatchState({
      liveMinDist: null,
      liveMinId: null,
      obfMinDist: null,
      obfMinId: null,
      weakDetection: false,
      detectionTotallyFailed: true,
      matchThreshold: 0.58,
    });

    const weak = decideMatchState({
      liveMinDist: null,
      liveMinId: null,
      obfMinDist: null,
      obfMinId: null,
      weakDetection: true,
      detectionTotallyFailed: false,
      matchThreshold: 0.58,
    });

    expect(failed.headline).toContain('Rilevatore ingannato dal Ghostyle');
    expect(weak.headline).toContain('bassa confidenza');
  });
});
