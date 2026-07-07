import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── mocks (declared before any import of the tested module) ─────────────────

vi.mock('../../scripts/dom.js', () => ({
  els: {
    video: { tagName: 'VIDEO' },
    overlay: { width: 640, height: 480 }
  }
}));

vi.mock('../../scripts/db.js', () => ({
  persistDb3d: vi.fn()
}));

vi.mock('../../scripts/utils.js', () => ({
  setLog: vi.fn()
}));

vi.mock('../../scripts/config.js', () => ({
  MEDIAPIPE_IMAGE_EMBEDDER_URL: 'https://cdn.example.com/image_embedder.tflite',
  MEDIAPIPE_TASKS_VISION_URL:   'https://cdn.example.com/vision_tasks.js',
  MEDIAPIPE_WASM_URL:           'https://cdn.example.com/wasm/'
}));

// ─── imports after mocks ──────────────────────────────────────────────────────

import { state }                                               from '../../scripts/state.js';
import { setLog }                                             from '../../scripts/utils.js';
import { persistDb3d }                                        from '../../scripts/db.js';
import { els }                                                from '../../scripts/dom.js';
import { loadMobileNet, getFaceEmbedding, saveFace3d, compositeAndDetect3d, findFace3d } from '../../scripts/engine-3d.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal stub embedder that returns a fixed float embedding. */
function makeEmbedderStub(floatEmbedding = [0.1, 0.2, 0.3]) {
  return {
    embedForVideo: vi.fn(() => ({
      embeddings: [{ floatEmbedding }]
    }))
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// loadMobileNet  (lines 49–63)
// ─────────────────────────────────────────────────────────────────────────────

describe('loadMobileNet (lines 49–63)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.imageEmbedder = null;
  });

  afterEach(() => {
    state.imageEmbedder = null;
  });

  it('returns immediately without doing anything if imageEmbedder is already set (line 49)', async () => {
    const stub = makeEmbedderStub();
    state.imageEmbedder = stub;            // pre-set

    await loadMobileNet();

    // state unchanged, setLog not called for init
    expect(state.imageEmbedder).toBe(stub);
    expect(setLog).not.toHaveBeenCalled();
  });

  it('injects a provided embedder instance and skips MediaPipe bootstrap (lines 50–52)', async () => {
    const injected = makeEmbedderStub();

    await loadMobileNet(injected);

    expect(state.imageEmbedder).toBe(injected);
    // setLog('[3D] ImageEmbedder pronto.') is only called from the real bootstrap path
    expect(setLog).not.toHaveBeenCalled();
  });

  it('does NOT overwrite an existing embedder when a new instance is injected', async () => {
    const first  = makeEmbedderStub([1, 0]);
    const second = makeEmbedderStub([0, 1]);

    state.imageEmbedder = first;

    // Should bail immediately because state.imageEmbedder is already set
    await loadMobileNet(second);

    expect(state.imageEmbedder).toBe(first);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getFaceEmbedding  (lines 105–115)
// ─────────────────────────────────────────────────────────────────────────────

describe('getFaceEmbedding (lines 105–115)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.imageEmbedder = null;
  });

  afterEach(() => {
    state.imageEmbedder = null;
  });

  it('throws if imageEmbedder is not loaded (line 105)', async () => {
    state.imageEmbedder = null;
    await expect(getFaceEmbedding(els.video))
      .rejects.toThrow('[engine-3d] ImageEmbedder non caricato.');
  });

  it('returns a plain JS array from the model float embedding (line 112)', async () => {
    state.imageEmbedder = makeEmbedderStub([0.5, 0.25, 0.75]);

    const result = await getFaceEmbedding(els.video);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([0.5, 0.25, 0.75]);
  });

  it('throws a wrapped error when the model returns no embedding (lines 109–111)', async () => {
    state.imageEmbedder = {
      embedForVideo: vi.fn(() => ({ embeddings: [] }))   // empty embeddings
    };

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(getFaceEmbedding(els.video))
      .rejects.toThrow('Errore estrazione embedding:');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[getFaceEmbedding]', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('wraps errors thrown by embedForVideo (lines 113–115)', async () => {
    state.imageEmbedder = {
      embedForVideo: vi.fn(() => { throw new Error('GPU crash'); })
    };

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(getFaceEmbedding(els.video))
      .rejects.toThrow('Errore estrazione embedding: GPU crash');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('throws a wrapped error when embedForVideo returns null (line 109)', async () => {
    state.imageEmbedder = {
      embedForVideo: vi.fn(() => null)
    };

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(getFaceEmbedding(els.video))
      .rejects.toThrow('Errore estrazione embedding:');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[getFaceEmbedding]', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// saveFace3d  (lines 151–176)
// ─────────────────────────────────────────────────────────────────────────────

describe('saveFace3d (lines 151–176)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.imageEmbedder = null;
    state.db3d = { faces: [] };
  });

  afterEach(() => {
    state.imageEmbedder = null;
    state.db3d = null;
  });

  it('returns null and logs when imageEmbedder is not ready (lines 151–153)', async () => {
    state.imageEmbedder = null;

    const result = await saveFace3d(42);

    expect(result).toBeNull();
    expect(setLog).toHaveBeenCalledWith(
      '[3D] ImageEmbedder non pronto — embedding 3D non salvato.',
      'engine-3d'
    );
  });

  it('returns null and logs when db3d is not initialised (lines 155–157)', async () => {
    state.imageEmbedder = makeEmbedderStub();
    state.db3d = null;

    const result = await saveFace3d(42);

    expect(result).toBeNull();
    expect(setLog).toHaveBeenCalledWith('[3D] DB 3D non inizializzato.', 'engine-3d');
  });

  it('persists the embedding and returns { id, liveInfo3d } on success (lines 166–175)', async () => {
    const embedding = [0.9, 0.1, 0.0];
    state.imageEmbedder = makeEmbedderStub(embedding);
    state.db3d = { faces: [] };

    const result = await saveFace3d(7);

    expect(persistDb3d).toHaveBeenCalledTimes(1);
    expect(state.db3d.faces).toHaveLength(1);
    expect(state.db3d.faces[0]).toMatchObject({ id: 7, descriptor3d: embedding });
    expect(result).toMatchObject({ id: 7 });
    expect(result.liveInfo3d).toBeDefined();
    expect(result.liveInfo3d.liveMaxId).toBe(7);
  });

  it('logs and returns null when getFaceEmbedding throws (lines 162–164)', async () => {
    state.imageEmbedder = {
      embedForVideo: vi.fn(() => { throw new Error('encoder gone'); })
    };
    state.db3d = { faces: [] };

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await saveFace3d(99);

    expect(result).toBeNull();
    expect(setLog).toHaveBeenCalledWith(
      expect.stringContaining('[3D] Errore estrazione embedding:'),
      'engine-3d'
    );
    consoleErrorSpy.mockRestore();
  });

  it('stores a savedAt ISO timestamp alongside the embedding', async () => {
    const embedding = [1, 0];
    state.imageEmbedder = makeEmbedderStub(embedding);
    state.db3d = { faces: [] };

    await saveFace3d(3);

    const record = state.db3d.faces[0];
    expect(record.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// compositeAndDetect3d  (lines 205–221)
// ─────────────────────────────────────────────────────────────────────────────

describe('compositeAndDetect3d (lines 205–221)', () => {
  let originalDocument;

  beforeEach(() => {
    vi.clearAllMocks();
    state.imageEmbedder = null;
    state.gstmxxEvents  = new EventTarget();
    state.lastLandmarks3d = null;
  });

  afterEach(() => {
    state.imageEmbedder = null;
  });

  it('returns null immediately when imageEmbedder is not ready (line 206)', async () => {
    state.imageEmbedder = null;
    const result = await compositeAndDetect3d();
    expect(result).toBeNull();
  });

  it('returns { canvas, embedding } after drawing and extracting (lines 208–221)', async () => {
    const embedding = [0.7, 0.3];
    state.imageEmbedder = makeEmbedderStub(embedding);

    const result = await compositeAndDetect3d();

    expect(result).not.toBeNull();
    expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(result.embedding).toEqual(embedding);
  });

  it('dispatches beforeEfficacyComposite3d with canvas, ctx and landmarks3d (lines 215–217)', async () => {
    state.imageEmbedder  = makeEmbedderStub([0.5, 0.5]);
    state.lastLandmarks3d = [{ x: 0.5, y: 0.5, z: 0 }];

    let capturedDetail = null;
    state.gstmxxEvents.addEventListener('beforeEfficacyComposite3d', (e) => {
      capturedDetail = e.detail;
    });

    await compositeAndDetect3d();

    expect(capturedDetail).not.toBeNull();
    expect(capturedDetail.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(capturedDetail.ctx).toBeDefined();
    expect(capturedDetail.landmarks3d).toBe(state.lastLandmarks3d);
  });

  it('canvas is sized from els.overlay dimensions (lines 209–210)', async () => {
    state.imageEmbedder = makeEmbedderStub([1]);
    // els.overlay is mocked: width=640, height=480
    const result = await compositeAndDetect3d();
    expect(result.canvas.width).toBe(640);
    expect(result.canvas.height).toBe(480);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findFace3d  (lines 244–265)
// ─────────────────────────────────────────────────────────────────────────────

describe('findFace3d (lines 244–265)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.imageEmbedder = null;
    state.db3d = { faces: [] };
    state.gstmxxEvents = new EventTarget();
    // Ensure no active plugin by default (window.gstmxx absent)
    if (typeof window !== 'undefined') delete window.gstmxx;
  });

  afterEach(() => {
    state.imageEmbedder = null;
    state.db3d = null;
  });

  it('logs and returns null when imageEmbedder is not ready (lines 245–247)', async () => {
    state.imageEmbedder = null;

    const result = await findFace3d();

    expect(result).toBeNull();
    expect(setLog).toHaveBeenCalledWith(
      '[3D] ImageEmbedder non pronto — confronto 3D saltato.',
      'engine-3d'
    );
  });

  it('returns empty liveInfo3d and null composite3d when db3d is empty (lines 249–251)', async () => {
    state.imageEmbedder = makeEmbedderStub();
    state.db3d = { faces: [] };

    const result = await findFace3d();

    expect(result).toEqual({
      liveInfo3d: { liveMaxSim: null, liveMaxId: null },
      composite3d: null
    });
  });

  it('returns liveInfo3d with best match when db has faces and no plugin is active (lines 253–264)', async () => {
    const embedding = [1, 0, 0];
    state.imageEmbedder = makeEmbedderStub(embedding);
    state.db3d = {
      faces: [
        { id: 5, descriptor3d: [1, 0, 0] },  // perfect match
        { id: 6, descriptor3d: [0, 1, 0] }   // orthogonal
      ]
    };

    const result = await findFace3d();

    expect(result).not.toBeNull();
    expect(result.liveInfo3d.liveMaxId).toBe(5);
    expect(result.liveInfo3d.liveMaxSim).toBeCloseTo(1, 5);
    expect(result.composite3d).toBeNull(); // no active plugin
  });

  it('returns null and logs when getFaceEmbedding throws during live extraction (lines 254–259)', async () => {
    state.imageEmbedder = {
      embedForVideo: vi.fn(() => { throw new Error('no frame'); })
    };
    state.db3d = {
      faces: [{ id: 1, descriptor3d: [1, 0] }]
    };

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await findFace3d();

    expect(result).toBeNull();
    expect(setLog).toHaveBeenCalledWith(
      expect.stringContaining('[3D] Errore estrazione embedding live:'),
      'engine-3d'
    );
    consoleErrorSpy.mockRestore();
  });

  it('includes composite3d when a 2D ghostyle is active (line 262)', async () => {
    const embedding = [1, 0];
    state.imageEmbedder = makeEmbedderStub(embedding);
    state.db3d = { faces: [{ id: 1, descriptor3d: [1, 0] }] };

    // Simulate an active 2D ghostyle via window.gstmxx
    window.gstmxx = {
      getActiveEffect:   () => 'graphic-liner',
      getActiveEffect3d: () => null
    };

    const result = await findFace3d();

    expect(result).not.toBeNull();
    expect(result.composite3d).not.toBeNull();
    expect(result.composite3d.embedding).toEqual(embedding);

    delete window.gstmxx;
  });
});
