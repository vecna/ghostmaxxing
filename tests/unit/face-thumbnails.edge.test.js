import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// Kept separate from face-thumbnails.test.js because failure-path assertions need
// the logging module mocked before import; the normal behavior suite uses it real.

vi.mock('../../lab-js/utils.js', () => ({ setLog: vi.fn() }));

import {
  THUMBNAILS_STORAGE_KEY,
  captureThumbnail,
  clearAllThumbnails,
  deleteThumbnail,
  getThumbnail,
  loadThumbnailsStore,
  saveThumbnail,
} from '../../lab-js/face-thumbnails.js';
import { setLog } from '../../lab-js/utils.js';

function createVideoMock(width = 640, height = 480) {
  const video = document.createElement('video');
  Object.defineProperty(video, 'videoWidth', { value: width, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: height, configurable: true });
  return video;
}

function mockCanvasFactory() {
  const drawImage = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage,
    })),
    toDataURL: vi.fn(() => 'data:image/jpeg;base64,edge'),
  };

  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    if (String(tagName).toLowerCase() === 'canvas') return canvas;
    return originalCreateElement(tagName);
  });

  return { canvas, drawImage };
}

describe('face-thumbnails edge cases', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.gstmxx;
  });

  it('normalizes stored IDs, capacity, and drops malformed thumbnail entries', () => {
    localStorage.setItem(
      THUMBNAILS_STORAGE_KEY,
      JSON.stringify({
        maxEntries: 2.8,
        entries: [
          { id: '7', dataUrl: 'data:image/jpeg;base64,7', savedAt: '2026-07-01T10:00:00.000Z' },
          { id: 'bad', dataUrl: 'data:image/jpeg;base64,bad', savedAt: '2026-07-01T10:00:00.000Z' },
          { id: 8, dataUrl: 123, savedAt: '2026-07-01T10:00:00.000Z' },
          { id: 9, dataUrl: 'data:image/jpeg;base64,9' },
        ],
      })
    );

    expect(loadThumbnailsStore()).toEqual({
      maxEntries: 2,
      entries: [
        { id: 7, dataUrl: 'data:image/jpeg;base64,7', savedAt: '2026-07-01T10:00:00.000Z' },
      ],
    });
  });

  it('falls back for malformed stores and invalid store shapes or capacities', () => {
    localStorage.setItem(THUMBNAILS_STORAGE_KEY, '{broken');
    expect(loadThumbnailsStore().entries).toEqual([]);
    localStorage.setItem(THUMBNAILS_STORAGE_KEY, 'null');
    expect(loadThumbnailsStore().entries).toEqual([]);
    localStorage.setItem(THUMBNAILS_STORAGE_KEY, JSON.stringify({ entries: [], maxEntries: 0 }));
    expect(loadThumbnailsStore().maxEntries).toBeGreaterThan(0);
  });

  it('replaces an existing thumbnail for the same numeric id', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T10:00:00.000Z'));
    saveThumbnail('12', 'data:image/jpeg;base64,old');

    vi.setSystemTime(new Date('2026-07-01T10:01:00.000Z'));
    saveThumbnail(12, 'data:image/jpeg;base64,new');

    const store = loadThumbnailsStore();
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0]).toMatchObject({
      id: 12,
      dataUrl: 'data:image/jpeg;base64,new',
      savedAt: '2026-07-01T10:01:00.000Z',
    });

    vi.useRealTimers();
  });

  it('ignores invalid saves without mutating the stored cache', () => {
    saveThumbnail(1, 'data:image/jpeg;base64,kept');

    saveThumbnail('not-a-number', 'data:image/jpeg;base64,bad-id');
    saveThumbnail(2, '');
    saveThumbnail(3, null);

    expect(loadThumbnailsStore().entries).toEqual([
      expect.objectContaining({ id: 1, dataUrl: 'data:image/jpeg;base64,kept' }),
    ]);
    expect(getThumbnail('not-a-number')).toBeNull();
  });

  it('letterboxes tall crops when drawing square thumbnail output', async () => {
    const { drawImage } = mockCanvasFactory();

    await captureThumbnail(createVideoMock(400, 400), { x: 100, y: 40, width: 80, height: 160 }, {
      marginRatio: 0,
      outputSize: 160,
      jpegQuality: 0.7,
    });

    const [, sx, sy, sw, sh, dx, dy, dw, dh] = drawImage.mock.calls[0];
    expect([sx, sy, sw, sh]).toEqual([100, 40, 80, 160]);
    expect(dx).toBe(40);
    expect(dy).toBe(0);
    expect(dw).toBe(80);
    expect(dh).toBe(160);
  });

  it('clamps crops that cross frame edges and crops larger than the frame', async () => {
    const { drawImage } = mockCanvasFactory();
    const video = createVideoMock(100, 80);
    await captureThumbnail(video, { x: -20, y: -10, width: 40, height: 30 }, {
      marginRatio: 0, outputSize: 100,
    });
    expect(drawImage.mock.calls[0].slice(1, 5)).toEqual([0, 0, 40, 30]);

    await captureThumbnail(video, { x: 90, y: 70, width: 40, height: 30 }, {
      marginRatio: 0, outputSize: 100,
    });
    expect(drawImage.mock.calls[1].slice(1, 5)).toEqual([60, 50, 40, 30]);

    await captureThumbnail(video, { x: -5, y: -5, width: 140, height: 110 }, {
      marginRatio: 0, outputSize: 100,
    });
    expect(drawImage.mock.calls[2].slice(1, 5)).toEqual([0, 0, 100, 80]);
  });

  it('uses client dimensions and default crop options when native frame size is absent', async () => {
    const { canvas, drawImage } = mockCanvasFactory();
    const video = createVideoMock(0, 0);
    Object.defineProperty(video, 'clientWidth', { value: 120, configurable: true });
    Object.defineProperty(video, 'clientHeight', { value: 90, configurable: true });
    await captureThumbnail(video, { x: 20, y: 10, width: 30, height: 30 });
    expect(canvas.width).toBeGreaterThan(0);
    expect(drawImage).toHaveBeenCalledOnce();
  });

  it('rejects unavailable videos, invalid boxes, unready frames, and missing contexts', async () => {
    await expect(captureThumbnail(null, { x: 0, y: 0, width: 10, height: 10 })).rejects.toThrow();
    await expect(captureThumbnail(createVideoMock(), null)).rejects.toThrow();
    await expect(captureThumbnail(createVideoMock(0, 0), { x: 0, y: 0, width: 10, height: 10 })).rejects.toThrow();

    const canvas = { width: 0, height: 0, getContext: vi.fn(() => null) };
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (String(tagName).toLowerCase() === 'canvas') return canvas;
      return originalCreateElement(tagName);
    });
    await expect(captureThumbnail(createVideoMock(), { x: 0, y: 0, width: 10, height: 10 })).rejects.toThrow();
    createElement.mockRestore();
  });

  it('evicts the oldest thumbnail and supports optional plugin logging', () => {
    localStorage.setItem(THUMBNAILS_STORAGE_KEY, JSON.stringify({
      maxEntries: 1,
      entries: [{ id: 1, dataUrl: 'old', savedAt: '2020-01-01T00:00:00.000Z' }],
    }));
    const log = vi.fn();
    window.gstmxx = { log };
    saveThumbnail(2, 'new');
    expect(getThumbnail(1)).toBeNull();
    expect(getThumbnail(2)).toBe('new');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Thumbnail evicted for ID 1'), 'thumbnails');

    window.gstmxx = {};
    saveThumbnail(3, 'newer');
    expect(setLog).toHaveBeenCalledWith(expect.stringContaining('Thumbnail evicted for ID 2'), 'thumbnails');
    deleteThumbnail(3);
    expect(getThumbnail(3)).toBeNull();
    deleteThumbnail('invalid');
    expect(getThumbnail('invalid')).toBeNull();
    clearAllThumbnails();
    expect(loadThumbnailsStore().entries).toEqual([]);
  });
});
