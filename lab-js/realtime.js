import { MODEL_URLS, DETECTOR_OPTIONS } from './config.js';

const APP_STATES = {
  CALIBRATING: 'CALIBRATING',
  TRACKING: 'TRACKING',
};

const DESCRIPTOR_SIZE = 128;
const CELLS_PER_ROW = 10;
const MAX_DELTA = 0.15;
const THRESHOLD = 0.58;
const GRAPH_MAX_POINTS = 240;
const GRAPH_UPDATES_PER_SECOND = 3;
const COUNTDOWN_SECONDS = 3;

const runtime = {
  appState: APP_STATES.CALIBRATING,
  baselineDescriptor: null,
  needBaseline: false,
  distanceBuffer: [],
  graphHistory: [],
  equalizerRows: [],
  frameRequestId: null,
  graphTimerId: null,
  detectorBusy: false,
  initialized: false,
};

const els = {
  video: document.getElementById('webcam'),
  embeddingBar: document.getElementById('embedding-bar'),
  graph: document.getElementById('distance-graph'),
  countdownCircle: document.getElementById('countdown-circle'),
  btnReset: document.getElementById('btn-reset'),
  statusPill: document.getElementById('status-pill'),
  distanceValue: document.getElementById('distance-value'),
  trackingState: document.getElementById('tracking-state'),
};

const graphCtx = els.graph ? els.graph.getContext('2d') : null;

/**
 * Reads graph colors from shared style tokens with sane fallbacks.
 *
 * @returns {{background: string, signal: string, threshold: string}} Graph color palette.
 */
function getGraphPalette() {
  const styles = getComputedStyle(document.documentElement);
  const background = styles.getPropertyValue('--panel-2').trim() || '#2c2318';
  const signal = styles.getPropertyValue('--dev').trim() || '#7fe3b0';
  const threshold = styles.getPropertyValue('--net').trim() || '#ff8a4c';
  return { background, signal, threshold };
}

/**
 * Runtime bridge for diagnostics and Playwright checks.
 *
 * @type {object}
 */
window.gstmxxRealtime = {
  /**
   * Returns a clone of current runtime state values for tests and debugging.
   *
   * @returns {object} Serializable snapshot of calibrating/tracking internals.
   */
  getState() {
    return {
      appState: runtime.appState,
      hasBaseline: Boolean(runtime.baselineDescriptor),
      needBaseline: runtime.needBaseline,
      distanceBufferLength: runtime.distanceBuffer.length,
      graphHistoryLength: runtime.graphHistory.length,
    };
  },
  /**
   * Forces the calibrating workflow in tests without pressing UI controls.
   *
   * @returns {void}
   */
  triggerCalibration() {
    startCalibration();
  },
};

/**
 * Updates the floating status message shown over the video feed.
 *
 * @param {string} message Message visible in the status pill.
 * @returns {void}
 */
function setStatus(message) {
  if (!els.statusPill) return;
  els.statusPill.textContent = message;
}

/**
 * Updates the right-panel state label between CALIBRATING and TRACKING.
 *
 * @param {string} state Current app state value.
 * @returns {void}
 */
function setTrackingState(state) {
  if (!els.trackingState) return;
  els.trackingState.textContent = state;
}

/**
 * Updates the numeric distance readout with a fixed 3-decimal value.
 *
 * @param {number} value Euclidean distance value to display.
 * @returns {void}
 */
function setDistanceValue(value) {
  if (!els.distanceValue) return;
  els.distanceValue.textContent = Number.isFinite(value) ? value.toFixed(3) : '0.000';
}

/**
 * Builds the 128x10 descriptor equalizer grid and caches each row.
 *
 * @returns {void}
 */
function initEqualizer() {
  if (!els.embeddingBar) return;
  els.embeddingBar.innerHTML = '';
  runtime.equalizerRows = [];

  for (let rowIndex = 0; rowIndex < DESCRIPTOR_SIZE; rowIndex += 1) {
    const row = document.createElement('div');
    row.className = 'descriptor-row';

    for (let cellIndex = 0; cellIndex < CELLS_PER_ROW; cellIndex += 1) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      row.appendChild(cell);
    }

    els.embeddingBar.appendChild(row);
    runtime.equalizerRows.push(row);
  }
}

/**
 * Draws the smoothed distance history with time on the vertical axis.
 * Old samples are at the top and newest samples at the bottom.
 *
 * @returns {void}
 */
