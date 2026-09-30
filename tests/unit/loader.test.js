import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({
  loadDb: vi.fn(), loadDb3d: vi.fn(), renderDbStats: vi.fn(),
  detectFaceInCam: vi.fn(), saveFace: vi.fn(), seekFaceInDb: vi.fn(),
  cosineSimilarity: vi.fn(), getFaceEmbedding: vi.fn(), loadMobileNet: vi.fn(), saveFace3d: vi.fn(),
  resizeCanvas: vi.fn(), distance: vi.fn(), setLog: vi.fn(), captureThumbnail: vi.fn(), saveThumbnail: vi.fn(),
  initI18n: vi.fn(), setupLocaleSelect: vi.fn(), applyI18n: vi.fn(), setStatus: vi.fn(),
}));

vi.mock('../../lab-js/db.js', () => ({ loadDb: deps.loadDb, loadDb3d: deps.loadDb3d, renderDbStats: deps.renderDbStats }));
vi.mock('../../lab-js/engine.js', () => ({
  detectFaceInCam: deps.detectFaceInCam, saveFace: deps.saveFace, seekFaceInDb: deps.seekFaceInDb,
}));
vi.mock('../../lab-js/engine-3d.js', () => ({
  cosineSimilarity: deps.cosineSimilarity, getFaceEmbedding: deps.getFaceEmbedding,
  loadMobileNet: deps.loadMobileNet, saveFace3d: deps.saveFace3d,
}));
vi.mock('../../lab-js/camera.js', () => ({ resizeCanvas: deps.resizeCanvas }));
vi.mock('../../lab-js/utils.js', () => ({ distance: deps.distance, setLog: deps.setLog }));
vi.mock('../../lab-js/face-thumbnails.js', () => ({ captureThumbnail: deps.captureThumbnail, saveThumbnail: deps.saveThumbnail }));
vi.mock('../../lab-js/config.js', () => ({
  MODEL_URLS: { tiny: '/tiny', landmarks: '/landmarks', recognition: '/recognition', ageGender: '/age' },
  DETECTOR_OPTIONS: { inputSize: 128 },
}));
vi.mock('../../lab-js/i18n.js', () => ({
  initI18n: deps.initI18n, setupLocaleSelect: deps.setupLocaleSelect, applyI18n: deps.applyI18n, t: key => key,
}));
vi.mock('../../lab-js/dom.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, setStatus: deps.setStatus };
});

import { state } from '../../lab-js/state.js';

async function flushPromises() {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}

function loaderMarkup() {
  const source = readFileSync(`${process.cwd()}/loader.html`, 'utf8');
  return new DOMParser().parseFromString(source, 'text/html').body.innerHTML;
}

