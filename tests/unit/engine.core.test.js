import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../scripts/dom.js', () => ({
  els: {
    video: { readyState: 4 },
    overlay: {
      width: 320,
      height: 240,
      getContext: vi.fn(),
      style: { transition: '', opacity: '' },
      offsetHeight: 20
    },
    copyMakeupBtn: { disabled: true }
  },
  clearOverlay: vi.fn(),
  DETECTOR_OPTIONS: { detector: 'opts' }
}));

vi.mock('../../scripts/utils.js', () => ({
  distance: vi.fn(() => 0.12),
  avgPoint: vi.fn(() => ({ x: 10, y: 20 })),
  drawClosedPath: vi.fn(),
  drawOpenPath: vi.fn(),
  roundRect: vi.fn(),
  setLog: vi.fn()
}));

vi.mock('../../scripts/camera.js', () => ({
  resizeCanvas: vi.fn()
}));

vi.mock('../../scripts/db.js', () => ({
  persistDb: vi.fn(),
  renderDbStats: vi.fn()
}));

import { state } from '../../scripts/state.js';
import { els, clearOverlay } from '../../scripts/dom.js';
import { distance, setLog, drawClosedPath, drawOpenPath, roundRect } from '../../scripts/utils.js';
import { resizeCanvas } from '../../scripts/camera.js';
import { persistDb, renderDbStats } from '../../scripts/db.js';
import { view as overlayView } from '../../scripts/bbox-overlay.js';
import {
  detectFaceInCam,
  compositeAndDetect,
  runEffectPass,
  drawGhostyleOverlay,
  drawDetectionScaffold,
  drawResult,
  evaluateMatch,
  saveFace,
  triggerOverlayFadeout
} from '../../scripts/engine.js';

function createCtx() {
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
    strokeRect: vi.fn(),
    measureText: vi.fn(() => ({ width: 24 })),
    fillText: vi.fn(),
    arc: vi.fn(),
    setLineDash: vi.fn(),
    drawImage: vi.fn(),
    arcTo: vi.fn(),
    lineCap: '',
    lineJoin: '',
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    translate: vi.fn(),
    scale: vi.fn()
  };
}

function makeAgeGenderDescriptorChain(result) {
  return {
    withFaceLandmarks: vi.fn(() => ({
      withAgeAndGender: vi.fn(() => ({
        withFaceDescriptor: vi.fn(async () => result)
      }))
    }))
  };
}

function makeLandmarksDescriptorChain(result) {
  return {
    withFaceLandmarks: vi.fn(() => ({
      withFaceDescriptor: vi.fn(async () => result)
    }))
  };
}

function createLandmarksFixture() {
  return {
    getLeftEye: () => [{ x: 1, y: 1 }],
    getRightEye: () => [{ x: 2, y: 2 }],
    getNose: () => [{ x: 3, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 3 }],
    getJawOutline: () => [{ x: 4, y: 4 }],
    getMouth: () => [{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }]
  };
}

