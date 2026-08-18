// Additional tests for uncovered branches

describe('Additional coverage tests', () => {
  let ctx;
  beforeEach(() => {
    const canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
    vi.clearAllMocks();
  });

  test('drawClosedPath with only fillStyle', () => {
    const points = [utils.point(0, 0), utils.point(10, 0)];
    utils.drawClosedPath(ctx, points, 'red', null);
    expect(ctx.fillStyle).toBe('red');
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  test('drawClosedPath with only strokeStyle', () => {
    const points = [utils.point(0, 0), utils.point(10, 0)];
    utils.drawClosedPath(ctx, points, null, 'blue', 3);
    expect(ctx.lineWidth).toBe(3);
    expect(ctx.strokeStyle).toBe('blue');
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  test('updateLogDisplay with missing logBox returns early', () => {
    const original = document.getElementById('logBox');
    if (original) original.remove();
    expect(() => utils.updateLogDisplay()).not.toThrow();
    // Restore element for other tests
    const container = document.createElement('div');
    container.id = 'logBox';
    document.body.appendChild(container);
  });

  test('expandEyePolygon returns correctly sized array and values', () => {
    const eye = [utils.point(10, 10), utils.point(12, 8), utils.point(14, 10), utils.point(14, 12), utils.point(12, 14), utils.point(10, 12)];
    const eyebrow = [utils.point(10, 5), utils.point(12, 3), utils.point(14, 5)];
    const result = utils.expandEyePolygon(eye, eyebrow, 1, 0.5);
    expect(result.length).toBe(7);
    // The first element should be the interpolated eyebrow point
    const expectedFirst = utils.lerp(eye[1], eyebrow[0], 0.5);
    expect(result[0]).toEqual(expectedFirst);
  });

  test('drawEyeWing outerCorner reduction selects correct point for left side', () => {
    const eye = [
      utils.point(10, 10),
      utils.point(12, 8),
      utils.point(14, 10),
      utils.point(14, 12),
      utils.point(12, 14),
      utils.point(10, 12),
    ];
    const eyebrow = [utils.point(10, 5), utils.point(12, 3), utils.point(14, 5)];
    const tone = { scale: 1, brow: 0.5, fill: 'red', stroke: 'blue', side: 'left', tailX: -5, tailY: 2, line: 'black' };
    utils.drawEyeWing(ctx, eye, eyebrow, 'Test', tone);
    // outerCorner should be the point with smallest x (10,10)
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 10);
  });
});

// Existing tests follow ...

/**
 * Unit tests for utils.js functions.
 * Uses Vitest with JSDOM environment from setup.js.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { state } from '../../lab-js/state.js';
import * as utils from '../../lab-js/utils.js';

describe('Time utilities', () => {
  test('formatTime returns HH:MM:SS from current time', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-06-19T12:34:56.000Z'));
      const result = utils.formatTime();
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    } finally {
      vi.useRealTimers();
    }
  });

  test('formatRelativeTime returns "ora" for current time', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
      expect(utils.formatRelativeTime('2026-06-29T12:00:00.000Z')).toBe('ora');
    } finally {
      vi.useRealTimers();
    }
  });

  test('formatRelativeTime returns minutes ago', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
      expect(utils.formatRelativeTime('2026-06-29T11:43:00.000Z')).toBe('17 minuti fa');
    } finally {
      vi.useRealTimers();
    }
  });

  test('formatRelativeTime returns hours ago', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
      expect(utils.formatRelativeTime('2026-06-29T09:00:00.000Z')).toBe('3 ore fa');
    } finally {
      vi.useRealTimers();
    }
  });

  test('formatRelativeTime returns days ago', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
      expect(utils.formatRelativeTime('2026-06-26T12:00:00.000Z')).toBe('3 giorni fa');
    } finally {
      vi.useRealTimers();
    }
  });

  test('formatRelativeTime returns months ago', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
      expect(utils.formatRelativeTime('2026-04-20T12:00:00.000Z')).toBe('2 mesi fa');
    } finally {
      vi.useRealTimers();
    }
  });

  test('formatRelativeTime returns years ago', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
      expect(utils.formatRelativeTime('2024-06-20T12:00:00.000Z')).toBe('2 anni fa');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Geometry utilities', () => {
  test('distance computes Euclidean distance', () => {
    const a = [0, 0];
    const b = [3, 4];
    expect(utils.distance(a, b)).toBeCloseTo(5);
    expect(utils.distance(null, b)).toBe(Number.POSITIVE_INFINITY);
    expect(utils.distance(a, [1, 2, 3])).toBe(Number.POSITIVE_INFINITY);
  });

  test('avgPoint returns the centroid of points', () => {
    const points = [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 0 }];
    const avg = utils.avgPoint(points);
    expect(avg).toEqual({ x: 2, y: 0.6666666666666666 });
  });

  test('lerp interpolates between two points', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 10 };
    const t = 0.5;
    const res = utils.lerp(a, b, t);
    expect(res).toEqual({ x: 5, y: 5 });
  });

  test('scaleFrom scales a point relative to a centre', () => {
    const center = { x: 5, y: 5 };
    const point = { x: 7, y: 5 };
    const scale = 2;
    const res = utils.scaleFrom(center, point, scale);
    expect(res).toEqual({ x: 9, y: 5 });
  });

  test('point helper creates coordinate objects', () => {
    expect(utils.point(3, 4)).toEqual({ x: 3, y: 4 });
  });
});

// Match state utilities suite removed as computeMatchState was moved to engine.js


describe('Canvas drawing utilities', () => {
  let ctx;
  beforeEach(() => {
    const canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
    vi.clearAllMocks();
  });

  test('drawClosedPath draws a closed polygon', () => {
    // Test empty path
    utils.drawClosedPath(ctx, []);
    expect(ctx.beginPath).not.toHaveBeenCalled();

    const points = [utils.point(10, 10), utils.point(20, 10), utils.point(20, 20)];
    utils.drawClosedPath(ctx, points, 'red', 'blue', 2);
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 10);
    expect(ctx.lineTo).toHaveBeenCalledTimes(2);
    expect(ctx.closePath).toHaveBeenCalled();
    expect(ctx.fillStyle).toBe('red');
    expect(ctx.strokeStyle).toBe('blue');
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  test('drawOpenPath draws an open polyline, optionally dashed', () => {
    // Test empty path
    utils.drawOpenPath(ctx, []);
    expect(ctx.beginPath).not.toHaveBeenCalled();

    const points = [utils.point(0, 0), utils.point(10, 0)];
    utils.drawOpenPath(ctx, points, 'blue', 2, true);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(10, 0);
    expect(ctx.setLineDash).toHaveBeenCalledWith([10, 8]);
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.strokeStyle).toBe('blue');
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  test('drawLabel renders text with background (supports mirrored)', () => {
    state.isMirrored = false;
    utils.drawLabel(ctx, 'Test', 30, 40);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.font).toBe('700 14px Inter, system-ui, sans-serif');
    expect(ctx.fillStyle).toBe('rgba(238, 242, 255, 0.96)'); // final fillStyle is text fill color
    expect(ctx.fillText).toHaveBeenCalledWith('Test', 40, 30);
    expect(ctx.restore).toHaveBeenCalled();

    // With mirrored
    state.isMirrored = true;
    utils.drawLabel(ctx, 'Test', 30, 40);
    expect(ctx.translate).toHaveBeenCalled();
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
  });

  test('roundRect creates a rounded rectangle path', () => {
    utils.roundRect(ctx, 10, 10, 80, 40, 5);
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalledWith(15, 10);
    expect(ctx.arcTo).toHaveBeenCalledTimes(4);
    expect(ctx.closePath).toHaveBeenCalled();
  });

  test('expandEyePolygon computes eyebrow and eye polygon', () => {
    const eye = [
      utils.point(10, 10),
      utils.point(12, 8),
      utils.point(14, 10),
      utils.point(14, 12),
      utils.point(12, 14),
      utils.point(10, 12),
    ];
    const eyebrow = [
      utils.point(10, 5),
      utils.point(12, 3),
      utils.point(14, 5)
    ];
    const res = utils.expandEyePolygon(eye, eyebrow, 1.2, 0.5);
    expect(res.length).toBe(7);
  });

  test('drawEyeWing draws eye shapes, wings and label', () => {
    const eye = [
      utils.point(10, 10),
      utils.point(12, 8),
      utils.point(14, 10),
      utils.point(14, 12),
      utils.point(12, 14),
      utils.point(10, 12),
    ];
    const eyebrow = [
      utils.point(10, 5),
      utils.point(12, 3),
      utils.point(14, 5)
    ];
    const tone = {
      scale: 1.2,
      brow: 0.5,
      fill: 'red',
      stroke: 'blue',
      side: 'left',
      tailX: -10,
      tailY: 5,
      line: 'black'
    };
    utils.drawEyeWing(ctx, eye, eyebrow, 'Wing L', tone);
    expect(ctx.stroke).toHaveBeenCalled();

    // Right side
    tone.side = 'right';
    tone.tailX = 10;
    utils.drawEyeWing(ctx, eye, eyebrow, 'Wing R', tone);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  test('drawCheekSweep draws cheek makeup and label', () => {
    const anchor = utils.point(10, 10);
    const noseSide = utils.point(15, 10);
    const mouthCorner = utils.point(15, 20);
    const jawPoint = utils.point(10, 20);
    utils.drawCheekSweep(ctx, anchor, noseSide, mouthCorner, jawPoint, 'Cheek', 'pink', 'purple');
    expect(ctx.stroke).toHaveBeenCalled();
  });

  test('drawContourBand draws contouring lines and label', () => {
    const pts = [utils.point(10, 10), utils.point(20, 10), utils.point(30, 15)];
    utils.drawContourBand(ctx, pts, 'Contour');
    // 2 strokes for the open paths + 1 stroke inside drawLabel (roundRect outline) = 3 strokes total
    expect(ctx.stroke).toHaveBeenCalledTimes(3);
  });
});


describe('Logging utilities', () => {
  beforeEach(() => {
    state.logsArchive = [];
    state.isLogExpanded = false;
    state.visibleLogStartIndex = 0;
    const logBox = document.getElementById('logBox');
    if (logBox) logBox.innerHTML = '';
  });

  test('setLog creates a log line with timestamp and supports sourcePlugin', () => {
    utils.setLog('Hello world');
    expect(state.logsArchive.length).toBe(1);
    const line = state.logsArchive[0];
    expect(line.textContent).toContain('Hello world');
    expect(line.textContent).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);

    utils.setLog('Plugin Message', 'PluginName');
    expect(state.logsArchive.length).toBe(2);
    expect(state.logsArchive[1].textContent).toContain('[PLUGINNAME]');
  });

  test('updateLogDisplay handles empty logBox, shifts logs when exceeding 100 entries', () => {
    // Exceed 100 logs to check shifts
    for (let i = 0; i < 105; i++) {
      utils.setLog(`msg ${i}`);
    }
    expect(state.logsArchive.length).toBe(100);
  });

  test('updateLogDisplay respects expanded/collapsed state', () => {
    const logBox = document.getElementById('logBox');
    for (let i = 0; i < 10; i++) {
      utils.setLog(`msg ${i}`);
    }

    state.isLogExpanded = false;
    utils.updateLogDisplay();
    expect(logBox.children.length).toBe(4);

    state.isLogExpanded = true;
    utils.updateLogDisplay();
    expect(logBox.children.length).toBe(10);
  });
});

