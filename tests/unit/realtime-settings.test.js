import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearBaseline,
  loadBaseline,
  saveBaseline,
} from '../../lab-js/realtime/realtime-settings.js';

const descriptor = Array.from({ length: 128 }, (_, index) => index / 128);
const conditions = {
  rollDegrees: 0,
  yawOffset: 0.01,
  boxWidthRatio: 0.4,
  centerXRatio: 0.5,
  centerYRatio: 0.5,
  luma: 0.6,
};

describe('realtime baseline persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a versioned camera baseline with comparison conditions', () => {
    const baseline = {
      descriptor,
      conditions,
      noiseFloor: 0.01,
      capturedAt: 1234,
      sourceKind: 'camera',
    };

    saveBaseline(baseline);

    expect(loadBaseline()).toMatchObject(baseline);
  });

  it('rejects old, source-less, video, and condition-less baselines', () => {
    const key = 'gstmxx.realtime.baseline';
    const valid = {
      descriptor,
      conditions,
      noiseFloor: 0.01,
      capturedAt: 1234,
      sourceKind: 'camera',
      format: 2,
    };

    localStorage.setItem(key, JSON.stringify({ ...valid, format: 1 }));
    expect(loadBaseline()).toBeNull();

    localStorage.setItem(key, JSON.stringify({ ...valid, sourceKind: 'video' }));
    expect(loadBaseline()).toBeNull();

    localStorage.setItem(key, JSON.stringify({ ...valid, conditions: undefined }));
    expect(loadBaseline()).toBeNull();

    localStorage.setItem(key, JSON.stringify({ ...valid, sourceKind: undefined }));
    expect(loadBaseline()).toBeNull();

    localStorage.setItem(key, JSON.stringify({ ...valid, capturedAt: undefined }));
    expect(loadBaseline()).toBeNull();
  });

  it('deletes the stored biometric template', () => {
    saveBaseline({ descriptor, conditions, noiseFloor: 0.01, sourceKind: 'camera' });
    clearBaseline();
    expect(loadBaseline()).toBeNull();
  });
});
