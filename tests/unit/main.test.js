import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({
  setLog: vi.fn(), updateLogDisplay: vi.fn(),
  loadDb: vi.fn(), loadDb3d: vi.fn(), persistDb: vi.fn(), persistDb3d: vi.fn(), renderDbStats: vi.fn(), clearDb: vi.fn(),
  saveFace: vi.fn(), compositeAndDetect: vi.fn(), loadMobileNet: vi.fn(), saveFace3d: vi.fn(), compositeAndDetect3d: vi.fn(),
  startCamera: vi.fn(), resizeCanvas: vi.fn(), startEffectLoop: vi.fn(), recordOneSecond: vi.fn(),
  loadGhostyle: vi.fn(), reloadPlugins: vi.fn(), initPlugins3dLoader: vi.fn(), getActiveEffect3d: vi.fn(),
  activateEffect3d: vi.fn(), deactivateEffect3d: vi.fn(), toggleEffect3d: vi.fn(), reloadPlugins3d: vi.fn(),
  exportMakeup: vi.fn(), setOverlayMode: vi.fn(), openAnalyzePanel: vi.fn(), captureThumbnail: vi.fn(),
  deleteThumbnail: vi.fn(), getThumbnail: vi.fn(), saveThumbnail: vi.fn(), applyI18n: vi.fn(), initI18n: vi.fn(),
  setupLocaleSelect: vi.fn(),
}));

vi.mock('../../lab-js/utils.js', () => ({
  distance: vi.fn(), avgPoint: vi.fn(), lerp: vi.fn(), scaleFrom: vi.fn(), point: vi.fn(),
  drawClosedPath: vi.fn(), drawOpenPath: vi.fn(), drawLabel: vi.fn(), roundRect: vi.fn(),
  expandEyePolygon: vi.fn(), drawEyeWing: vi.fn(), drawCheekSweep: vi.fn(), drawContourBand: vi.fn(),
  clipLeftHalf: vi.fn(), clipRightHalf: vi.fn(), clipLeftHalfUV: vi.fn(), clipRightHalfUV: vi.fn(),
  setLog: deps.setLog, updateLogDisplay: deps.updateLogDisplay,
}));
vi.mock('../../lab-js/db.js', () => ({
  loadDb: deps.loadDb, loadDb3d: deps.loadDb3d, persistDb: deps.persistDb, persistDb3d: deps.persistDb3d,
  renderDbStats: deps.renderDbStats, clearDb: deps.clearDb,
}));
vi.mock('../../lab-js/engine.js', () => ({ saveFace: deps.saveFace, compositeAndDetect: deps.compositeAndDetect }));
vi.mock('../../lab-js/engine-3d.js', () => ({
  loadMobileNet: deps.loadMobileNet, saveFace3d: deps.saveFace3d, compositeAndDetect3d: deps.compositeAndDetect3d,
}));
vi.mock('../../lab-js/camera.js', () => ({
  startCamera: deps.startCamera, resizeCanvas: deps.resizeCanvas, startEffectLoop: deps.startEffectLoop,
  recordOneSecond: deps.recordOneSecond,
}));
vi.mock('../../lab-js/config.js', () => ({
  MODEL_URLS: { tiny: '/tiny', landmarks: '/landmarks', recognition: '/recognition', ageGender: '/age', expressions: '/expressions' },
  DETECTOR_OPTIONS: { inputSize: 128 },
}));
vi.mock('../../lab-js/ghostyles-manager.js', () => ({ loadGhostyle: deps.loadGhostyle, reloadPlugins: deps.reloadPlugins }));
vi.mock('../../lab-js/plugins3d-loader.js', () => ({
  initPlugins3dLoader: deps.initPlugins3dLoader, getActiveEffect3d: deps.getActiveEffect3d,
  activateEffect3d: deps.activateEffect3d, deactivateEffect3d: deps.deactivateEffect3d,
  toggleEffect3d: deps.toggleEffect3d, reloadPlugins3d: deps.reloadPlugins3d,
}));
vi.mock('../../lab-js/export-makeup.js', () => ({ exportMakeup: deps.exportMakeup }));
vi.mock('../../lab-js/bbox-overlay.js', () => ({
  setOverlayMode: deps.setOverlayMode, OVERLAY_MODE_STORAGE_KEY: 'overlay-mode',
  OVERLAY_MODES: { bbox: 'BBox', mesh: 'Mesh', both: 'Both' },
}));
vi.mock('../../lab-js/analyze-panel.js', () => ({ openAnalyzePanel: deps.openAnalyzePanel }));
vi.mock('../../lab-js/face-thumbnails.js', () => ({
  captureThumbnail: deps.captureThumbnail, deleteThumbnail: deps.deleteThumbnail,
  getThumbnail: deps.getThumbnail, saveThumbnail: deps.saveThumbnail,
}));
vi.mock('../../lab-js/i18n.js', () => ({
  applyI18n: deps.applyI18n, initI18n: deps.initI18n, setupLocaleSelect: deps.setupLocaleSelect,
  t: (key) => key,
}));

