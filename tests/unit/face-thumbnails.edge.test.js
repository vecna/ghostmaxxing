import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import {
  THUMBNAILS_STORAGE_KEY,
  captureThumbnail,
  getThumbnail,
  loadThumbnailsStore,
  saveThumbnail,
} from '../../lab-js/face-thumbnails.js';

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
});
