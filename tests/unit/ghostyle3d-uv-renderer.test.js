import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUvRenderer } from '../../lab-js/ghostyle3d-uv-renderer.js';

function makeCanvasContext() {
  return {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    clip: vi.fn(),
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    getImageData: vi.fn(() => {
      const data = new Uint8ClampedArray(4 * 16);
      for (let i = 3; i < data.length; i += 4) data[i] = 255;
      return { data };
    }),
    createImageData: vi.fn((w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
    putImageData: vi.fn(),
    globalCompositeOperation: 'source-over',
    lineWidth: 0,
    lineCap: '',
    lineJoin: ''
  };
}

function makeCanvas(context = makeCanvasContext()) {
  return {
    width: 0,
    height: 0,
    style: {},
    getContext: vi.fn(() => context),
    __ctx: context
  };
}

describe('ghostyle3d-uv-renderer', () => {
  let originalCreateElement;
  let originalFetch;
  let originalConsoleError;
  let originalConsoleWarn;

  beforeEach(() => {
    vi.clearAllMocks();
    originalCreateElement = document.createElement.bind(document);
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    global.fetch = originalFetch;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  it('throws an error if uvPath is missing', () => {
    expect(() => createUvRenderer()).toThrow('[uv-renderer] uvPath obbligatorio');
    expect(() => createUvRenderer({})).toThrow('[uv-renderer] uvPath obbligatorio');
  });

  it('loads UV data once and logs success, then skips the second request', async () => {
    const renderer = createUvRenderer({
      uvPath: 'data/face_canonical_uv.json',
      log: vi.fn()
    });

    const payload = { uv: [[0, 0], [1, 0], [0, 1]], triangles: [] };
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: vi.fn(() => Promise.resolve(payload))
    }));

    await renderer.ensureLoaded();
    await renderer.ensureLoaded();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveProperty('render');
  });

  it('logs and recovers when UV loading fails', async () => {
    const log = vi.fn();
    const renderer = createUvRenderer({ uvPath: 'data/face_canonical_uv.json', log });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    global.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      status: 500,
      json: vi.fn()
    }));

    await renderer.ensureLoaded();
    await renderer.ensureLoaded();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('Errore caricamento UV map: HTTP 500');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('builds labels, applies a declarative mask, warns on undeclared params, and renders triangles', async () => {
    const uvCanvas = makeCanvas(makeCanvasContext());
    const paintCtx = makeCanvasContext();
    const screenCtx = {
      canvas: { width: 200, height: 100 },
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn()
    };

    document.createElement = vi.fn((tag) => {
      if (tag === 'canvas') return uvCanvas;
      return originalCreateElement(tag);
    });

    const log = vi.fn();
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const renderer = createUvRenderer({ uvPath: 'data/face_canonical_uv.json', log });
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: vi.fn(() => Promise.resolve({
        numLandmarks: 3,
        numTriangles: 1,
        uv: [
          [0.1, 0.1],
          [0.8, 0.1],
          [0.1, 0.8]
        ],
        triangles: [[0, 1, 2]]
      }))
    }));

    const faceLandmarker = {
      FACE_LANDMARKS_FACE_OVAL: [[0, 1], [1, 2], [2, 0]],
      FACE_LANDMARKS_LEFT_EYEBROW: null,
      FACE_LANDMARKS_RIGHT_EYEBROW: null,
      FACE_LANDMARKS_LEFT_EYE: null,
      FACE_LANDMARKS_RIGHT_EYE: null,
      FACE_LANDMARKS_LIPS: null,
      FACE_LANDMARKS_LEFT_IRIS: null,
      FACE_LANDMARKS_RIGHT_IRIS: null
    };

    const module = {
      textureSize: 8,
      region: { include: 'skin' },
      params: [{ name: 'known' }],
      paintUV: vi.fn((ctx, params, helpers) => {
        expect(params.known).toBe(123);
        expect(params.unknown).toBe(456);
        expect(helpers.regionAt(0.2, 0.2)).toBe('skin');
        expect(helpers.regions.skin).toBe(1);
        expect(helpers.regionsList).toContain('skin');
        ctx.fillRect(0, 0, 1, 1);
      })
    };

    const landmarks = [
      { x: 0.1, y: 0.1 },
      { x: 0.8, y: 0.1 },
      { x: 0.1, y: 0.8 }
    ];

    const rendererWithFace = createUvRenderer({
      uvPath: 'data/face_canonical_uv.json',
      getFaceLandmarker: () => faceLandmarker,
      log
    });

    await rendererWithFace.ensureLoaded();
    rendererWithFace.render(module, screenCtx, landmarks, { known: 123, unknown: 456 });
    rendererWithFace.render(module, screenCtx, landmarks, { known: 123, unknown: 456 });
    rendererWithFace.render(module, screenCtx, null, { known: 123 });
    rendererWithFace.render(null, screenCtx, landmarks, {});

    expect(module.paintUV).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith("[uv-renderer] plugin legge param non dichiarato: 'unknown'");
    expect(screenCtx.save).toHaveBeenCalledTimes(2);
    expect(screenCtx.setTransform).toHaveBeenCalledTimes(2);
    expect(screenCtx.drawImage).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Label map 8×8:'));
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy.mock.calls.length).toBeGreaterThan(0);
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('skips rendering when triangles are degenerate or landmarks are missing', async () => {
    const screenCtx = {
      canvas: { width: 100, height: 50 },
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn()
    };
    const renderer = createUvRenderer({ uvPath: 'data/face_canonical_uv.json' });

    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: vi.fn(() => Promise.resolve({
        uv: [[0, 0], [0, 0], [0, 0]],
        triangles: [[0, 1, 2]]
      }))
    }));

    await renderer.ensureLoaded();
    renderer.render({ paintUV: vi.fn(() => {}) }, screenCtx, [{ x: 0, y: 0 }, null, { x: 1, y: 1 }], {});

    expect(screenCtx.setTransform).not.toHaveBeenCalled();
    expect(screenCtx.drawImage).not.toHaveBeenCalled();
  });

  it('returns early when the module does not provide paintUV or when UV data is not loaded', () => {
    const renderer = createUvRenderer({ uvPath: 'data/face_canonical_uv.json' });
    const ensureLoadedSpy = vi.spyOn(renderer, 'ensureLoaded');
    const ctx = {
      canvas: { width: 100, height: 50 },
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn()
    };

    global.fetch = vi.fn(() => new Promise(() => {}));

    renderer.render({}, ctx, [], {});
    renderer.render({ paintUV: vi.fn() }, null, [], {});

    expect(ensureLoadedSpy).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