describe('engine core exports', () => {
  let overlayCtx;

  beforeEach(() => {
    vi.clearAllMocks();
    overlayCtx = createCtx();
    els.overlay.getContext.mockReturnValue(overlayCtx);
    distance.mockReturnValue(0.12);

    state.db = { nextId: 0, faces: [] };
    state.MATCH_THRESHOLD = 0.58;
    state.activeEffect = null;
    state.loadedGhostyles = new Map();
    state.lastKnownEffectResult = null;
    state.isSystemBusy = false;
    state.effectInferenceInFlight = false;
    state.gstmxxEvents = new EventTarget();

    overlayView.overlayMode = 'bbox';

    window.gstmxx = {
      computeMatchState: vi.fn(() => 'matched')
    };
    globalThis.Ghostmaxxing = window.gstmxx;

    const TinyFaceDetectorOptions = vi.fn(function TinyFaceDetectorOptions(opts) {
      Object.assign(this, opts);
    });
    globalThis.faceapi = {
      TinyFaceDetectorOptions,
      resizeResults: vi.fn((result) => result),
      detectSingleFace: vi.fn()
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('triggerOverlayFadeout schedules opacity fade and clears previous timeout', () => {
    vi.useFakeTimers();
    try {
      state.overlayFadeTimeout = setTimeout(() => {}, 1000);
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout');

      triggerOverlayFadeout();

      expect(els.overlay.style.transition).toBe('opacity 2s ease-in-out');
      expect(els.overlay.style.opacity).toBe('1');
      expect(clearSpy).toHaveBeenCalled();

      vi.advanceTimersByTime(5000);
      expect(els.overlay.style.opacity).toBe('0');
    } finally {
      vi.useRealTimers();
    }
  });

  it('detectFaceInCam returns null and logs when no face is detected', async () => {
    faceapi.detectSingleFace.mockReturnValue(makeAgeGenderDescriptorChain(null));

    const result = await detectFaceInCam(false);

    expect(clearOverlay).toHaveBeenCalledTimes(1);
    expect(result).toBe(null);
    expect(state.lastKnownEffectResult).toBe(null);
    expect(setLog).toHaveBeenCalledWith('Nessun volto rilevato nella webcam.');
  });

  it('detectFaceInCam returns detection result when available', async () => {
    const detected = { detection: { score: 0.9 }, descriptor: [0.1] };
    faceapi.detectSingleFace.mockReturnValue(makeAgeGenderDescriptorChain(detected));

    const result = await detectFaceInCam(false);

    expect(result).toBe(detected);
    expect(setLog).not.toHaveBeenCalledWith('Nessun volto rilevato nella webcam.');
  });

  it('compositeAndDetect returns weakDetection=true when strict detection fails then weak succeeds', async () => {
    const compositedCtx = createCtx();
    const canvasGetContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(compositedCtx);

    const liveResult = {
      detection: { box: { x: 1, y: 2, width: 3, height: 4 } },
      landmarks: { any: true }
    };
    const obfuscated = { detection: { score: 0.41 }, descriptor: [0.2, 0.3] };

    state.activeEffect = 'graphic-liner';
    const onDraw = vi.fn();
    state.loadedGhostyles.set('graphic-liner', { module: { onDraw } });

    faceapi.detectSingleFace
      .mockReturnValueOnce(makeLandmarksDescriptorChain(null))
      .mockReturnValueOnce(makeLandmarksDescriptorChain(obfuscated));

    const result = await compositeAndDetect(liveResult);

    expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(result.obfuscatedResult).toBe(obfuscated);
    expect(result.weakDetection).toBe(true);
    expect(onDraw).toHaveBeenCalled();
    expect(faceapi.detectSingleFace).toHaveBeenCalledTimes(2);

    canvasGetContextSpy.mockRestore();
  });

  it('runEffectPass early-returns when system is busy', async () => {
    state.isSystemBusy = true;

    await runEffectPass();

    expect(faceapi.detectSingleFace).not.toHaveBeenCalled();
  });

  it('runEffectPass stores latest result and emits detection event when no active effect', async () => {
    const result = { detection: { score: 0.8 }, descriptor: [0.3] };
    faceapi.detectSingleFace.mockResolvedValue(result);

    const onDetection = vi.fn();
    state.gstmxxEvents.addEventListener('detection', onDetection);

    await runEffectPass();

    expect(state.lastKnownEffectResult).toBe(result);
    expect(state.effectInferenceInFlight).toBe(false);
    expect(onDetection).toHaveBeenCalledTimes(1);
    expect(onDetection.mock.calls[0][0].detail.activeEffect).toBe(null);
  });

  it('drawGhostyleOverlay applies active effect draw and updates lastKnownEffectResult', () => {
    const result = {
      detection: { box: { x: 1, y: 2, width: 3, height: 4 } },
      landmarks: { points: [] }
    };
    const styleDraw = vi.fn();
    state.activeEffect = 'soft-contour';
    state.loadedGhostyles.set('soft-contour', { module: { onDraw: styleDraw } });
    faceapi.resizeResults.mockReturnValue(result);

    drawGhostyleOverlay(result, false);

    expect(resizeCanvas).toHaveBeenCalled();
    expect(overlayCtx.clearRect).toHaveBeenCalled();
    expect(styleDraw).toHaveBeenCalledWith(overlayCtx, result.landmarks, result.detection.box);
    expect(state.lastKnownEffectResult).toBe(result);
  });

  it('drawDetectionScaffold draws scaffold primitives and label box', () => {
    const resized = {
      detection: { box: { x: 10, y: 20, width: 50, height: 60 } },
      landmarks: createLandmarksFixture(),
      age: 28,
      gender: 'female'
    };

    drawDetectionScaffold(overlayCtx, resized);

    expect(overlayCtx.strokeRect).toHaveBeenCalledWith(10, 20, 50, 60);
    expect(drawClosedPath).toHaveBeenCalled();
    expect(drawOpenPath).toHaveBeenCalled();
    expect(roundRect).toHaveBeenCalled();
    expect(overlayCtx.fillText).toHaveBeenCalled();
  });

  it('drawResult draws scaffold and stores result', () => {
    const result = {
      detection: { box: { x: 1, y: 2, width: 3, height: 4 } },
      landmarks: createLandmarksFixture()
    };
    faceapi.resizeResults.mockReturnValue(result);

    drawResult(result);

    expect(resizeCanvas).toHaveBeenCalled();
    expect(overlayCtx.clearRect).toHaveBeenCalled();
    expect(state.lastKnownEffectResult).toBe(result);
  });

  it('detectFaceInCam logs and returns null when face-api is unavailable', async () => {
    globalThis.faceapi = null;

    const result = await detectFaceInCam(false);

    expect(result).toBe(null);
    expect(state.lastKnownEffectResult).toBe(null);
    expect(setLog).toHaveBeenCalledWith('[ERROR] face-api modelli non caricati. Riprova tra pochi secondi.');
  });

  it('detectFaceInCam catches detector errors and logs the message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    faceapi.detectSingleFace.mockImplementation(() => { throw new Error('detector boom'); });

    const result = await detectFaceInCam(false);

    expect(result).toBe(null);
    expect(state.lastKnownEffectResult).toBe(null);
    expect(setLog).toHaveBeenCalledWith('[ERRORE face-api] detector boom');
  });

  it('compositeAndDetect returns a strong detection without fallback', async () => {
    const compositedCtx = createCtx();
    const canvasGetContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(compositedCtx);
    const liveResult = {
      detection: { box: { x: 1, y: 2, width: 3, height: 4 } },
      landmarks: createLandmarksFixture()
    };
    const obfuscated = { detection: { score: 0.8 }, descriptor: [0.2, 0.3] };
    faceapi.detectSingleFace.mockReturnValue(makeLandmarksDescriptorChain(obfuscated));

    const result = await compositeAndDetect(liveResult);

    expect(result.obfuscatedResult).toBe(obfuscated);
    expect(result.weakDetection).toBe(false);
    expect(compositedCtx.drawImage).toHaveBeenCalled();

    canvasGetContextSpy.mockRestore();
  });

  it('compositeAndDetect handles active style results without a resized detection box', async () => {
    const compositedCtx = createCtx();
    const canvasGetContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(compositedCtx);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    state.activeEffect = 'soft-contour';
    const onDraw = vi.fn();
    state.loadedGhostyles.set('soft-contour', { module: { onDraw } });
    faceapi.resizeResults.mockReturnValue({ landmarks: createLandmarksFixture() });
    const obfuscated = { detection: { score: 0.8 }, descriptor: [0.2, 0.3] };
    faceapi.detectSingleFace.mockReturnValue(makeLandmarksDescriptorChain(obfuscated));

    const result = await compositeAndDetect({ detection: { box: {} }, landmarks: createLandmarksFixture() });

    expect(result.obfuscatedResult).toBe(obfuscated);
    expect(onDraw).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith('resized.detection non disponibile:', expect.any(Object));

    canvasGetContextSpy.mockRestore();
  });

  it('compositeAndDetect catches detector errors and returns a null obfuscated result', async () => {
    const compositedCtx = createCtx();
    const canvasGetContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(compositedCtx);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    faceapi.detectSingleFace.mockImplementation(() => { throw new Error('composite boom'); });

    const result = await compositeAndDetect({ detection: { box: {} }, landmarks: createLandmarksFixture() });

    expect(result.obfuscatedResult).toBe(null);
    expect(result.weakDetection).toBe(false);
    expect(console.error).toHaveBeenCalledWith('[compositeAndDetect]', expect.any(Error));

    canvasGetContextSpy.mockRestore();
  });

  it('runEffectPass clears active-effect overlay when no face is detected', async () => {
    state.activeEffect = 'graphic-liner';
    faceapi.detectSingleFace.mockReturnValue({ withFaceLandmarks: vi.fn(async () => null) });

    const shouldClear = await runEffectPass();

    expect(shouldClear).toBe(true);
    expect(state.lastKnownEffectResult).toBe(null);
    expect(state.effectInferenceInFlight).toBe(false);
  });

  it('runEffectPass renders active-effect detections', async () => {
    const result = { detection: { box: { x: 1, y: 2, width: 3, height: 4 } }, landmarks: createLandmarksFixture() };
    const onDraw = vi.fn();
    state.activeEffect = 'graphic-liner';
    state.loadedGhostyles.set('graphic-liner', { module: { onDraw } });
    faceapi.detectSingleFace.mockReturnValue({ withFaceLandmarks: vi.fn(async () => result) });
    faceapi.resizeResults.mockReturnValue(result);

    const shouldClear = await runEffectPass();

    expect(shouldClear).toBe(false);
    expect(onDraw).toHaveBeenCalledWith(overlayCtx, result.landmarks, result.detection.box);
    expect(state.lastKnownEffectResult).toBe(result);
  });

  it('runEffectPass catches detector errors and releases the inference lock', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    faceapi.detectSingleFace.mockImplementation(() => { throw new Error('pass boom'); });

    await runEffectPass();

    expect(console.error).toHaveBeenCalledWith(expect.any(Error));
    expect(state.effectInferenceInFlight).toBe(false);
  });

  it('drawGhostyleOverlay returns early when resized detection is missing', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = { landmarks: createLandmarksFixture() };
    faceapi.resizeResults.mockReturnValue({ landmarks: createLandmarksFixture() });

    drawGhostyleOverlay(result, false);

    expect(state.lastKnownEffectResult).toBe(null);
  });

  it('drawDetectionScaffold mirrors labels when state is mirrored', () => {
    state.isMirrored = true;
    const resized = {
      detection: { box: { x: 10, y: 20, width: 50, height: 60 } },
      landmarks: createLandmarksFixture(),
      age: 28,
      gender: 'female'
    };

    drawDetectionScaffold(overlayCtx, resized);

    expect(overlayCtx.translate).toHaveBeenCalled();
    expect(overlayCtx.scale).toHaveBeenCalledWith(-1, 1);
  });

  it('drawResult applies the active effect after drawing the scaffold', () => {
    const result = {
      detection: { box: { x: 1, y: 2, width: 3, height: 4 } },
      landmarks: createLandmarksFixture()
    };
    const styleDraw = vi.fn();
    state.activeEffect = 'stage-mask';
    state.loadedGhostyles.set('stage-mask', { module: { onDraw: styleDraw } });
    faceapi.resizeResults.mockReturnValue(result);

    drawResult(result);

    expect(styleDraw).toHaveBeenCalledWith(overlayCtx, result.landmarks, result.detection.box);
    expect(state.lastKnownEffectResult).toBe(result);
  });

  it('saveFace returns undefined when no face is detected', async () => {
    faceapi.detectSingleFace.mockReturnValue(makeAgeGenderDescriptorChain(null));

    const saved = await saveFace();

    expect(saved).toBeUndefined();
    expect(persistDb).not.toHaveBeenCalled();
  });

  it('evaluateMatch returns eluded when no live archive distance is below threshold', () => {
    const evaluated = evaluateMatch({ liveScore: 0.9, liveMinDist: 0.9, liveMinId: 3 }, null);

    expect(evaluated.detail).toMatchObject({ detectionState: 'eluded', distance: 0.9, matchedId: null, ghostylePresent: false });
  });

  it('evaluateMatch returns unclear when a composited face still matches an archived ID', () => {
    state.db.faces = [{ id: 9, descriptor: [0.1, 0.2] }];
    distance.mockReturnValue(0.12);

    const evaluated = evaluateMatch(
      { liveScore: 0.9, liveMinDist: 0.12, liveMinId: 9 },
      { obfuscatedResult: { detection: { score: 0.75 }, descriptor: [0.3, 0.4] }, weakDetection: false }
    );

    expect(evaluated.detail).toMatchObject({ detectionState: 'unclear', distance: 0.12, matchedId: 9, ghostylePresent: true, obfMinDist: 0.12, obfMinId: 9 });
  });

  it('evaluateMatch returns eluded for weak composited detections above the match threshold', () => {
    state.db.faces = [{ id: 9, descriptor: [0.1, 0.2] }];
    distance.mockReturnValue(0.9);

    const evaluated = evaluateMatch(
      { liveScore: 0.9, liveMinDist: 0.12, liveMinId: 9 },
      { obfuscatedResult: { detection: { score: 0.18 }, descriptor: [0.3, 0.4] }, weakDetection: true }
    );

    expect(evaluated.detail).toMatchObject({ detectionState: 'eluded', distance: 0.9, matchedId: null, ghostylePresent: true });
  });

  it('evaluateMatch returns eluded for clear composited detections above the match threshold', () => {
    state.db.faces = [{ id: 9, descriptor: [0.1, 0.2] }];
    distance.mockReturnValue(0.9);

    const evaluated = evaluateMatch(
      { liveScore: 0.9, liveMinDist: 0.12, liveMinId: 9 },
      { obfuscatedResult: { detection: { score: 0.8 }, descriptor: [0.3, 0.4] }, weakDetection: false }
    );

    expect(evaluated.detail).toMatchObject({ detectionState: 'eluded', distance: 0.9, matchedId: null, ghostylePresent: true });
  });

  it('saveFace adds record, persists DB, logs and returns saved data for the orchestrator', async () => {
    state.db = { nextId: 7, faces: [] };

    const result = {
      age: 29,
      gender: 'female',
      detection: { score: 0.91, box: { x: 11, y: 21, width: 41, height: 51 } },
      landmarks: createLandmarksFixture(),
      descriptor: [0.7, 0.8]
    };
    faceapi.detectSingleFace.mockReturnValue(makeAgeGenderDescriptorChain(result));

    const onMatch = vi.fn();
    state.gstmxxEvents.addEventListener('matchStateChanged', onMatch);

    const saved = await saveFace();

    expect(saved).toEqual({ id: 7, result });
    expect(state.db.nextId).toBe(8);
    expect(state.db.faces).toHaveLength(1);
    expect(state.db.faces[0]).toMatchObject({
      id: 7,
      descriptor: [0.7, 0.8],
      age: 29,
      gender: 'female'
    });
    expect(typeof state.db.faces[0].savedAt).toBe('string');
    expect(persistDb).toHaveBeenCalled();
    expect(renderDbStats).toHaveBeenCalled();
    expect(els.overlay.style.transition).toBe('opacity 2s ease-in-out');
    expect(setLog).toHaveBeenCalledWith(expect.stringContaining('Impronta biometrica salvata con ID 7.'));
    expect(onMatch).not.toHaveBeenCalled();
  });

  it('detectFaceInCam stringifies thrown non-Error values', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    faceapi.detectSingleFace.mockImplementation(() => { throw 'string boom'; });

    const result = await detectFaceInCam(false);

    expect(result).toBe(null);
    expect(setLog).toHaveBeenCalledWith('[ERRORE face-api] string boom');
  });

  it('runEffectPass releases the inference lock when face-api becomes unavailable', async () => {
    globalThis.faceapi = null;

    const result = await runEffectPass();

    expect(result).toBeUndefined();
    expect(state.effectInferenceInFlight).toBe(false);
  });

  it('runEffectPass requests age and gender for detailed 2D overlay mode', async () => {
    overlayView.overlayMode = '2d';
    const result = { detection: { score: 0.7 }, age: 40, gender: 'female' };
    const withAgeAndGender = vi.fn(async () => result);
    const withFaceLandmarks = vi.fn(() => ({ withAgeAndGender }));
    faceapi.detectSingleFace.mockReturnValue({ withFaceLandmarks });

    await runEffectPass();

    expect(withFaceLandmarks).toHaveBeenCalledTimes(1);
    expect(withAgeAndGender).toHaveBeenCalledTimes(1);
    expect(state.lastKnownEffectResult).toBe(result);
  });

  it('evaluateMatch computes null composite metrics when compositing fails', () => {
    const evaluated = evaluateMatch(
      { liveScore: 0.9, liveMinDist: 0.7, liveMinId: 5 },
      { obfuscatedResult: null, weakDetection: true }
    );

    expect(evaluated.detail).toMatchObject({
      detectionState: 'eluded',
      distance: null,
      matchedId: null,
      ghostylePresent: true,
      obfMinDist: null,
      obfMinId: null
    });
  });

  it('evaluateMatch sorts multiple composited distances', () => {
    state.db.faces = [
      { id: 1, descriptor: [1, 1] },
      { id: 2, descriptor: [2, 2] }
    ];
    distance.mockReturnValueOnce(0.5).mockReturnValueOnce(0.3);

    const evaluated = evaluateMatch(
      { liveScore: 0.9, liveMinDist: 0.2, liveMinId: 2 },
      { obfuscatedResult: { detection: { score: 0.7 }, descriptor: [0, 0] }, weakDetection: false }
    );

    expect(evaluated.detail).toMatchObject({ obfMinDist: 0.3, obfMinId: 2 });
  });

  it('evaluateMatch treats composited total detection failure as ghostyle elusion even if live distance matches', () => {
    const evaluated = evaluateMatch(
      { liveScore: 0.9, liveMinDist: 0.12, liveMinId: 4 },
      { obfuscatedResult: null, weakDetection: false }
    );

    expect(evaluated.detail).toMatchObject({
      detectionState: 'eluded',
      distance: null,
      matchedId: null,
      ghostylePresent: true,
      obfMinDist: null,
      obfMinId: null
    });
  });

  it('evaluateMatch treats weak composited detections as ghostyle elusion even if live distance matches', () => {
    const evaluated = evaluateMatch(
      { liveScore: 0.9, liveMinDist: 0.12, liveMinId: 4 },
      { obfuscatedResult: null, weakDetection: true }
    );

    expect(evaluated.detail).toMatchObject({
      detectionState: 'eluded',
      distance: null,
      matchedId: null,
      ghostylePresent: true,
      obfMinDist: null,
      obfMinId: null
    });
  });

});
