import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../scripts/main.js', () => ({
  els: {},
  clearOverlay: vi.fn(),
  DETECTOR_OPTIONS: {}
}));

vi.mock('../../scripts/utils.js', () => ({
  distance: vi.fn(() => 0),
  avgPoint: vi.fn(() => ({ x: 0, y: 0 })),
  drawClosedPath: vi.fn(),
  drawOpenPath: vi.fn(),
  roundRect: vi.fn(),
  setLog: vi.fn()
}));

vi.mock('../../scripts/camera.js', () => ({
  triggerOverlayFadeout: vi.fn(),
  resizeCanvas: vi.fn()
}));

vi.mock('../../scripts/db.js', () => ({
  persistDb: vi.fn(),
  renderDbStats: vi.fn()
}));

import { hasActivePlugin } from '../../scripts/engine.js';

describe('engine.hasActivePlugin', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    window.gstmxx = {
      getActiveEffect: () => null,
      getActiveEffect3d: () => null
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when no 2D or 3D effect is active', () => {
    expect(hasActivePlugin()).toBe(false);
  });

  it('returns true when a 2D effect is active', () => {
    window.gstmxx.getActiveEffect = () => 'graphic-liner';
    expect(hasActivePlugin()).toBe(true);
  });

  it('returns true when a 3D effect is active', () => {
    window.gstmxx.getActiveEffect3d = () => 'uv-stripes';
    expect(hasActivePlugin()).toBe(true);
  });

  it('returns false when Ghostmaxxing effect accessors are missing', () => {
    window.gstmxx = {};
    expect(hasActivePlugin()).toBe(false);
  });
});
