import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGraph } from '../../lab-js/realtime/realtime-graph.js';

describe('realtime timeline phases', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('counts phase events separately and does not render them as absence gaps', () => {
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      constructor(callback) {
        this.callback = callback;
      }

      observe() {
        this.callback();
      }

      disconnect() {
        disconnect();
      }
    });

    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      setLineDash: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      measureText: vi.fn(() => ({ width: 40 })),
      fillText: vi.fn(),
    };
    const scroll = document.createElement('div');
    scroll.getBoundingClientRect = vi.fn(() => ({ width: 260, height: 300 }));
    const spacer = document.createElement('div');
    const canvas = document.createElement('canvas');
    canvas.getContext = vi.fn(() => ctx);
    canvas.getBoundingClientRect = vi.fn(() => ({ left: 0, top: 0, width: 260, height: 300 }));
    const follow = document.createElement('button');

    const graph = createGraph({
      scrollEl: scroll,
      spacerEl: spacer,
      canvasEl: canvas,
      followEl: follow,
      windowSeconds: 60,
      samplesPerSecond: 2,
      maxDistance: 1.25,
      threshold: 0.6,
      onMarkerClick: vi.fn(),
    });

    graph.pushSample(1000, 0.1, 'applying');
    graph.addEvent(2000, 'measuring', 'step one');
    graph.pushSample(3000, 0.2, 'measuring');
    graph.beginGap(4000, 'pose/light excluded');
    graph.beginGap(4500, 'pose/light excluded');
    graph.endGap(5000);

    expect(graph.stats()).toEqual({ samples: 2, gaps: 1, events: 1, following: true });
    const labels = ctx.fillText.mock.calls.map(([label]) => label);
    expect(labels).toContain('step one');
    expect(labels.some((label) => String(label).startsWith('step one ·'))).toBe(false);

    graph.destroy();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
