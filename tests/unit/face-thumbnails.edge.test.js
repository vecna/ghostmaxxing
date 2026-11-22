import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureThumbnail } from '../../lab-js/face-thumbnails.js';

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

afterEach(() => vi.restoreAllMocks());

describe('face thumbnail edge cases', () => {
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
});