function drawGraphCanvas() {
  if (!graphCtx || !els.graph) return;

  const palette = getGraphPalette();

  const width = els.graph.width;
  const height = els.graph.height;

  graphCtx.clearRect(0, 0, width, height);

  graphCtx.fillStyle = palette.background;
  graphCtx.fillRect(0, 0, width, height);

  const thresholdX = Math.min((THRESHOLD / 1.0) * width, width);
  graphCtx.strokeStyle = palette.threshold;
  graphCtx.lineWidth = 2;
  graphCtx.beginPath();
  graphCtx.moveTo(thresholdX, 0);
  graphCtx.lineTo(thresholdX, height);
  graphCtx.stroke();

  if (!runtime.graphHistory.length) return;

  const points = runtime.graphHistory;
  const maxVisible = Math.min(points.length, GRAPH_MAX_POINTS);
  const start = points.length - maxVisible;
  const span = Math.max(maxVisible - 1, 1);

  graphCtx.strokeStyle = palette.signal;
  graphCtx.lineWidth = 2;
  graphCtx.beginPath();

  for (let i = 0; i < maxVisible; i += 1) {
    const value = points[start + i];
    const normalized = Math.max(0, Math.min(1, value / 1.0));
    const x = normalized * width;
    const y = (i / span) * height;

    if (i === 0) graphCtx.moveTo(x, y);
    else graphCtx.lineTo(x, y);
  }

  graphCtx.stroke();
}

/**
 * Updates every descriptor row based on per-index absolute baseline deltas.
 *
 * @param {Float32Array|number[]} baseline Baseline descriptor captured during calibration.
 * @param {Float32Array|number[]} current Current live descriptor.
 * @returns {void}
 */
function updateEqualizer(baseline, current) {
  if (!runtime.equalizerRows.length) return;

  for (let i = 0; i < DESCRIPTOR_SIZE; i += 1) {
    const delta = Math.abs(baseline[i] - current[i]);
    const scaled = Math.floor((delta / MAX_DELTA) * CELLS_PER_ROW);
    const litCells = Math.max(0, Math.min(CELLS_PER_ROW, scaled));
    const cells = runtime.equalizerRows[i].children;

    for (let c = 0; c < CELLS_PER_ROW; c += 1) {
      const cell = cells[c];
      cell.className = 'cell';

      if (c >= litCells) continue;
      if (c < 3) cell.classList.add('on-low');
      else if (c < 7) cell.classList.add('on-med');
      else cell.classList.add('on-high');
    }
  }
}

/**
 * Resets the equalizer UI to its neutral unlit state.
 *
 * @returns {void}
 */
function resetEqualizer() {
  for (const row of runtime.equalizerRows) {
    for (const cell of row.children) cell.className = 'cell';
  }
}

/**
 * Resizes the graph canvas to match CSS pixels and device pixel ratio.
 *
 * @returns {void}
 */
function resizeGraphCanvas() {
  if (!els.graph) return;
  const rect = els.graph.getBoundingClientRect();
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  const width = Math.max(Math.floor(rect.width * dpr), 1);
  const height = Math.max(Math.floor(rect.height * dpr), 1);

  if (els.graph.width === width && els.graph.height === height) return;
  els.graph.width = width;
  els.graph.height = height;
  drawGraphCanvas();
}

/**
 * Captures a baseline descriptor after the countdown by waiting for the first valid face.
 *
 * @returns {void}
 */
function armSafeBaselineCapture() {
  runtime.needBaseline = true;
  setStatus('Waiting for a clear face to capture baseline...');
  if (!els.countdownCircle) return;
  els.countdownCircle.style.display = 'flex';
  els.countdownCircle.classList.add('waiting');
  els.countdownCircle.textContent = 'Face not detected. Step into frame.';
}

/**
 * Runs the 3-2-1 countdown then enables safe baseline capture mode.
 *
 * @returns {void}
 */
function startCalibration() {
  runtime.appState = APP_STATES.CALIBRATING;
  runtime.baselineDescriptor = null;
  runtime.needBaseline = false;
  runtime.distanceBuffer = [];
  runtime.graphHistory = [];
  setTrackingState(APP_STATES.CALIBRATING);
  setDistanceValue(0);
  resetEqualizer();
  drawGraphCanvas();

  if (els.btnReset) els.btnReset.style.display = 'none';
  if (!els.countdownCircle) {
    armSafeBaselineCapture();
    return;
  }

  let remaining = COUNTDOWN_SECONDS;
  els.countdownCircle.classList.remove('waiting');
  els.countdownCircle.style.display = 'flex';
  els.countdownCircle.textContent = String(remaining);
  setStatus('Calibration countdown started...');

  const interval = window.setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      els.countdownCircle.textContent = String(remaining);
      return;
    }
    window.clearInterval(interval);
    armSafeBaselineCapture();
  }, 1000);
}

/**
 * Updates app state after a valid baseline descriptor is captured.
 *
 * @param {Float32Array|number[]} descriptor Descriptor captured from the live frame.
 * @returns {void}
 */
function setBaseline(descriptor) {
  runtime.baselineDescriptor = Array.from(descriptor);
  runtime.needBaseline = false;
  runtime.appState = APP_STATES.TRACKING;
  runtime.distanceBuffer = [];
  runtime.graphHistory = [];
  setTrackingState(APP_STATES.TRACKING);
  setDistanceValue(0);
  drawGraphCanvas();
  setStatus('Tracking active. Move your face to inspect descriptor drift.');

  if (els.countdownCircle) {
    els.countdownCircle.style.display = 'none';
    els.countdownCircle.classList.remove('waiting');
  }
  if (els.btnReset) els.btnReset.style.display = 'inline-flex';
}

/**
 * Handles one detected face based on the current runtime state.
 *
 * @param {*} detection face-api detection result containing a descriptor.
 * @returns {void}
 */