import { computeOverall, init, setBusy } from '../../lab-js/main.js';
import { state } from '../../lab-js/state.js';
import { els } from '../../lab-js/dom.js';

async function flushPromises() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

async function click(element) {
  element.click();
  await flushPromises();
}

async function withHostname(hostname, callback) {
  const realWindow = window;
  const proxy = new Proxy(realWindow, {
    get(target, key) {
      if (key === 'location') {
        return new Proxy(target.location, {
          get(location, property) {
            return property === 'hostname' ? hostname : Reflect.get(location, property, location);
          },
        });
      }
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, key, value) {
      return Reflect.set(target, key, value, target);
    },
  });
  vi.stubGlobal('window', proxy);
  try {
    return await callback();
  } finally {
    vi.stubGlobal('window', realWindow);
  }
}

describe('lab main', () => {
  let localeCallback;
  let matchState;

  beforeAll(async () => {
    state.db = { nextId: 1, faces: [] };
    state.db3d = { nextId: 1, faces: [] };
    state.gstmxxEvents = new EventTarget();
    state.loadedGhostyles = new Map();
    deps.loadDb.mockReturnValue(state.db);
    deps.loadDb3d.mockReturnValue(state.db3d);
    deps.loadMobileNet.mockResolvedValue();
    deps.startCamera.mockResolvedValue();
    deps.reloadPlugins.mockImplementation(async ({ onFaceapiToggle }) => { onFaceapiToggle(); return 2; });
    deps.loadGhostyle.mockImplementation(async (_url, _id, options) => options.onFaceapiToggle());
    deps.initPlugins3dLoader.mockImplementation(({ getFaceLandmarker }) => {
      expect(getFaceLandmarker()).toBeNull();
      window.gstmxx.FaceLandmarker = function FaceLandmarker() {};
      expect(getFaceLandmarker()).toBe(window.gstmxx.FaceLandmarker);
      delete window.gstmxx.FaceLandmarker;
    });
    deps.openAnalyzePanel.mockResolvedValue();
    deps.setOverlayMode.mockImplementation(mode => mode);
    deps.setupLocaleSelect.mockImplementation((select, callback) => { localeCallback = callback; });
    window.localStorage.setItem('overlay-mode', 'mesh');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => [{ url: 'one.js', id: 'one' }, { url: 'two.js', name: 'Two' }],
    })));
    state.gstmxxEvents.addEventListener('matchStateChanged', event => { matchState = event.detail; });
    await init();
  });

  afterAll(() => vi.unstubAllGlobals());

  it('initializes services and exercises the exposed API', async () => {
    expect(deps.initI18n).toHaveBeenCalledOnce();
    expect(deps.loadGhostyle).toHaveBeenCalledTimes(2);
    expect(deps.loadGhostyle).toHaveBeenLastCalledWith('/two.js', 'Two', expect.any(Object));
    expect(deps.startCamera).toHaveBeenCalledOnce();
    expect(state.isSystemBusy).toBe(false);

    const ready = vi.fn();
    window.addEventListener('gstmxxReady', ready, { once: true });
    window.dispatchEvent(new CustomEvent('gstmxxReady'));
    expect(ready).toHaveBeenCalledOnce();

    const api = window.gstmxx;
    api.log('hello', 'test');
    api.clearVisibleLogs();
    expect(deps.setLog).toHaveBeenCalledWith('hello', 'test');
    expect(deps.updateLogDisplay).toHaveBeenCalled();
    expect(api.getDb()).toEqual(state.db);
    expect(api.getDb3d()).toEqual(state.db3d);
    api.getActiveEffect(); api.getLastResult(); api.getMatchThreshold(); api.getMatchThreshold3d();
    api.getActiveEffect3d(); api.activateEffect3d('x'); api.deactivateEffect3d(); api.toggleEffect3d('x');
    api.reloadPlugins3d();
    await api.reloadPlugins();
    api.lastLandmarks3d = ['landmark'];
    expect(api.lastLandmarks3d).toEqual(['landmark']);
    await api.compositeAndDetect({});
    await api.compositeAndDetect3d();
    expect(deps.startEffectLoop).toHaveBeenCalled();

    expect(computeOverall(null, null)).toBe('unknown');
    expect(computeOverall({ detectionState: 'matched' }, null)).toBe('unknown');
    expect(computeOverall({ detectionState: 'eluded' }, { detectionState: 'eluded' })).toBe('eluded');
    expect(computeOverall({ detectionState: 'matched' }, { detectionState: 'eluded' })).toBe('partial-elusion');

    const preview = document.createElement('button');
    preview.className = 'preview-btn';
    els.ghostylesContainer.appendChild(preview);
    state.lastCompositedCanvas = null;
    setBusy(true);
    expect(els.saveBtn.disabled).toBe(true);
    expect(els.analyzeBtn.disabled).toBe(true);
    expect(els.overlayModeBtn.disabled).toBe(true);
    expect(els.clearDbBtn.disabled).toBe(true);
    expect(els.copyMakeupBtn.disabled).toBe(true);
    expect(preview.disabled).toBe(true);

    state.isRecording = true;
    setBusy(false);
    expect(els.recordBtn.disabled).toBe(true);
    expect(preview.disabled).toBe(false);
    expect(els.copyMakeupBtn.disabled).toBe(true);
    state.lastCompositedCanvas = document.createElement('canvas');
    setBusy(false);
    expect(els.copyMakeupBtn.disabled).toBe(false);
    state.isRecording = false;
    state.lastCompositedCanvas = null;
    preview.remove();
  });

  it('handles mirror, camera, overlay, log, recording, and plugin controls', async () => {
    await click(els.mirrorToggle);
    expect(state.isMirrored).toBe(true);
    expect(els.video.style.transform).toBe('scaleX(-1)');
    await click(els.mirrorToggle);
    expect(state.isMirrored).toBe(false);

    const stop = vi.fn();
    els.video.srcObject = { getTracks: () => [{ stop }] };
    await click(els.switchCameraBtn);
    expect(state.currentFacingMode).toBe('environment');
    expect(stop).toHaveBeenCalledOnce();
    els.video.srcObject = null;
    deps.startCamera.mockRejectedValueOnce(new Error('camera failed'));
    await click(els.switchCameraBtn);
    expect(state.currentFacingMode).toBe('user');
    deps.startCamera.mockRejectedValueOnce(null);
    await click(els.switchCameraBtn);

    await click(els.overlayModeBtn);
    delete els.overlayModeBtn.dataset.overlayMode;
    await click(els.overlayModeBtn);
    els.overlayModeBtn.dataset.overlayMode = 'invalid';
    deps.setOverlayMode.mockReturnValueOnce('invalid');
    await click(els.overlayModeBtn);

    await click(els.logBox);
    expect(state.isLogExpanded).toBe(true);
    await click(els.logBox);
    els.copyMakeupBtn.disabled = false;
    await click(els.copyMakeupBtn);
    els.recordBtn.disabled = false;
    await click(els.recordBtn);
    expect(deps.exportMakeup).toHaveBeenCalled();
    expect(deps.recordOneSecond).toHaveBeenCalled();

    await click(els.reloadPluginsBtn);
    deps.reloadPlugins.mockRejectedValueOnce(new Error('reload failed'));
    await click(els.reloadPluginsBtn);
    expect(deps.setLog).toHaveBeenCalledWith('plugin_reload_error_log', 'loader');
    deps.reloadPlugins.mockRejectedValueOnce({});
    await click(els.reloadPluginsBtn);
    window.dispatchEvent(new Event('resize'));
  });

  it('covers save and analyze success and failure paths', async () => {
    state.lastKnownEffectResult = { detection: { box: { x: 1 } } };
    deps.captureThumbnail.mockResolvedValueOnce('data:image/png;base64,one');
    deps.saveFace.mockResolvedValueOnce({ id: 7, result: {} });
    deps.saveFace3d.mockResolvedValueOnce({ liveInfo3d: { liveMaxSim: 0.9 } });
    await click(els.saveBtn);
    expect(deps.saveThumbnail).toHaveBeenCalledWith(7, 'data:image/png;base64,one');
    expect(matchState).toMatchObject({ overall: 'matched', faceapi: { matchedId: 7 }, mediapipe: { liveMaxSim: 0.9 } });

    state.lastKnownEffectResult = null;
    window.faceapi.detectSingleFace = vi.fn().mockResolvedValue({ box: { x: 2 } });
    deps.captureThumbnail.mockRejectedValueOnce(new Error('thumbnail failed'));
    deps.saveFace.mockResolvedValueOnce({ id: 8 });
    deps.saveFace3d.mockResolvedValueOnce(null);
    state.activeEffect = 'style';
    await click(els.saveBtn);
    expect(deps.setLog).toHaveBeenCalledWith('thumbnail_capture_failed_log', 'thumbnails');
    expect(matchState).toMatchObject({ overall: 'unknown', mediapipe: null });
    expect(deps.startEffectLoop).toHaveBeenCalled();

    state.lastKnownEffectResult = null;
    window.faceapi.detectSingleFace = vi.fn().mockResolvedValue({});
    deps.saveFace.mockResolvedValueOnce(null);
    await click(els.saveBtn);

    window.faceapi.detectSingleFace = vi.fn().mockResolvedValue({ box: { x: 3 } });
    deps.captureThumbnail.mockRejectedValueOnce({});
    deps.saveFace.mockResolvedValueOnce({ id: 9 });
    deps.saveFace3d.mockResolvedValueOnce({});
    await click(els.saveBtn);
    expect(matchState.mediapipe.liveMaxSim).toBe(1);

    deps.saveFace.mockRejectedValueOnce(new Error('save failed'));
    await click(els.saveBtn);
    expect(deps.setLog).toHaveBeenCalledWith('save_face_error (save failed)');

    await click(els.analyzeBtn);
    deps.openAnalyzePanel.mockRejectedValueOnce(new Error('analysis failed'));
    await click(els.analyzeBtn);
    expect(deps.setLog).toHaveBeenCalledWith('makeup_analysis_error (analysis failed)');
  });

  it('renders and deletes history, confirms database clearing, and handles locale changes', async () => {
    state.db = { nextId: 5, faces: [
      { id: 5, savedAt: '2026-09-30T12:34:00Z' }, { id: 3, savedAt: 'invalid-date' }, { id: 1 },
    ] };
    state.db3d = { nextId: 5, faces: [{ id: 4, savedAt: 'also-invalid' }, { id: 3 }] };
    deps.getThumbnail.mockImplementation(id => id === 5 ? 'data:image/png;base64,thumb' : null);
    state.gstmxxEvents.dispatchEvent(new CustomEvent('dbChanged'));
    expect(els.historyEntries.querySelectorAll('.history-card')).toHaveLength(4);
    expect(els.historyEntries.querySelector('.history-thumb')).not.toBeNull();

    const deleteButton = els.historyEntries.querySelector('[data-id="5"] .history-delete');
    vi.useFakeTimers();
    await click(deleteButton);
    await vi.advanceTimersByTimeAsync(2000);
    await click(deleteButton);
    await click(deleteButton);
    expect(deps.deleteThumbnail).toHaveBeenCalledWith(5);
    expect(deps.persistDb).toHaveBeenCalled();
    expect(deps.persistDb3d).toHaveBeenCalled();

    state.gstmxxEvents.dispatchEvent(new CustomEvent('dbChanged'));
    const secondDeleteButton = els.historyEntries.querySelector('[data-id="3"] .history-delete');
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockReturnValue(0);
    await click(secondDeleteButton);
    await click(secondDeleteButton);
    setTimeoutSpy.mockRestore();
    vi.useRealTimers();

    await click(els.toggleSettingsBtn);
    els.settingsDrawer.classList.remove('hidden');
    await click(els.toggleSettingsBtn);
    expect(els.settingsDrawer.classList.contains('hidden')).toBe(true);
    els.historyDrawer.classList.remove('hidden');
    await click(els.closeSettingsBtn);
    expect(els.historyDrawer.classList.contains('hidden')).toBe(true);
    const settingsDrawer = els.settingsDrawer;
    els.settingsDrawer = null;
    await click(els.closeSettingsBtn);
    els.settingsDrawer = settingsDrawer;
    const historyDrawer = els.historyDrawer;
    els.historyDrawer = null;
    await click(els.closeSettingsBtn);
    els.historyDrawer = historyDrawer;

    vi.useFakeTimers();
    await click(els.clearDbBtn);
    expect(els.clearDbBtn.textContent).toBe('confirm_question');
    await vi.advanceTimersByTimeAsync(4000);
    expect(deps.applyI18n).toHaveBeenCalledWith(els.clearDbBtn.parentElement);
    await click(els.clearDbBtn);
    await click(els.clearDbBtn);
    expect(deps.clearDb).toHaveBeenCalledWith(state, els);
    els.clearDbBtn.remove();
    await click(els.clearDbBtn);
    await vi.advanceTimersByTimeAsync(4000);
    expect(deps.applyI18n).toHaveBeenCalledWith(document);
    document.body.appendChild(els.clearDbBtn);
    vi.useRealTimers();

    localeCallback();
    expect(deps.applyI18n).toHaveBeenCalled();

    const historyEntries = els.historyEntries;
    els.historyEntries = null;
    state.gstmxxEvents.dispatchEvent(new CustomEvent('dbChanged'));
    els.historyEntries = historyEntries;
    const db = state.db, db3d = state.db3d;
    state.db = null; state.db3d = null;
    state.db3d = { nextId: 6, faces: [{ id: 20 }] };
    state.gstmxxEvents.dispatchEvent(new CustomEvent('dbChanged'));
    state.db = { nextId: 6, faces: [{ id: 21 }] }; state.db3d = null;
    state.gstmxxEvents.dispatchEvent(new CustomEvent('dbChanged'));
    state.db = db; state.db3d = db3d;
  });

  it('handles initialization failures and omitted optional elements', async () => {
    const original = {
      toggleSettingsBtn: els.toggleSettingsBtn, historyDrawer: els.historyDrawer, settingsDrawer: els.settingsDrawer,
      closeSettingsBtn: els.closeSettingsBtn, reloadPluginsBtn: els.reloadPluginsBtn, overlayModeBtn: els.overlayModeBtn,
      logBox: els.logBox, recordBtn: els.recordBtn, historyEntries: els.historyEntries,
    };
    els.toggleSettingsBtn = null; els.historyDrawer = null; els.settingsDrawer = null;
    els.closeSettingsBtn = null; els.reloadPluginsBtn = null; els.overlayModeBtn = null;
    els.logBox = null; els.recordBtn = null;
    window.localStorage.getItem.mockImplementationOnce(() => { throw new Error('storage unavailable'); });
    window.faceapi.nets.tinyFaceDetector.loadFromUri.mockRejectedValueOnce(new Error('models unavailable'));
    await init();
    expect(deps.setLog).toHaveBeenCalledWith('loading_error_log');
    state.gstmxxEvents.dispatchEvent(new CustomEvent('dbChanged'));

    Object.assign(els, original);
    deps.loadMobileNet.mockRejectedValueOnce(new Error('embedder unavailable'));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    await init();
    expect(deps.setLog).toHaveBeenCalledWith('embedder_unavailable_log');
    expect(deps.setLog).toHaveBeenCalledWith('ghostyles_json_error_log');

    deps.startCamera.mockRejectedValueOnce(new Error('permission denied'));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
    await init();
    expect(deps.setLog).toHaveBeenCalledWith('webcam_permission_error (permission denied)');

    window.localStorage.getItem.mockReturnValueOnce('not-a-mode');
    await withHostname('127.0.0.1', init);
    await withHostname('dev.local', init);
    await withHostname('remote.example', init);
    expect(els.reloadPluginsBtn.style.display).toBe('none');

    const vitestEnv = process.env.VITEST;
    const mirrorToggle = els.mirrorToggle, switchCameraBtn = els.switchCameraBtn;
    els.mirrorToggle = null; els.switchCameraBtn = null;
    process.env.VITEST = '';
    const ready = new Promise(resolve => window.addEventListener('gstmxxReady', resolve, { once: true }));
    await import('../../lab-js/main.js?autostart-coverage');
    process.env.VITEST = vitestEnv;
    els.mirrorToggle = mirrorToggle; els.switchCameraBtn = switchCameraBtn;
    await ready;
  });
});
