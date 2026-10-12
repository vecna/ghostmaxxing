import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compareConditions,
  createBaselineCollector,
  createQualityGate,
  euclidean,
  medoid,
  summarizeConditions,
} from '../../lab-js/realtime/realtime-capture.js';

describe('realtime temporal measurement helpers', () => {
  afterEach(() => vi.useRealTimers());

  it('uses a real descriptor as medoid and reports Euclidean spread', () => {
    const descriptors = [[0, 0], [0.1, 0], [0.2, 0]];
    const result = medoid(descriptors);
    expect(result.descriptor).toEqual([0.1, 0]);
    expect(result.spread).toBeCloseTo(0.1);
    expect(euclidean(result.descriptor, descriptors[0])).toBeCloseTo(0.1);
  });

  it('averages accepted 2D capture conditions', () => {
    const profile = summarizeConditions([
      { rollDegrees: -2, yawOffset: -0.02, boxWidthRatio: 0.4, centerXRatio: 0.48, centerYRatio: 0.5, luma: 0.4 },
      { rollDegrees: 2, yawOffset: 0.02, boxWidthRatio: 0.5, centerXRatio: 0.52, centerYRatio: 0.6, luma: 0.6 },
    ]);
    expect(profile).toEqual({
      rollDegrees: 0,
      yawOffset: 0,
      boxWidthRatio: 0.45,
      centerXRatio: 0.5,
      centerYRatio: 0.55,
      luma: 0.5,
    });
  });

  it('excludes pose and light changes but accepts comparable frames', () => {
    const baseline = {
      rollDegrees: 0,
      yawOffset: 0,
      boxWidthRatio: 0.45,
      centerXRatio: 0.5,
      centerYRatio: 0.5,
      luma: 0.5,
    };
    expect(compareConditions(baseline, { ...baseline, yawOffset: 0.03 }).ok).toBe(true);
    expect(compareConditions(baseline, { ...baseline, rollDegrees: 7 })).toMatchObject({
      ok: false,
      reason: 'Return to the baseline pose and framing.',
    });
    expect(compareConditions(baseline, { ...baseline, luma: 0.7 })).toMatchObject({
      ok: false,
      reason: 'Lighting differs too much from the baseline.',
    });
  });

  it('builds a temporal medoid and condition profile after time and sample requirements', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z'));
    const collector = createBaselineCollector({
      targetSamples: 3,
      minDurationMs: 1000,
      timeoutMs: 5000,
      maxSpread: 0.2,
    });
    const metrics = {
      rollDegrees: 0,
      yawOffset: 0,
      boxWidthRatio: 0.4,
      centerXRatio: 0.5,
      centerYRatio: 0.5,
      luma: 0.5,
    };
    collector.start();
    expect(collector.offer({ ok: true, reason: '', metrics }, [0, 0]).status).toBe('collecting');
    vi.advanceTimersByTime(500);
    expect(collector.offer({ ok: true, reason: '', metrics }, [0.01, 0]).status).toBe('collecting');
    vi.advanceTimersByTime(500);
    const result = collector.offer({ ok: true, reason: '', metrics }, [0.02, 0]);
    expect(result.status).toBe('done');
    expect(result.baseline.descriptor).toEqual([0.01, 0]);
    for (const [key, value] of Object.entries(metrics)) {
      expect(result.baseline.conditions[key]).toBeCloseTo(value);
    }
  });

  it('keeps post-baseline appearance changes measurable', () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    const previous = getContext.getMockImplementation();
    const pixels = new Uint8ClampedArray(96 * 96 * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = 5;
      pixels[offset + 1] = 5;
      pixels[offset + 2] = 5;
      pixels[offset + 3] = 255;
    }
    getContext.mockImplementation(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: pixels })),
    }));

    try {
      const video = { videoWidth: 640, videoHeight: 480 };
      const positions = Array.from({ length: 68 }, () => ({ x: 320, y: 220 }));
      positions[36] = { x: 256, y: 200 };
      positions[45] = { x: 384, y: 200 };
      positions[30] = { x: 320, y: 230 };
      const detection = {
        detection: {
          score: 0.4,
          box: { x: 160, y: 100, width: 320, height: 300 },
        },
        landmarks: { positions },
      };
      const gate = createQualityGate(video);

      expect(gate.evaluate(detection)).toMatchObject({
        ok: false,
        reason: 'Detector confidence is low (0.40). Hold a frontal, steady pose and check glare or shadows.',
      });
      expect(gate.evaluate(detection, { allowAppearanceChanges: true })).toMatchObject({
        ok: true,
        metrics: {
          rollDegrees: 0,
          yawOffset: 0,
          boxWidthRatio: 0.5,
        },
      });
    } finally {
      getContext.mockImplementation(previous);
    }
  });
});
