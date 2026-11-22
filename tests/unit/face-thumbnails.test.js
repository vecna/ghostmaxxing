import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureThumbnail } from '../../lab-js/face-thumbnails.js';

function createVideoMock(width = 640, height = 480) {
  const video = document.createElement('video');
  Object.defineProperty(video, 'videoWidth', { value: width, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: height, configurable: true });
  return video;
}

afterEach(() => vi.restoreAllMocks());

describe('face thumbnails', () => {
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
});