function processDetection(detection) {
  const currentDescriptor = detection.descriptor;
  if (!currentDescriptor) return;

  if (runtime.appState === APP_STATES.CALIBRATING && runtime.needBaseline) {
    setBaseline(currentDescriptor);
    return;
  }

  if (runtime.appState !== APP_STATES.TRACKING || !runtime.baselineDescriptor) return;

  const totalDistance = faceapi.euclideanDistance(runtime.baselineDescriptor, currentDescriptor);
  runtime.distanceBuffer.push(totalDistance);
  setDistanceValue(totalDistance);
  updateEqualizer(runtime.baselineDescriptor, currentDescriptor);

  if (totalDistance > THRESHOLD) setStatus('Distance crossed threshold (0.6): likely non-match');
  else setStatus('Within threshold: likely match');
}

/**
 * Handles "no face detected" situations depending on calibrating/tracking state.
 *
 * @returns {void}
 */
function processNoFace() {
  if (runtime.appState === APP_STATES.CALIBRATING && runtime.needBaseline && els.countdownCircle) {
    els.countdownCircle.style.display = 'flex';
    els.countdownCircle.classList.add('waiting');
    els.countdownCircle.textContent = 'Face not detected. Step into frame.';
  }

  if (runtime.appState === APP_STATES.TRACKING) {
    setStatus('Tracking paused: no face detected.');
  }
}

/**
 * Executes one face-api detection pass and schedules the next animation frame.
 *
 * @returns {Promise<void>}
 */
async function onFrame() {
  if (!runtime.initialized) return;
  runtime.frameRequestId = window.requestAnimationFrame(onFrame);
  if (runtime.detectorBusy) return;
  if (!els.video || els.video.readyState < 2) return;

  runtime.detectorBusy = true;
  try {
    const detection = await faceapi.detectSingleFace(els.video, DETECTOR_OPTIONS)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detection) processDetection(detection);
    else processNoFace();
  } catch (err) {
    console.error('realtime detection loop error:', err);
    setStatus('Detection error. Check console.');
  } finally {
    runtime.detectorBusy = false;
  }
}

/**
 * Pulls buffered distance samples, computes an average, and updates graph history.
 *
 * @returns {void}
 */
function flushDistanceBuffer() {
  if (!runtime.distanceBuffer.length) return;
  const sum = runtime.distanceBuffer.reduce((acc, value) => acc + value, 0);
  const averageDistance = sum / runtime.distanceBuffer.length;
  runtime.distanceBuffer = [];

  runtime.graphHistory.push(averageDistance);
  if (runtime.graphHistory.length > GRAPH_MAX_POINTS) runtime.graphHistory.shift();
  drawGraphCanvas();
}

/**
 * Starts the low-frequency graph smoothing loop at 3 updates per second.
 *
 * @returns {void}
 */
function startGraphLoop() {
  if (runtime.graphTimerId) window.clearInterval(runtime.graphTimerId);
  runtime.graphTimerId = window.setInterval(flushDistanceBuffer, 1000 / GRAPH_UPDATES_PER_SECOND);
}

/**
 * Requests camera stream and binds it to the realtime video element.
 *
 * @returns {Promise<void>}
 */
async function initWebcam() {
  if (!els.video) throw new Error('Missing #webcam element');

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user' },
    audio: false,
  });
  els.video.srcObject = stream;
  await els.video.play();
  setStatus('Webcam ready. Press "Set Baseline" to start calibration.');
}

/**
 * Loads the face-api models required for descriptor extraction.
 *
 * @returns {Promise<void>}
 */
async function loadModels() {
  const modelUris = [MODEL_URLS.tiny, MODEL_URLS.landmarks, MODEL_URLS.recognition];
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(modelUris[0]),
    faceapi.nets.faceLandmark68Net.loadFromUri(modelUris[1]),
    faceapi.nets.faceRecognitionNet.loadFromUri(modelUris[2]),
  ]);
  setStatus('Models loaded. Preparing camera...');
}

/**
 * Binds interaction and resize listeners needed during runtime.
 *
 * @returns {void}
 */
function bindListeners() {
  if (els.btnReset) els.btnReset.addEventListener('click', startCalibration);
  window.addEventListener('resize', resizeGraphCanvas);
}

/**
 * Initializes realtime visualizer components and starts analysis loops.
 *
 * @returns {Promise<void>}
 */
export async function initRealtime() {
  if (runtime.initialized) return;
  runtime.initialized = true;
  setStatus('Loading models...');
  setTrackingState(APP_STATES.CALIBRATING);

  initEqualizer();
  bindListeners();
  resizeGraphCanvas();
  drawGraphCanvas();

  await loadModels();
  await initWebcam();

  startGraphLoop();
  onFrame();
}

/**
 * Bootstraps realtime visualizer and reports startup errors in the status pill.
 *
 * @returns {void}
 */
async function boot() {
  try {
    await initRealtime();
  } catch (err) {
    console.error('Failed to initialize realtime visualizer:', err);
    setStatus(`Initialization failed: ${err.message || String(err)}`);
  }
}

boot();