describe('loader', () => {
  it('loads a video, records and seeks faces, and captures success/error details', async () => {
    document.body.innerHTML = loaderMarkup();
    const video = document.getElementById('video');
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 0 },
      currentTime: { configurable: true, writable: true, value: 0 },
      duration: { configurable: true, writable: true, value: 0 },
      videoWidth: { configurable: true, value: 640 },
      videoHeight: { configurable: true, value: 360 },
    });
    video.load = vi.fn();
    state.db = { nextId: 1, faces: [] };
    state.db3d = { faces: [] };
    state.gstmxxEvents = new EventTarget();
    deps.loadDb.mockReturnValue(state.db);
    deps.loadDb3d.mockReturnValue(state.db3d);
    deps.loadMobileNet.mockResolvedValue();
    deps.detectFaceInCam.mockResolvedValue(null);
    deps.saveFace.mockResolvedValue(null);
    deps.saveFace3d.mockResolvedValue(null);
    deps.seekFaceInDb.mockReturnValue({ liveMinDist: null, liveMinId: null });
    deps.getFaceEmbedding.mockResolvedValue(null);
    deps.cosineSimilarity.mockImplementation((_, saved) => saved[0]);
    deps.distance.mockImplementation((live, saved) => Math.abs(live[0] - saved[0]));
    deps.captureThumbnail.mockResolvedValue(null);
    let localeCallback;
    deps.setupLocaleSelect.mockImplementation((select, callback) => { localeCallback = callback; });
    const events = [];
    state.gstmxxEvents.addEventListener('matchStateChanged', event => events.push(event.detail));
    const createObjectURL = vi.fn(() => 'blob:fixture');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    await import('../../lab-js/loader.js?loader-success');
    await flushPromises();
    expect(deps.setStatus).toHaveBeenCalledWith('live', 'loader_status_ready');
    expect(document.getElementById('recordFaceBtn').disabled).toBe(true);
    const api = window.gstmxx;
    expect(api.getDb()).toEqual(state.db);
    expect(api.getDb3d()).toEqual(state.db3d);
    expect(api.getActiveEffect3d()).toBeNull();
    api.log('loader log', 'test');
    state.activeEffect = 'style';
    state.lastKnownEffectResult = { detection: { score: 1 } };
    state.MATCH_THRESHOLD = 0.51;
    state.MATCH_THRESHOLD_3D = 0.77;
    expect(api.getActiveEffect()).toBe('style');
    expect(api.getLastResult()).toBe(state.lastKnownEffectResult);
    expect(api.getMatchThreshold()).toBe(0.51);
    expect(api.getMatchThreshold3d()).toBe(0.77);
    api.lastLandmarks3d = [{ x: 0.5 }];
    expect(api.lastLandmarks3d).toHaveLength(1);
    expect(deps.setLog).toHaveBeenCalledWith('loader log', 'test');

    const fileInput = document.getElementById('videoFile');
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [] });
    fileInput.dispatchEvent(new Event('change'));
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [new File(['video'], 'one.mp4')] });
    video.srcObject = { stream: true };
    fileInput.dispatchEvent(new Event('change'));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(video.load).toHaveBeenCalledOnce();
    fileInput.dispatchEvent(new Event('change'));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fixture');

    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 0 });
    Object.defineProperty(video, 'duration', { configurable: true, writable: true, value: Infinity });
    video.dispatchEvent(new Event('timeupdate'));
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(document.getElementById('videoSeek').max).toBe('0');
    document.getElementById('mesh3dOverlay').remove();

    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 12.25 });
    Object.defineProperty(video, 'duration', { configurable: true, writable: true, value: 90 });
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(document.getElementById('videoSeek').max).toBe('90');
    expect(document.getElementById('currentTimeLabel').textContent).toBe('00:12.250');
    video.dispatchEvent(new Event('loadeddata'));
    video.dispatchEvent(new Event('timeupdate'));
    video.dispatchEvent(new Event('seeked'));
    video.dispatchEvent(new Event('play'));
    video.dispatchEvent(new Event('pause'));
    window.dispatchEvent(new Event('resize'));
    const seek = document.getElementById('videoSeek');
    seek.value = '25.5';
    seek.dispatchEvent(new Event('input'));
    expect(video.currentTime).toBe(25.5);
    seek.matches = () => true;
    seek.dispatchEvent(new Event('input'));
    seek.matches = () => false;
    seek.value = '0';
    seek.dispatchEvent(new Event('input'));
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: Infinity });
    video.dispatchEvent(new Event('timeupdate'));
    expect(document.getElementById('currentTimeLabel').textContent).toBe('00:00.000');

    const record = document.getElementById('recordFaceBtn');
    const seekFace = document.getElementById('seekFaceBtn');
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 0 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 0 });
    document.getElementById('overlay').width = 0;
    document.getElementById('overlay').height = 0;
    document.getElementById('bboxOverlay').width = 0;
    document.getElementById('bboxOverlay').height = 0;
    record.click();
    await flushPromises();
    expect(document.querySelector('.loader-entry__metrics').textContent).toContain('loader_no_face_result');

    const savedResult = {
      detection: { score: 0.94, box: { x: 12.4, y: 20.2, width: 90.1, height: 110.8 } },
      descriptor: [0.2, 0.4], landmarks: { positions: [{ x: 1 }, { x: 2 }] },
      age: 31.6, gender: 'female', genderProbability: 0.8,
    };
    document.getElementById('overlay').width = 200;
    document.getElementById('overlay').height = 100;
    state.lastLandmarks3d = null;
    deps.saveFace.mockResolvedValueOnce({ id: 2, result: savedResult });
    deps.captureThumbnail.mockResolvedValueOnce(null);
    record.click();
    await flushPromises();
    expect(events.at(-1)).toMatchObject({ source: 'save', overall: 'unknown', faceapi: { matchedId: 2 }, mediapipe: null });

    state.db3d.faces = [{ id: 3, descriptor3d: [0.93, 0.1] }];
    deps.saveFace.mockResolvedValueOnce({ id: 3, result: savedResult });
    deps.captureThumbnail.mockResolvedValueOnce('data:image/png;base64,preview');
    deps.saveFace3d.mockResolvedValueOnce({ liveInfo3d: { liveMaxSim: 0.91 } });
    record.click();
    await flushPromises();
    expect(deps.saveThumbnail).toHaveBeenCalledWith(3, 'data:image/png;base64,preview');
    expect(events.at(-1).overall).toBe('matched');

    state.lastLandmarks3d = [{ x: 0.5 }];
    deps.saveFace.mockResolvedValueOnce({ id: 5, result: {} });
    deps.saveFace3d.mockResolvedValueOnce(null);
    record.click();
    await flushPromises();
    expect(events.at(-1).faceapi.matchedId).toBe(5);

    deps.saveFace.mockResolvedValueOnce({ id: 6, result: {} });
    deps.saveFace3d.mockResolvedValueOnce(null);
    record.click();
    await flushPromises();
    expect(events.at(-1).faceapi.matchedId).toBe(6);

    deps.captureThumbnail.mockRejectedValueOnce({});
    deps.saveFace.mockResolvedValueOnce({ id: 4, result: savedResult });
    deps.saveFace3d.mockResolvedValueOnce({});
    record.click();
    await flushPromises();
    expect(deps.setLog).toHaveBeenCalledWith('thumbnail_capture_failed_log', 'thumbnails');

    deps.saveFace.mockRejectedValueOnce(new Error('record failed'));
    record.click();
    await flushPromises();
    expect(deps.setStatus).toHaveBeenCalledWith('error', 'loader_status_action_failed');

    let resolvePendingSave;
    deps.saveFace.mockReturnValueOnce(new Promise(resolve => { resolvePendingSave = resolve; }));
    const savesBeforeLock = deps.saveFace.mock.calls.length;
    record.click();
    await flushPromises();
    record.dispatchEvent(new Event('click'));
    await flushPromises();
    expect(deps.saveFace).toHaveBeenCalledTimes(savesBeforeLock + 1);
    resolvePendingSave(null);
    await flushPromises();

    deps.saveFace.mockRejectedValueOnce({});
    record.click();
    await flushPromises();

    deps.detectFaceInCam.mockResolvedValueOnce(null);
    seekFace.click();
    await flushPromises();
    expect(document.querySelectorAll('.loader-entry')).not.toHaveLength(0);

    const liveResult = {
      detection: { score: 0.8, box: { x: 1, y: 2, width: 3, height: 4 } },
      descriptor: [0.1], landmarks: { getPositions: () => [{}, {}, {}] },
      age: NaN, gender: '', genderProbability: Infinity,
    };
    state.db.faces = [
      { id: 8, descriptor: [0.8] }, { id: 7, descriptor: [0.2] },
    ];
    state.db3d.faces = [
      { id: 9, descriptor3d: [0.95] }, { id: 10, descriptor3d: [0.72] },
    ];
    deps.detectFaceInCam.mockResolvedValueOnce(liveResult);
    deps.seekFaceInDb.mockReturnValueOnce({ liveMinDist: 0.2, liveMinId: 7 });
    deps.getFaceEmbedding.mockResolvedValueOnce([1]);
    seekFace.click();
    await flushPromises();
    expect(events.at(-1)).toMatchObject({ source: 'find', overall: 'matched' });

    deps.detectFaceInCam.mockResolvedValueOnce(liveResult);
    deps.seekFaceInDb.mockReturnValueOnce({ liveMinDist: 0.9, liveMinId: 8 });
    deps.getFaceEmbedding.mockRejectedValueOnce(new Error('embed unavailable'));
    seekFace.click();
    await flushPromises();
    expect(events.at(-1).mediapipe).toBeNull();
    expect(events.at(-1).faceapi.detectionState).toBe('eluded');

    state.db = null;
    state.db3d = null;
    deps.detectFaceInCam.mockResolvedValueOnce(liveResult);
    deps.seekFaceInDb.mockReturnValueOnce({ liveMinDist: 0.1, liveMinId: 12 });
    deps.getFaceEmbedding.mockResolvedValueOnce([1]);
    seekFace.click();
    await flushPromises();
    expect(events.at(-1).mediapipe).toBeNull();

    state.db = { faces: [{ id: 9, descriptor: [0.1] }] };
    state.db3d = { faces: [{ id: 9, descriptor3d: [0.4] }] };
    deps.detectFaceInCam.mockResolvedValueOnce(liveResult);
    deps.seekFaceInDb.mockReturnValueOnce({ liveMinDist: 0.1, liveMinId: 9 });
    deps.getFaceEmbedding.mockResolvedValueOnce([1]);
    seekFace.click();
    await flushPromises();
    expect(events.at(-1).overall).toBe('partial-elusion');

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      fillRect: vi.fn(), drawImage: vi.fn(() => { throw {}; }),
      fillText: vi.fn(),
    }));
    deps.saveFace.mockResolvedValueOnce(null);
    record.click();
    await flushPromises();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
    HTMLCanvasElement.prototype.getContext = originalGetContext;

    localeCallback();
    expect(deps.applyI18n).toHaveBeenCalled();
  });

  it('reports model initialization failures without enabling actions', async () => {
    vi.resetModules();
    document.body.innerHTML = loaderMarkup();
    const { state: isolatedState } = await import('../../lab-js/state.js');
    isolatedState.db = { nextId: 0, faces: [] };
    isolatedState.db3d = { faces: [] };
    isolatedState.gstmxxEvents = new EventTarget();
    window.faceapi.nets.tinyFaceDetector.loadFromUri.mockRejectedValueOnce({});
    deps.loadDb.mockReturnValue(isolatedState.db);
    deps.loadDb3d.mockReturnValue(isolatedState.db3d);

    await import('../../lab-js/loader.js?loader-failure');
    await flushPromises();
    expect(deps.setStatus).toHaveBeenCalledWith('error', 'loader_status_model_load_failed');
    expect(deps.setLog).toHaveBeenCalledWith('loader_model_error_log', 'loader');
    expect(document.getElementById('recordFaceBtn').disabled).toBe(true);
  });
});