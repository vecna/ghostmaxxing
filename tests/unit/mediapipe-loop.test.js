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

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

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
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 123));

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
});
