import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mediapipeMocks = vi.hoisted(() => ({
  forVisionTasks: vi.fn(),
  createFromOptions: vi.fn(),
  detectForVideo: vi.fn(),
}));

vi.mock('../../lab-js/vendor/tasks-vision@0.10.35.js', () => ({
  FilesetResolver: {
    forVisionTasks: mediapipeMocks.forVisionTasks,
  },
  FaceLandmarker: {
    FACE_LANDMARKS_TESSELATION: [[0, 1]],
    createFromOptions: mediapipeMocks.createFromOptions,
  },
}), { virtual: true });

vi.mock('../../lab-js/config.js', () => ({
  MEDIAPIPE_WASM_URL: 'https://cdn.example.test/mediapipe/wasm',
  MEDIAPIPE_FACE_LANDMARKER_URL: 'https://cdn.example.test/face_landmarker.task',
}));

vi.mock('../../lab-js/i18n.js', () => ({
  t: vi.fn((key, params) => (params ? `${key}:${JSON.stringify(params)}` : key)),
}));

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setVideoReady(video, readyState = 4, currentTime = 1) {
  Object.defineProperty(video, 'readyState', { value: readyState, configurable: true });
  Object.defineProperty(video, 'currentTime', { value: currentTime, configurable: true });
}

describe('mediapipe loop', () => {
  let consoleWarnSpy;
  let consoleErrorSpy;
  let frameCallback;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    frameCallback = null;

    document.body.innerHTML = `
      <video id="video"></video>
      <select id="fpsSelect"><option value="1" selected>1</option></select>
    `;
    setVideoReady(document.getElementById('video'));

    mediapipeMocks.forVisionTasks.mockResolvedValue({ wasm: true });
    mediapipeMocks.detectForVideo.mockReturnValue({
      faceLandmarks: [[{ x: 0.1, y: 0.2, z: 0.3 }]],
      extra: 'result',
    });
    mediapipeMocks.createFromOptions.mockResolvedValue({
      detectForVideo: mediapipeMocks.detectForVideo,
    });

    vi.spyOn(performance, 'now').mockReturnValue(1000);
    vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { frameCallback = callback; return 123; }));

    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete window.gstmxx;
  });

  it('warns and skips startup when the gstmxx event bus is missing', async () => {
    await import('../../lab-js/mediapipe-loop.js');

    window.dispatchEvent(new CustomEvent('gstmxxReady'));
    await flushPromises();

    expect(consoleWarnSpy).toHaveBeenCalledWith('console_mediapipe_events_missing');
    expect(mediapipeMocks.forVisionTasks).not.toHaveBeenCalled();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('warns and skips startup when the video element is absent', async () => {
    document.body.innerHTML = '<select id="fpsSelect"></select>';
    window.gstmxx = { events: new EventTarget() };
    await import('../../lab-js/mediapipe-loop.js');
    window.dispatchEvent(new CustomEvent('gstmxxReady'));
    await flushPromises();
    expect(consoleWarnSpy).toHaveBeenCalledWith('console_mediapipe_video_missing');
    expect(mediapipeMocks.forVisionTasks).not.toHaveBeenCalled();
  });

  it('loads FaceLandmarker, emits readiness, and dispatches landmarks on the first eligible frame', async () => {
    const events = new EventTarget();
    const onReady = vi.fn();
    const onLandmarks = vi.fn();
    events.addEventListener('mediapipeReady', onReady);
    events.addEventListener('landmarks3d', onLandmarks);
    window.gstmxx = { events, log: vi.fn() };

    await import('../../lab-js/mediapipe-loop.js');
    window.dispatchEvent(new CustomEvent('gstmxxReady'));
    await flushPromises();

    expect(mediapipeMocks.forVisionTasks).toHaveBeenCalledWith('https://cdn.example.test/mediapipe/wasm');
    expect(mediapipeMocks.createFromOptions).toHaveBeenCalledWith(
      { wasm: true },
      expect.objectContaining({
        baseOptions: {
          modelAssetPath: 'https://cdn.example.test/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      })
    );
    expect(window.gstmxx.log).toHaveBeenCalledWith('mediapipe_ready_log', 'mediapipe');
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(mediapipeMocks.detectForVideo).toHaveBeenCalledWith(document.getElementById('video'), 1000);
    expect(window.gstmxx.lastLandmarks3d).toEqual([{ x: 0.1, y: 0.2, z: 0.3 }]);
    expect(onLandmarks.mock.calls[0][0].detail.landmarks).toEqual([{ x: 0.1, y: 0.2, z: 0.3 }]);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('waits for video data and throttles duplicate, early, and empty-landmark frames', async () => {
    const video = document.getElementById('video');
    setVideoReady(video, 1, 1);
    const events = new EventTarget();
    const onLandmarks = vi.fn();
    events.addEventListener('landmarks3d', onLandmarks);
    window.gstmxx = { events };
    await import('../../lab-js/mediapipe-loop.js');
    window.dispatchEvent(new CustomEvent('gstmxxReady'));
    await flushPromises();
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    video.dispatchEvent(new Event('loadeddata'));
    await flushPromises();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    frameCallback();
    expect(mediapipeMocks.detectForVideo).not.toHaveBeenCalled();

    setVideoReady(video, 4, 1);
    performance.now.mockReturnValue(1000);
    frameCallback();
    expect(mediapipeMocks.detectForVideo).toHaveBeenCalledOnce();

    performance.now.mockReturnValue(1300);
    frameCallback();
    expect(mediapipeMocks.detectForVideo).toHaveBeenCalledOnce();

    setVideoReady(video, 4, 2);
    document.getElementById('fpsSelect').value = 'invalid';
    mediapipeMocks.detectForVideo.mockReturnValueOnce({ faceLandmarks: [] });
    performance.now.mockReturnValue(1100);
    frameCallback();
    expect(mediapipeMocks.detectForVideo).toHaveBeenCalledTimes(1);
    performance.now.mockReturnValue(1121);
    frameCallback();
    expect(mediapipeMocks.detectForVideo).toHaveBeenCalledTimes(2);
    expect(onLandmarks.mock.calls.at(-1)[0].detail.landmarks).toBeNull();
    expect(window.gstmxx.lastLandmarks3d).toBeNull();
  });

  it('logs detector exceptions and catches a missing gstmxx during dispatch', async () => {
    const events = new EventTarget();
    window.gstmxx = { events };
    await import('../../lab-js/mediapipe-loop.js');
    window.dispatchEvent(new CustomEvent('gstmxxReady'));
    await flushPromises();

    const error = new Error('landmark failure');
    mediapipeMocks.detectForVideo.mockImplementationOnce(() => { throw error; });
    setVideoReady(document.getElementById('video'), 4, 2);
    performance.now.mockReturnValue(1200);
    frameCallback();
    expect(consoleErrorSpy).toHaveBeenCalledWith('console_mediapipe_tick_error', error);

    window.gstmxx = null;
    setVideoReady(document.getElementById('video'), 4, 3);
    performance.now.mockReturnValue(1400);
    frameCallback();
    expect(consoleErrorSpy).toHaveBeenCalledWith('console_mediapipe_tick_error', expect.any(TypeError));
  });

  it('logs MediaPipe initialization failures through the app logger', async () => {
    const loadError = new Error('model offline');
    mediapipeMocks.createFromOptions.mockRejectedValueOnce(loadError);
    window.gstmxx = { events: new EventTarget(), log: vi.fn() };

    await import('../../lab-js/mediapipe-loop.js');
    window.dispatchEvent(new CustomEvent('gstmxxReady'));
    await flushPromises();

    expect(consoleErrorSpy).toHaveBeenCalledWith('console_mediapipe_init_error', loadError);
    expect(window.gstmxx.log).toHaveBeenCalledWith(
      'mediapipe_load_error_log:{"message":"model offline"}',
      'mediapipe'
    );
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('starts when the event bus is available without a plugin logger', async () => {
    const events = new EventTarget();
    const onReady = vi.fn();
    events.addEventListener('mediapipeReady', onReady);
    window.gstmxx = { events };
    await import('../../lab-js/mediapipe-loop.js');
    window.dispatchEvent(new CustomEvent('gstmxxReady'));
    await flushPromises();
    expect(onReady).toHaveBeenCalledOnce();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
  });
});
