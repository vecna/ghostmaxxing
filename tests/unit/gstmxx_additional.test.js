/**
 * Additional unit tests for Ghostmaxxing utility functions.
 *
 * These tests aim to increase coverage beyond the existing core tests.
 * They focus on:
 *  - Mathematical helpers (distance, avgPoint, lerp, scaleFrom, point).
 *  - Geometry drawing helpers using a mocked CanvasRenderingContext2D.
 *  - Public API methods accessing internal state (getDb, getMatchThreshold).
 *  - expandEyePolygon composition logic.
 *
 * Each test includes a brief rationale in comments to document why the
 * particular behavior is verified.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../scripts/main.js';
import { state } from '../../scripts/state.js';

function getDbSnapshot() {
  return structuredClone(state.db);
}

const Ghostmaxxing = window.gstmxx;

/** Helper to create a mock CanvasRenderingContext2D with spy functions. */
function createMockContext() {
  const fnNames = [
    'clearRect', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo',
    'closePath', 'fill', 'stroke', 'strokeRect', 'measureText',
    'fillText', 'arc', 'setLineDash', 'lineWidth', 'strokeStyle',
    'fillStyle', 'font'
  ];
  const ctx = {};
  fnNames.forEach(name => {
    // Some properties are numbers/strings; we treat them as mutable.
    if (name === 'lineWidth' || name === 'strokeStyle' || name === 'fillStyle' || name === 'font') {
      ctx[name] = '';
    } else {
      ctx[name] = vi.fn();
    }
  });
  return /** @type {CanvasRenderingContext2D} */ (ctx);
}

describe('Ghostmaxxing mathematical utilities', () => {
  beforeEach(() => {
    state.db = { nextId: 0, faces: [] };
    state.MATCH_THRESHOLD = 0.58;
  });

  it('distance returns Euclidean distance for equal-length vectors', () => {
    const a = [0, 0, 0];
    const b = [3, 4, 0];
    expect(Ghostmaxxing.distance(a, b)).toBeCloseTo(5);
  });

  it('distance returns POSITIVE_INFINITY for mismatched lengths', () => {
    const a = [1, 2];
    const b = [1];
    expect(Ghostmaxxing.distance(a, b)).toBe(Number.POSITIVE_INFINITY);
  });

  it('avgPoint computes the correct centroid of point array', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 20 }];
    expect(Ghostmaxxing.avgPoint(pts)).toEqual({ x: 5, y: 10 });
  });

  it('lerp interpolates correctly between two points', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 20 };
    expect(Ghostmaxxing.lerp(a, b, 0.5)).toEqual({ x: 5, y: 10 });
  });

  it('scaleFrom scales a point relative to a centre', () => {
    const centre = { x: 5, y: 5 };
    const pt = { x: 7, y: 9 };
    // vector from centre is (2,4); scaling by 2 => (4,8); result (9,13)
    expect(Ghostmaxxing.scaleFrom(centre, pt, 2)).toEqual({ x: 9, y: 13 });
  });

  it('point utility returns an object with given coordinates', () => {
    expect(Ghostmaxxing.point(3, 4)).toEqual({ x: 3, y: 4 });
  });
});

describe('Ghostmaxxing drawing utilities with mocked canvas', () => {
  let ctx;
  beforeEach(() => {
    ctx = createMockContext();
  });

  it('drawClosedPath draws a filled and stroked polygon when styles provided', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    Ghostmaxxing.drawClosedPath(ctx, pts, 'red', 'blue', 3);
    // Verify path construction calls.
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(10, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(10, 10);
    expect(ctx.closePath).toHaveBeenCalled();
    // Verify fill and stroke usage.
    expect(ctx.fillStyle).toBe('red');
    expect(ctx.strokeStyle).toBe('blue');
    expect(ctx.lineWidth).toBe(3);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('drawOpenPath draws a dashed line when requested', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }];
    Ghostmaxxing.drawOpenPath(ctx, pts, 'green', 2, true);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.setLineDash).toHaveBeenCalledWith([10, 8]);
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.strokeStyle).toBe('green');
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });
});

describe('Ghostmaxxing higher‑level utilities', () => {
  it('expandEyePolygon returns a polygon combining eyebrow and scaled eye', () => {
    const eye = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: -5, y: 5 },
      { x: 5, y: -5 },
    ];
    const eyebrow = eye.map(p => ({ x: p.x, y: p.y - 5 }));
    const tone = { scale: 1.2, brow: 0.7, fill: 'rgba(0,0,0,0.2)', stroke: 'black' };
    const poly = Ghostmaxxing.expandEyePolygon(eye, eyebrow, tone.scale, tone.brow);
    expect(poly.length).toBeGreaterThanOrEqual(6);
    // Verify that the first three points are the transformed eyebrow points.
    expect(poly[0]).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
  });

  it('getDb returns a deep clone of internal DB state', () => {
    state.db = { nextId: 0, faces: [] };
    const db1 = getDbSnapshot();
    expect(db1.faces).toBeInstanceOf(Array);
    // Mutate returned object should not affect internal state.
    db1.faces.push({ id: 999 });
    const db2 = getDbSnapshot();
    expect(db2.faces.find(f => f.id === 999)).toBeUndefined();
  });

  it('getMatchThreshold returns the configured constant', () => {
    expect(state.MATCH_THRESHOLD).toBeCloseTo(0.58);
  });
});
