import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compareConditions,
  createBaselineCollector,
  createQualityGate,
  euclidean,
  medoid,
  summarizeConditions,
  summarizeGuides,
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

  it('builds the visual guide from coordinate medians', () => {
    const makeGuide = (offset) => ({
      aspectRatio: 4 / 3,
      box: { x: 0.2 + offset, y: 0.1, width: 0.5, height: 0.7 },
      landmarks: Array.from({ length: 68 }, (_, index) => ({
        x: index / 100 + offset,
        y: index / 200,
      })),
    });
    const guide = summarizeGuides([makeGuide(0), makeGuide(0.2), makeGuide(0.1)]);
    expect(guide.box.x).toBeCloseTo(0.3);
    expect(guide.landmarks).toHaveLength(68);
    expect(guide.landmarks[10].x).toBeCloseTo(0.2);
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
      reason: 'Head angle differs from the baseline pose (roll Δ7.0°; limit 4°).',
    });
    expect(compareConditions(baseline, { ...baseline, luma: 0.7 })).toMatchObject({
      ok: false,
      reason: 'Room lighting differs from the baseline (luma Δ0.20; limit 0.10).',
    });
    expect(compareConditions(baseline, {
      ...baseline,
      boxWidthRatio: 0.6,
      centerXRatio: 0.7,
    })).toMatchObject({
      ok: false,
      reasons: [
        'Face size differs from the baseline framing. Move slightly farther from the camera.',
        'Face position differs from the baseline framing. Re-centre it in the frame.',
      ],
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
    const guide = {
      aspectRatio: 4 / 3,
      box: { x: 0.2, y: 0.1, width: 0.5, height: 0.7 },
      landmarks: Array.from({ length: 68 }, () => ({ x: 0.5, y: 0.5 })),
    };
    collector.start();
    expect(collector.offer({ ok: true, reason: '', metrics, guide }, [0, 0]).status).toBe('collecting');
    vi.advanceTimersByTime(500);
    expect(collector.offer({ ok: true, reason: '', metrics, guide }, [0.01, 0]).status).toBe('collecting');
    vi.advanceTimersByTime(500);
    const result = collector.offer({ ok: true, reason: '', metrics, guide }, [0.02, 0]);
    expect(result.status).toBe('done');
    expect(result.baseline.descriptor).toEqual([0.01, 0]);
    for (const [key, value] of Object.entries(metrics)) {
      expect(result.baseline.conditions[key]).toBeCloseTo(value);
    }
    expect(result.baseline.guide).toEqual(guide);
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
        code: 'confidence',
        reason: 'Face detected, but confidence is low (0.40; target 0.85). Hold still and check glare or shadows.',
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

  it('reports every failed quality check while keeping a primary reason', () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    const previous = getContext.getMockImplementation();
    const pixels = new Uint8ClampedArray(96 * 96 * 4).fill(255);
    getContext.mockImplementation(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: pixels })),
    }));

    try {
      const video = { videoWidth: 640, videoHeight: 480 };
      const positions = Array.from({ length: 68 }, () => ({ x: 320, y: 220 }));
      positions[36] = { x: 256, y: 180 };
      positions[45] = { x: 384, y: 220 };
      positions[30] = { x: 380, y: 230 };
      const gate = createQualityGate(video);
      const verdict = gate.evaluate({
        detection: { score: 0.4, box: { x: 0, y: 0, width: 120, height: 120 } },
        landmarks: { positions },
      });

      expect(verdict.ok).toBe(false);
      expect(verdict.code).toBe('confidence');
      expect(verdict.failures.map(({ code }) => code)).toEqual([
        'confidence',
        'scale',
        'framing',
        'roll',
        'yaw',
        'overexposed',
      ]);
      expect(verdict.reasons).toHaveLength(6);
    } finally {
      getContext.mockImplementation(previous);
    }
  });

  it('times out when a paused or ended video repeats the same frame', () => {
    vi.useFakeTimers();
    const collector = createBaselineCollector({
      targetSamples: 8, minDurationMs: 3000, timeoutMs: 5000, maxSpread: 0.2,
    });
    const frame = { sourceTimeMs: 30000, id: '30.000' };
    collector.start();
    expect(collector.offer({ ok: true }, [0, 0], frame).status).toBe('collecting');
    vi.advanceTimersByTime(5001);
    expect(collector.offer({ ok: true }, [0, 0], frame)).toMatchObject({
      status: 'failed', accepted: 1, duplicates: 1,
      reason: expect.stringContaining('video stopped advancing'),
    });
    expect(collector.isActive()).toBe(false);
    expect(collector.offer({ ok: true }, [0, 0], frame).status).toBe('idle');
  });

  it('uses media time and ignores a repeated local-video frame', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z'));
    const collector = createBaselineCollector({
      targetSamples: 2,
      minDurationMs: 1000,
      timeoutMs: 5000,
      maxSpread: 0.2,
    });
    const verdict = { ok: true, reason: '', metrics: {} };

    collector.start();
    expect(collector.offer(verdict, [0, 0], { sourceTimeMs: 2000, id: '2.000' })).toMatchObject({
      status: 'collecting',
      accepted: 1,
    });
    vi.advanceTimersByTime(1500);
    expect(collector.offer(verdict, [0, 0], { sourceTimeMs: 2000, id: '2.000' })).toMatchObject({
      status: 'waiting',
      accepted: 1,
      duplicates: 1,
    });
    expect(collector.offer(verdict, [0.01, 0], { sourceTimeMs: 3000, id: '3.000' })).toMatchObject({
      status: 'done',
      accepted: 2,
    });
  });
});
