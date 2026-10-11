import { describe, expect, it } from 'vitest';
import {
  buildEmbeddingBaseline,
  buildFaceBaseline,
  cosineSimilarity,
  createTriggerDetector,
  euclideanDistance,
  median,
  medianAbsoluteDeviation,
  visualDrift,
} from '../../lab-js/video-loader/analysis.js';

describe('video-loader analysis policy', () => {
  it('computes vector metrics and robust statistics', () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBe(5);
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(visualDrift([1, 0], [1, 0])).toBeCloseTo(0);
    expect(median([9, 1, 5, 3])).toBe(4);
    expect(medianAbsoluteDeviation([1, 2, 2, 3, 99])).toBe(1);
    expect(() => euclideanDistance([1], [1, 2])).toThrow(/same length/);
  });

  it('keeps a real embedding and descriptor as each baseline medoid', () => {
    const embeddings = [
      [1, 0, 0],
      [0.999, 0.04, 0],
      [0.998, -0.05, 0],
    ];
    const embeddingBaseline = buildEmbeddingBaseline(embeddings, {
      minimumDelta: 0.02,
      madMultiplier: 4,
    });
    expect(embeddings).toContainEqual(embeddingBaseline.embedding);
    expect(embeddingBaseline.triggerThreshold).toBeGreaterThanOrEqual(0.02);

    const descriptors = [[0, 0], [0.01, 0], [0.04, 0]];
    const faceBaseline = buildFaceBaseline(descriptors);
    expect(descriptors).toContainEqual(faceBaseline.descriptor);
    expect(faceBaseline.spread).toBeGreaterThanOrEqual(0);
  });

  it('triggers on sustained drift, face return, jump, and heartbeat without queueing frames', () => {
    const detector = createTriggerDetector({
      heartbeatSeconds: 4,
      minimumFaceApiGapSeconds: 0.5,
      jumpDelta: 0.04,
      requiredVotes: 2,
      voteWindow: 3,
    });

    const first = detector.evaluate({
      mediaTime: 0,
      facePresent: true,
      comparable: true,
      visualDrift: 0.01,
      visualThreshold: 0.05,
    });
    expect(first.reasons).toContain('identity-heartbeat');
    detector.markFaceApi(0);

    detector.evaluate({ mediaTime: 1, facePresent: false, comparable: false, visualDrift: null, visualThreshold: 0.05 });
    const returned = detector.evaluate({ mediaTime: 2, facePresent: true, comparable: true, visualDrift: 0.06, visualThreshold: 0.05 });
    expect(returned.reasons).toContain('mediapipe-face-returned');
    expect(returned.observations).toContain('mediapipe-face-returned');
    detector.markFaceApi(2);

    const sustained = detector.evaluate({ mediaTime: 3, facePresent: true, comparable: true, visualDrift: 0.11, visualThreshold: 0.05 });
    expect(sustained.shouldVerify).toBe(true);
    expect(sustained.reasons).toContain('visual-drift-sustained');
    expect(sustained.reasons).toContain('visual-drift-jump');
  });
});
