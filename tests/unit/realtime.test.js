import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lab-js/config.js', () => ({
  MODEL_URLS: {
    tiny: 'https://models.test/tiny',
    landmarks: 'https://models.test/landmarks',
    recognition: 'https://models.test/recognition',
  },
  DETECTOR_OPTIONS: { detector: 'tiny-options' },
}));

function buildRealtimeDom() {
  document.body.innerHTML = `
    <video id="webcam"></video>
    <div id="embedding-bar"></div>
    <canvas id="distance-graph"></canvas>
    <div id="countdown-circle"></div>
    <button id="btn-reset"></button>
    <div id="status-pill"></div>
    <div id="distance-value"></div>
    <div id="tracking-state"></div>
  `;

  const video = document.getElementById('webcam');
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
  video.play = vi.fn(async () => {});

  const graph = document.getElementById('distance-graph');
  graph.getBoundingClientRect = vi.fn(() => ({ width: 300, height: 120 }));
}

function createDetectionChain(result) {
  return {
    withFaceLandmarks: vi.fn(() => ({
      withFaceDescriptor: vi.fn(async () => result),
    })),
  };
}

function installBrowserMocks() {
  const graphCtx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  };

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(graphCtx);
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: vi.fn((name) => ({
      '--panel-2': '#111111',
      '--dev': '#00ff99',
      '--net': '#ff6600',
    })[name] || ''),
  });

  Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn(async () => ({ id: 'stream' })),
    },
    configurable: true,
  });

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 100);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

  return graphCtx;
}

function installFaceApi(detection = null) {
  const faceapi = {
    nets: {
      tinyFaceDetector: { loadFromUri: vi.fn(async () => {}) },
      faceLandmark68Net: { loadFromUri: vi.fn(async () => {}) },
      faceRecognitionNet: { loadFromUri: vi.fn(async () => {}) },
    },
    detectSingleFace: vi.fn(() => createDetectionChain(detection)),
    euclideanDistance: vi.fn(() => 0.42),
  };
  globalThis.faceapi = faceapi;
  window.faceapi = faceapi;
  return faceapi;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('realtime visualizer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    buildRealtimeDom();
    installBrowserMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete window.gstmxxRealtime;
    delete window.faceapi;
    delete globalThis.faceapi;
  });

  it('bootstraps models, webcam, equalizer rows, graph canvas, and frame loop on import', async () => {
    const faceapi = installFaceApi(null);

    const { initRealtime } = await import('../../lab-js/realtime.js');
    await flushPromises();

    expect(faceapi.nets.tinyFaceDetector.loadFromUri).toHaveBeenCalledWith('https://models.test/tiny');
    expect(faceapi.nets.faceLandmark68Net.loadFromUri).toHaveBeenCalledWith('https://models.test/landmarks');
    expect(faceapi.nets.faceRecognitionNet.loadFromUri).toHaveBeenCalledWith('https://models.test/recognition');
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'user' },
      audio: false,
    });
    expect(document.getElementById('webcam').srcObject).toEqual({ id: 'stream' });
    expect(document.getElementById('embedding-bar').children).toHaveLength(128);
    expect(document.getElementById('distance-graph').width).toBe(600);
    expect(document.getElementById('distance-graph').height).toBe(240);
    expect(document.getElementById('tracking-state').textContent).toBe('CALIBRATING');
    expect(document.getElementById('status-pill').textContent).toBe('Webcam ready. Press "Set Baseline" to start calibration.');
    expect(window.requestAnimationFrame).toHaveBeenCalledWith(expect.any(Function));
    expect(window.gstmxxRealtime.getState()).toEqual({
      appState: 'CALIBRATING',
      hasBaseline: false,
      needBaseline: false,
      distanceBufferLength: 0,
      graphHistoryLength: 0,
    });

    await initRealtime();
    expect(faceapi.nets.tinyFaceDetector.loadFromUri).toHaveBeenCalledTimes(1);
  });

  it('captures a safe baseline after countdown when a descriptor is detected', async () => {
    const baseline = new Float32Array(128).fill(0.1);
    installFaceApi(null);

    await import('../../lab-js/realtime.js');
    await flushPromises();

    window.gstmxxRealtime.triggerCalibration();
    expect(document.getElementById('countdown-circle').textContent).toBe('3');
    expect(document.getElementById('btn-reset').style.display).toBe('none');

    vi.advanceTimersByTime(3000);
    expect(window.gstmxxRealtime.getState().needBaseline).toBe(true);
    expect(document.getElementById('countdown-circle').textContent).toBe('Face not detected. Step into frame.');

    faceapi.detectSingleFace.mockReturnValueOnce(createDetectionChain({ descriptor: baseline }));
    const frameCallback = window.requestAnimationFrame.mock.calls.at(-1)[0];
    await frameCallback();
    await flushPromises();

    expect(window.gstmxxRealtime.getState()).toMatchObject({
      appState: 'TRACKING',
      hasBaseline: true,
      needBaseline: false,
      distanceBufferLength: 0,
      graphHistoryLength: 0,
    });
    expect(document.getElementById('countdown-circle').style.display).toBe('none');
    expect(document.getElementById('btn-reset').style.display).toBe('inline-flex');
    expect(document.getElementById('status-pill').textContent).toBe('Tracking active. Move your face to inspect descriptor drift.');
  });

  it('updates distance readout, equalizer cells, and graph history while tracking', async () => {
    const baseline = new Float32Array(128).fill(0);
    const current = new Float32Array(128).fill(0.14);
    const faceapi = installFaceApi(null);

    await import('../../lab-js/realtime.js');
    await flushPromises();

    window.gstmxxRealtime.triggerCalibration();
    vi.advanceTimersByTime(3000);
    faceapi.detectSingleFace.mockReturnValueOnce(createDetectionChain({ descriptor: baseline }));
    await window.requestAnimationFrame.mock.calls.at(-1)[0]();
    await flushPromises();

    faceapi.euclideanDistance.mockReturnValue(0.72);
    faceapi.detectSingleFace.mockReturnValueOnce(createDetectionChain({ descriptor: current }));
    await window.requestAnimationFrame.mock.calls.at(-1)[0]();
    await flushPromises();

    expect(document.getElementById('distance-value').textContent).toBe('0.720');
    expect(document.getElementById('status-pill').textContent).toBe('Distance crossed threshold (0.6): likely non-match');
    expect(document.querySelector('#embedding-bar .descriptor-row .on-high')).not.toBeNull();
    expect(window.gstmxxRealtime.getState().distanceBufferLength).toBe(1);

    vi.advanceTimersByTime(334);
    expect(window.gstmxxRealtime.getState()).toMatchObject({
      distanceBufferLength: 0,
      graphHistoryLength: 1,
    });
  });

  it('reports startup failures in the status pill', async () => {
    const startupError = new Error('camera denied');
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    installFaceApi(null);
    navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(startupError);

    await import('../../lab-js/realtime.js');
    await flushPromises();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to initialize realtime visualizer:', startupError);
    expect(document.getElementById('status-pill').textContent).toBe('Initialization failed: camera denied');
  });
});
