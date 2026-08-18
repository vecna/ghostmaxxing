import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import {
  THUMBNAILS_STORAGE_KEY,
  captureThumbnail,
  clearAllThumbnails,
  deleteThumbnail,
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

describe('face-thumbnails', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    window.gstmxx = {
      log: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('captureThumbnail returns a JPEG dataURL with configured output size', async () => {
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,thumb');
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        fillStyle: '',
        fillRect,
        drawImage,
      })),
      toDataURL,
    };

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (String(tagName).toLowerCase() === 'canvas') return fakeCanvas;
      return originalCreateElement(tagName);
    });

    const video = createVideoMock(640, 480);
    const box = { x: 120, y: 80, width: 140, height: 180 };

    const dataUrl = await captureThumbnail(video, box, {
      marginRatio: 0.3,
      outputSize: 160,
      jpegQuality: 0.8,
    });

    expect(dataUrl.startsWith('data:image/jpeg')).toBe(true);
    expect(fakeCanvas.width).toBe(160);
    expect(fakeCanvas.height).toBe(160);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 160, 160);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8);
  });

  it('captureThumbnail shifts edge crop inside frame bounds without out-of-frame sampling', async () => {
    const drawImage = vi.fn();
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage,
      })),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,thumb'),
    };

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (String(tagName).toLowerCase() === 'canvas') return fakeCanvas;
      return originalCreateElement(tagName);
    });

    const video = createVideoMock(320, 240);
    const box = { x: 2, y: 1, width: 140, height: 140 };

    await captureThumbnail(video, box, {
      marginRatio: 0.3,
      outputSize: 160,
      jpegQuality: 0.8,
    });

    const args = drawImage.mock.calls[0];
    const [sourceVideo, sx, sy, sw, sh, dx, dy, dw, dh] = args;

    expect(sourceVideo).toBe(video);
    expect(sx).toBeGreaterThanOrEqual(0);
    expect(sy).toBeGreaterThanOrEqual(0);
    expect(sx + sw).toBeLessThanOrEqual(video.videoWidth);
    expect(sy + sh).toBeLessThanOrEqual(video.videoHeight);
    expect(dx).toBe(0);
    expect(dy).toBe(0);
    expect(dw).toBe(160);
    expect(dh).toBe(160);
  });

  it('saveThumbnail enforces FIFO maxEntries by savedAt and keeps latest entries', () => {
    vi.useFakeTimers();

    localStorage.setItem(THUMBNAILS_STORAGE_KEY, JSON.stringify({ entries: [], maxEntries: 3 }));

    vi.setSystemTime(new Date('2026-06-29T10:00:00.000Z'));
    saveThumbnail(1, 'data:image/jpeg;base64,1');
    vi.setSystemTime(new Date('2026-06-29T10:00:01.000Z'));
    saveThumbnail(2, 'data:image/jpeg;base64,2');
    vi.setSystemTime(new Date('2026-06-29T10:00:02.000Z'));
    saveThumbnail(3, 'data:image/jpeg;base64,3');
    vi.setSystemTime(new Date('2026-06-29T10:00:03.000Z'));
    saveThumbnail(4, 'data:image/jpeg;base64,4');

    const store = loadThumbnailsStore();
    const ids = store.entries.map((entry) => entry.id).sort((a, b) => a - b);

    expect(store.entries).toHaveLength(3);
    expect(ids).toEqual([2, 3, 4]);
  });

  it('saveThumbnail emits a thumbnails log when eviction occurs', () => {
    vi.useFakeTimers();

    localStorage.setItem(THUMBNAILS_STORAGE_KEY, JSON.stringify({ entries: [], maxEntries: 1 }));

    vi.setSystemTime(new Date('2026-06-29T10:00:00.000Z'));
    saveThumbnail(10, 'data:image/jpeg;base64,a');
    vi.setSystemTime(new Date('2026-06-29T10:00:01.000Z'));
    saveThumbnail(11, 'data:image/jpeg;base64,b');

    expect(window.gstmxx.log).toHaveBeenCalledTimes(1);
    expect(window.gstmxx.log.mock.calls[0][1]).toBe('thumbnails');
  });

  it('deleteThumbnail removes only the requested ID', () => {
    localStorage.setItem(
      THUMBNAILS_STORAGE_KEY,
      JSON.stringify({
        entries: [
          { id: 1, dataUrl: 'data:image/jpeg;base64,1', savedAt: '2026-06-29T10:00:00.000Z' },
          { id: 2, dataUrl: 'data:image/jpeg;base64,2', savedAt: '2026-06-29T10:00:01.000Z' },
        ],
        maxEntries: 200,
      })
    );

    deleteThumbnail(1);
    const store = loadThumbnailsStore();

    expect(store.entries).toHaveLength(1);
    expect(store.entries[0].id).toBe(2);
  });

  it('clearAllThumbnails resets the store', () => {
    saveThumbnail(21, 'data:image/jpeg;base64,z');

    clearAllThumbnails();

    const store = loadThumbnailsStore();
    expect(store.entries).toEqual([]);
    expect(store.maxEntries).toBe(200);
  });

  it('loadThumbnailsStore tolerates malformed JSON and returns empty shape', () => {
    localStorage.setItem(THUMBNAILS_STORAGE_KEY, '{bad json');

    expect(loadThumbnailsStore()).toEqual({ entries: [], maxEntries: 200 });
  });

  it('getThumbnail returns null for missing IDs', () => {
    saveThumbnail(40, 'data:image/jpeg;base64,exists');

    expect(getThumbnail(999)).toBeNull();
  });
});
