import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRadialGraph, radialPoints } from '../../lab-js/realtime/realtime-radial.js';

describe('realtime radial fingerprint', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps every descriptor coordinate in order', () => {
    const values = new Float32Array(128);
    values[0] = 0.15;
    values[32] = -0.075;
    const points = radialPoints(values, { centerX: 10, centerY: 10, radius: 8, maxValue: 0.15 });
    expect(points).toHaveLength(128);
    expect(points[0]).toMatchObject({ index: 0 });
    expect(points[0].x).toBeCloseTo(10);
    expect(points[0].y).toBeCloseTo(2);
    expect(points[0].value).toBeCloseTo(0.15);
    expect(points[32]).toMatchObject({ index: 32 });
    expect(points[32].x).toBeCloseTo(14);
    expect(points[32].y).toBeCloseTo(10);
    expect(points[32].value).toBeCloseTo(0.075);
    expect(points[127].index).toBe(127);
  });

  it('clamps outlying deltas and accepts empty input', () => {
    const [point] = radialPoints([1], { radius: 5, maxValue: 0.1 });
    expect(Math.hypot(point.x, point.y)).toBeCloseTo(5);
    expect(radialPoints([])).toEqual([]);
  });

  it('draws live and measured 128-coordinate fingerprints and releases its observer', () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      constructor(callback) {
        this.callback = callback;
      }

      observe(element) {
        observe(element);
        this.callback();
      }

      disconnect() {
        disconnect();
      }
    });

    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
    };
    const canvas = document.createElement('canvas');
    canvas.getContext = vi.fn(() => ctx);
    canvas.getBoundingClientRect = vi.fn(() => ({ width: 200, height: 180 }));

    const graph = createRadialGraph({ canvasEl: canvas, maxDelta: 0.2 });
    graph.setLive(new Float32Array(128).fill(0.05));
    graph.setMeasured(new Float32Array(128).fill(0.1));

    expect(observe).toHaveBeenCalledWith(canvas);
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();

    graph.reset();
    graph.destroy();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
