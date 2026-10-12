/**
 * @module realtime
 * @description
 * Entry point for the latent space visualizer. Owns the detection loop, the
 * descriptor equalizer, the presence state machine and the page lifecycle;
 * everything else lives in the sibling realtime-* modules.
 *
 * The page measures one thing: how far a face has moved from a reference
 * captured before the makeup session. Two lines on the plot carry claims and
 * they are different kinds of claim — the noise floor is measured here, on this
 * camera, from this face; 0.60 is dlib's LFW default and is a property of a
 * benchmark, not of anyone's face. Nothing is drawn between them, because
 * nothing between them has been measured.
 */

import { MODEL_URLS, DETECTOR_OPTIONS } from '../config.js';
import { createGraph, formatDuration } from './realtime-graph.js';
import {
  createQualityGate,
  createBaselineCollector,
  createSpikeDetector,
  createFrameBuffer,
  compareConditions,
  euclidean,
} from './realtime-capture.js';
import { createGallery } from './realtime-gallery.js';
import { createRadialGraph } from './realtime-radial.js';
import {
  createSettings,
  guardDestructive,
  loadBaseline,
  saveBaseline,
  clearBaseline,
} from './realtime-settings.js';

const APP_STATES = {
  NO_BASELINE: 'NO BASELINE',
  CAPTURING: 'CAPTURING',
  TRACKING: 'TRACKING',
};

const SESSION_PHASES = {
  IDLE: 'idle',
  READY: 'ready',
  APPLYING: 'applying',
  MEASURING: 'measuring',
};

const DESCRIPTOR_SIZE = 128;
const CELLS_PER_ROW = 10;
const MAX_DELTA = 0.15;

/** dlib's documented default, measured on LFW. Cited, not tuned, not movable. */
const MATCH_THRESHOLD = 0.6;

/** Impostor pairs live below this; the ceiling exists so success has headroom. */
const GRAPH_MAX_DISTANCE = 1.25;
const GRAPH_WINDOW_SECONDS = 60;
const SAMPLES_PER_SECOND = 3;

/** Long enough that a blink or a head turn does not punch a hole in the trace. */
const NO_FACE_DEBOUNCE_MS = 1500;

const BASELINE_TARGET_SAMPLES = 8;
const BASELINE_MIN_MS = 3000;
const BASELINE_TIMEOUT_MS = 30000;
const BASELINE_MAX_SPREAD = 0.2;
const MEASUREMENT_TARGET_SAMPLES = 8;
const MEASUREMENT_MIN_MS = 3000;
const MEASUREMENT_TIMEOUT_MS = 30000;
const MEASUREMENT_MAX_SPREAD = 0.2;

const SPIKE_SUSTAIN_MS = 1500;
const SPIKE_BEST_MARGIN = 0.05;
const SPIKE_COOLDOWN_MS = 8000;
const FRAME_BUFFER_SLOTS = 5;
const CAPTURE_MAX_WIDTH = 960;

/** Grace period before a hidden tab loses the camera entirely. */
const HIDDEN_STOP_DELAY_MS = 45000;

const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const runtime = {
  appState: APP_STATES.NO_BASELINE,
  baseline: null,
  equalizerRows: [],
  equalizerLit: new Int16Array(DESCRIPTOR_SIZE).fill(-1),
  distanceBuffer: [],
  frameRequestId: null,
  flushTimerId: null,
  hiddenStopTimerId: null,
  detectorBusy: false,
  initialized: false,
  running: false,
  streamStopped: false,
  faceMissing: false,
  lastFaceAt: 0,
  stream: null,
  sourceKind: 'camera',
  sourceEpoch: 0,
  sourceObjectUrl: null,
  lastDetectionScore: null,
  lastDescriptorLength: 0,
  comparisonExcluded: false,
  sessionPhase: SESSION_PHASES.IDLE,
  sessionStep: 0,
  lastMeasurement: null,
};

const els = {
  layer: document.getElementById('ui-layer'),
  video: document.getElementById('webcam'),
  centerView: document.getElementById('center-view'),
  embeddingBar: document.getElementById('embedding-bar'),
  graphScroll: document.getElementById('graph-scroll'),
  graphSpacer: document.getElementById('graph-spacer'),
  graphCanvas: document.getElementById('distance-graph'),
  graphFollow: document.getElementById('graph-follow'),
  radialCanvas: document.getElementById('radial-graph'),
  legendNoise: document.getElementById('legend-noise'),
  calibrationUi: document.getElementById('calibration-ui'),
  captureRing: document.getElementById('capture-ring'),
  captureRingArc: document.getElementById('capture-ring-arc'),
  captureRingCount: document.getElementById('capture-ring-count'),
  captureHint: document.getElementById('capture-hint'),
  btnBaselineStart: document.getElementById('btn-baseline-start'),
  btnBaseline: document.getElementById('btn-baseline'),
  btnShutter: document.getElementById('btn-shutter'),
  btnDownloadAll: document.getElementById('btn-download-all'),
  btnDeleteAll: document.getElementById('btn-delete-all'),
  galleryCount: document.getElementById('gallery-count'),
  brightness: document.getElementById('brightness-input'),
  brightnessValue: document.getElementById('brightness-value'),
  toggleEqualizer: document.getElementById('toggle-equalizer'),
  sessionBar: document.getElementById('session-bar'),
  sessionStep: document.getElementById('session-step'),
  sessionResult: document.getElementById('session-result'),
  btnStartChange: document.getElementById('btn-start-change'),
  btnMeasureChange: document.getElementById('btn-measure-change'),
  videoUpload: document.getElementById('video-upload'),
  btnOpenVideo: document.getElementById('btn-open-video'),
  btnUseCamera: document.getElementById('btn-use-camera'),
  sourceState: document.getElementById('source-state'),
  statusPill: document.getElementById('status-pill'),
  distanceValue: document.getElementById('distance-value'),
  trackingState: document.getElementById('tracking-state'),
  viewer: document.getElementById('photo-viewer'),
  viewerImage: document.getElementById('viewer-image'),
  viewerMeta: document.getElementById('viewer-meta'),
  viewerCopy: document.getElementById('viewer-copy'),
  viewerDownload: document.getElementById('viewer-download'),
  viewerDelete: document.getElementById('viewer-delete'),
  viewerClose: document.getElementById('viewer-close'),
};

let graph = null;
let radialGraph = null;
let gallery = null;
let qualityGate = null;
let baselineCollector = null;
let measurementCollector = null;
let spikeDetector = null;
let frameBuffer = null;

/**
 * Writes the floating status message over the video stage.
 *
 * @param {string} message Message to display.
 * @param {boolean} [warn] Whether the message needs emphasis.
 * @returns {void}
 */
function setStatus(message, warn = false) {
  if (!els.statusPill) return;
  els.statusPill.textContent = message;
  els.statusPill.classList.toggle('is-warn', warn);
}

/**
 * Writes the right-panel state label.
 *
 * @param {string} state Current app state.
 * @returns {void}
 */
function setTrackingState(state) {
  if (els.trackingState) els.trackingState.textContent = state;
}

/**
 * Writes the numeric distance readout.
 *
 * @param {number} value Distance to display.
 * @returns {void}
 */
function setDistanceValue(value) {
  if (!els.distanceValue) return;
  els.distanceValue.textContent = Number.isFinite(value) ? value.toFixed(3) : '—';
}

/**
 * Computes signed per-coordinate descriptor deltas.
 *
 * @param {Float32Array|number[]} baseline Baseline descriptor.
 * @param {Float32Array|number[]} current Current descriptor.
 * @returns {Float32Array} Signed deltas in descriptor order.
 */
function descriptorDelta(baseline, current) {
  const delta = new Float32Array(DESCRIPTOR_SIZE);
  for (let index = 0; index < DESCRIPTOR_SIZE; index += 1) {
    delta[index] = current[index] - baseline[index];
  }
  return delta;
}

/** Returns a compact local-video time suffix for timeline events. */
function mediaTimeSuffix() {
  if (runtime.sourceKind !== 'video' || !Number.isFinite(els.video.currentTime)) return '';
  const total = Math.max(0, els.video.currentTime);
  const minutes = Math.floor(total / 60);
  const seconds = (total % 60).toFixed(1).padStart(4, '0');
  return ` · ${minutes}:${seconds}`;
}

/** Reflects the declared experiment phase in the workflow controls. */
function syncSessionControls() {
  const hasBaseline = Boolean(runtime.baseline);
  els.sessionBar.hidden = !hasBaseline;
  els.btnStartChange.disabled = !hasBaseline || runtime.sessionPhase === SESSION_PHASES.MEASURING;
  els.btnMeasureChange.disabled = runtime.sessionPhase !== SESSION_PHASES.APPLYING;

  if (!hasBaseline) {
    els.sessionStep.textContent = 'Ready';
    els.sessionResult.textContent = 'Capture a clean baseline first.';
    return;
  }

  if (runtime.sessionPhase === SESSION_PHASES.APPLYING) {
    els.sessionStep.textContent = `Step ${runtime.sessionStep + 1} · applying`;
    els.sessionResult.textContent = 'Live readings continue, but this interval is marked as application time.';
    els.btnStartChange.textContent = 'Applying…';
  } else if (runtime.sessionPhase === SESSION_PHASES.MEASURING) {
    els.sessionStep.textContent = `Step ${runtime.sessionStep + 1} · measuring`;
    els.sessionResult.textContent = 'Collecting a comparable temporal window…';
    els.btnStartChange.textContent = 'Start makeup step';
  } else {
    els.sessionStep.textContent = runtime.sessionStep ? `Step ${runtime.sessionStep} measured` : 'Ready';
    els.sessionResult.textContent = runtime.lastMeasurement
      ? `Snapshot d=${runtime.lastMeasurement.distance.toFixed(3)} · spread ±${runtime.lastMeasurement.spread.toFixed(3)}`
      : 'Mark when you begin applying a change.';
    els.btnStartChange.textContent = runtime.sessionStep ? 'Start next step' : 'Start makeup step';
  }
}

/** Changes the declared experiment phase and redraws its controls. */
function setSessionPhase(phase) {
  runtime.sessionPhase = phase;
  syncSessionControls();
}

/**
 * Builds the descriptor equalizer.
 *
 * Level is baked into each cell at build time so the runtime loop only toggles
 * .is-on for cells that actually changed. The prototype rewrote all 1,280
 * className strings on every detection frame.
 *
 * @returns {void}
 */
function initEqualizer() {
  if (!els.embeddingBar) return;
  els.embeddingBar.textContent = '';
  runtime.equalizerRows = [];
  runtime.equalizerLit = new Int16Array(DESCRIPTOR_SIZE).fill(0);

  for (let rowIndex = 0; rowIndex < DESCRIPTOR_SIZE; rowIndex += 1) {
    const row = document.createElement('div');
    row.className = 'descriptor-row';

    for (let cellIndex = 0; cellIndex < CELLS_PER_ROW; cellIndex += 1) {
      const cell = document.createElement('div');
      let level = 'lvl-high';
      if (cellIndex < 3) level = 'lvl-low';
      else if (cellIndex < 7) level = 'lvl-med';
      cell.className = `cell ${level}`;
      row.appendChild(cell);
    }

    els.embeddingBar.appendChild(row);
    runtime.equalizerRows.push(row);
  }
}

/**
 * Updates the equalizer from per-index baseline deltas.
 *
 * @param {number[]} baseline Baseline descriptor.
 * @param {Float32Array|number[]} current Live descriptor.
 * @returns {void}
 */
function updateEqualizer(baseline, current) {
  if (!runtime.equalizerRows.length) return;

  for (let i = 0; i < DESCRIPTOR_SIZE; i += 1) {
    const delta = Math.abs(baseline[i] - current[i]);
    const scaled = Math.floor((delta / MAX_DELTA) * CELLS_PER_ROW);
    const lit = Math.max(0, Math.min(CELLS_PER_ROW, scaled));
    const previous = runtime.equalizerLit[i];
    if (lit === previous) continue;

    const cells = runtime.equalizerRows[i].children;
    if (lit > previous) {
      for (let c = previous; c < lit; c += 1) cells[c].classList.add('is-on');
    } else {
      for (let c = lit; c < previous; c += 1) cells[c].classList.remove('is-on');
    }
    runtime.equalizerLit[i] = lit;
  }
  if (radialGraph) radialGraph.setLive(descriptorDelta(baseline, current));
}

/**
 * Returns the equalizer to its unlit state.
 *
 * @returns {void}
 */
function resetEqualizer() {
  for (let i = 0; i < runtime.equalizerRows.length; i += 1) {
    const cells = runtime.equalizerRows[i].children;
    for (const cell of cells) cell.classList.remove('is-on');
    runtime.equalizerLit[i] = 0;
  }
  if (radialGraph) radialGraph.setLive(null);
}

/**
 * Updates the baseline capture ring.
 *
 * @param {number} accepted Accepted samples so far.
 * @param {number} target Samples required.
 * @returns {void}
 */
function setRingProgress(accepted, target) {
  if (!els.captureRingArc) return;
  const ratio = Math.max(0, Math.min(1, accepted / target));
  els.captureRingArc.style.strokeDasharray = String(RING_CIRCUMFERENCE);
  els.captureRingArc.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - ratio));
  if (els.captureRingCount) els.captureRingCount.textContent = String(accepted);
  if (els.captureRing) els.captureRing.setAttribute('aria-valuenow', String(accepted));
}

/**
 * Shows or hides the baseline capture overlay.
 *
 * @param {boolean} visible Whether the overlay should show.
 * @returns {void}
 */
function setCalibrationVisible(visible) {
  if (els.calibrationUi) els.calibrationUi.hidden = !visible;
}

/**
 * Reflects baseline presence across the controls that depend on it.
 *
 * @returns {void}
 */
function syncBaselineControls() {
  const hasBaseline = Boolean(runtime.baseline);
  if (els.btnBaseline) els.btnBaseline.hidden = !hasBaseline;
  if (els.btnShutter) els.btnShutter.disabled = !hasBaseline;
  setCalibrationVisible(!hasBaseline);
  if (els.btnBaselineStart) els.btnBaselineStart.hidden = false;

  if (els.legendNoise) {
    els.legendNoise.textContent = hasBaseline ? runtime.baseline.noiseFloor.toFixed(3) : '—';
  }
  if (graph) graph.setNoiseFloor(hasBaseline ? runtime.baseline.noiseFloor : null);
  syncSessionControls();
}

/**
 * Starts or resumes a selected local video before a declared session action.
 *
 * @param {string} failureMessage Status shown when autoplay is rejected.
 * @returns {Promise<boolean>} Whether the action may continue.
 */
async function ensureLocalVideoPlaying(failureMessage) {
  if (runtime.sourceKind !== 'video' || !els.video.paused) return true;
  try {
    if (els.video.ended) els.video.currentTime = 0;
    await els.video.play();
    return true;
  } catch {
    setStatus(failureMessage, true);
    return false;
  }
}

/**
 * Begins a baseline capture run.
 *
 * @returns {Promise<void>}
 */
async function startBaselineCapture() {
  const playing = await ensureLocalVideoPlaying(
    'Play the local video before capturing a baseline.',
  );
  if (!playing) return;
  runtime.appState = APP_STATES.CAPTURING;
  runtime.baseline = null;
  runtime.distanceBuffer = [];
  runtime.comparisonExcluded = false;
  runtime.sessionStep = 0;
  runtime.lastMeasurement = null;
  setSessionPhase(SESSION_PHASES.IDLE);
  clearBaseline();

  setTrackingState(APP_STATES.CAPTURING);
  setDistanceValue(0);
  resetEqualizer();
  graph.reset();
  graph.setNoiseFloor(null);
  spikeDetector.reset();
  frameBuffer.clear();
  if (radialGraph) radialGraph.reset();

  setCalibrationVisible(true);
  if (els.captureRing) els.captureRing.classList.add('is-active');
  if (els.btnBaselineStart) els.btnBaselineStart.hidden = true;
  if (els.btnBaseline) els.btnBaseline.hidden = true;
  if (els.btnShutter) els.btnShutter.disabled = true;
  if (els.legendNoise) els.legendNoise.textContent = '—';

  setRingProgress(0, BASELINE_TARGET_SAMPLES);
  setHint('Hold still and look at the camera.', true);
  setStatus('Capturing baseline…');
  baselineCollector.start();
}

/**
 * Writes the capture overlay hint line.
 *
 * @param {string} text Hint text.
 * @param {boolean} [blocking] Whether the hint is an instruction to act on.
 * @returns {void}
 */
function setHint(text, blocking = false) {
  if (!els.captureHint) return;
  els.captureHint.textContent = text;
  els.captureHint.classList.toggle('is-blocking', blocking);
}

/**
 * Adopts a captured or restored baseline and enters tracking.
 *
 * @param {object} baseline Baseline record.
 * @param {boolean} [restored] Whether the baseline came from storage.
 * @returns {void}
 */
function adoptBaseline(baseline, restored = false) {
  runtime.baseline = baseline;
  runtime.appState = APP_STATES.TRACKING;
  runtime.distanceBuffer = [];
  runtime.faceMissing = false;
  runtime.comparisonExcluded = false;
  runtime.sessionStep = 0;
  runtime.lastMeasurement = null;
  setSessionPhase(SESSION_PHASES.READY);

  setTrackingState(APP_STATES.TRACKING);
  setDistanceValue(0);
  resetEqualizer();
  spikeDetector.reset();
  frameBuffer.clear();
  if (radialGraph) radialGraph.reset();

  if (els.captureRing) els.captureRing.classList.remove('is-active');
  syncBaselineControls();

  if (restored) {
    const age = formatDuration(Date.now() - baseline.capturedAt);
    setStatus(`Baseline restored, captured ${age} ago. Noise floor ${baseline.noiseFloor.toFixed(3)}.`);
  } else {
    setStatus(`Baseline set. Noise floor ${baseline.noiseFloor.toFixed(3)} — anything below that is not a result.`);
  }
}

/**
 * Discards the current baseline and returns to the capture prompt.
 *
 * @returns {void}
 */
function deleteBaseline() {
  runtime.baseline = null;
  runtime.appState = APP_STATES.NO_BASELINE;
  runtime.comparisonExcluded = false;
  runtime.sessionStep = 0;
  runtime.lastMeasurement = null;
  setSessionPhase(SESSION_PHASES.IDLE);
  clearBaseline();
  baselineCollector.cancel();
  measurementCollector.cancel();

  setTrackingState(APP_STATES.NO_BASELINE);
  setDistanceValue(0);
  resetEqualizer();
  graph.reset();
  spikeDetector.reset();
  frameBuffer.clear();
  if (radialGraph) radialGraph.reset();

  if (els.captureRing) els.captureRing.classList.remove('is-active');
  syncBaselineControls();
  setHint('Capture a reference of your bare face before you start.');
  setStatus('Baseline deleted. Saved captures are kept.');
}

/**
 * Feeds one detection into the baseline collector.
 *
 * @param {*} detection face-api detection result.
 * @returns {void}
 */
function processBaselineFrame(detection) {
  const verdict = qualityGate.evaluate(detection);
  const progress = baselineCollector.offer(verdict, detection.descriptor);

  setRingProgress(progress.accepted, progress.target);

  if (progress.status === 'blocked') {
    setHint(progress.reason, true);
    return;
  }
  if (progress.status === 'collecting') {
    setHint('Hold still and look at the camera.', true);
    return;
  }
  if (progress.status === 'failed') {
    if (els.captureRing) els.captureRing.classList.remove('is-active');
    if (els.btnBaselineStart) els.btnBaselineStart.hidden = false;
    runtime.appState = APP_STATES.NO_BASELINE;
    setTrackingState(APP_STATES.NO_BASELINE);
    setHint(`Could not get a clean read. ${progress.reason}`, true);
    setStatus('Baseline capture abandoned.', true);
    return;
  }
  if (progress.status === 'done') {
    // Camera baselines can be restored against the same physical source. A
    // local video's blob URL disappears on reload, so persisting that template
    // would silently compare the next camera session with the wrong source.
    if (runtime.sourceKind === 'camera') {
      saveBaseline({ ...progress.baseline, sourceKind: 'camera' });
    } else {
      clearBaseline();
    }
    adoptBaseline(progress.baseline, false);
  }
}

/** Marks the beginning of one operator-declared makeup change. */
async function startMakeupStep() {
  if (!runtime.baseline || runtime.appState !== APP_STATES.TRACKING) return;
  const playing = await ensureLocalVideoPlaying(
    'Play the local video before marking the makeup step.',
  );
  if (!playing) return;
  measurementCollector.cancel();
  frameBuffer.clear();
  setSessionPhase(SESSION_PHASES.APPLYING);
  graph.addEvent(
    Date.now(),
    SESSION_PHASES.APPLYING,
    `step ${runtime.sessionStep + 1}: applying${mediaTimeSuffix()}`,
  );
  setStatus('Application interval marked. When this piece is finished, measure the result.');
}

/** Starts a temporal measurement window for the current declared change. */
async function startStepMeasurement() {
  if (!runtime.baseline || runtime.sessionPhase !== SESSION_PHASES.APPLYING) return;
  const playing = await ensureLocalVideoPlaying(
    'Play the local video before measuring this step.',
  );
  if (!playing) return;
  measurementCollector.start();
  frameBuffer.clear();
  setSessionPhase(SESSION_PHASES.MEASURING);
  graph.addEvent(
    Date.now(),
    SESSION_PHASES.MEASURING,
    `step ${runtime.sessionStep + 1}: measuring${mediaTimeSuffix()}`,
  );
  setStatus('Measuring this step — hold the baseline pose and lighting.');
}

/**
 * Publishes an aggregated step measurement and saves its sharpest frame.
 *
 * @param {object} snapshot Temporal-window result returned by the collector.
 * @returns {Promise<void>}
 */
async function completeStepMeasurement(snapshot) {
  const distance = euclidean(runtime.baseline.descriptor, snapshot.descriptor);
  const delta = descriptorDelta(runtime.baseline.descriptor, snapshot.descriptor);
  runtime.sessionStep += 1;
  runtime.lastMeasurement = {
    distance,
    spread: snapshot.noiseFloor,
    descriptor: snapshot.descriptor,
    conditions: snapshot.conditions,
    capturedAt: snapshot.capturedAt,
  };

  if (radialGraph) radialGraph.setMeasured(delta);
  updateEqualizer(runtime.baseline.descriptor, snapshot.descriptor);
  graph.addEvent(
    Date.now(),
    SESSION_PHASES.MEASURING,
    `step ${runtime.sessionStep}: snapshot d=${distance.toFixed(3)}${mediaTimeSuffix()}`,
  );

  const best = frameBuffer.best();
  if (best) await storeCapture(best.canvas, distance, `step-${runtime.sessionStep}`);
  frameBuffer.clear();
  setSessionPhase(SESSION_PHASES.READY);
  setStatus(
    `Step ${runtime.sessionStep} measured: d=${distance.toFixed(3)}, temporal spread ±${snapshot.noiseFloor.toFixed(3)}.`,
  );
}

/**
 * Measures one tracking frame and evaluates it for a spike capture.
 *
 * @param {*} detection face-api detection result.
 * @returns {Promise<void>}
 */
async function processTrackingFrame(detection) {
  // Makeup may legitimately change detector confidence and the exposure inside
  // the face crop. Comparability is based on pose, framing and ambient light so
  // the intervention itself is not filtered away.
  const quality = qualityGate.evaluate(detection, { allowAppearanceChanges: true });
  const comparable = quality.ok
    ? compareConditions(runtime.baseline.conditions, quality.metrics)
    : { ok: false, reason: quality.reason };

  if (!comparable.ok) {
    runtime.distanceBuffer = [];
    runtime.comparisonExcluded = true;
    resetEqualizer();
    setDistanceValue(Number.NaN);
    els.btnShutter.disabled = true;
    graph.beginGap(Date.now(), 'pose/light excluded');

    if (runtime.sessionPhase === SESSION_PHASES.MEASURING) {
      const progress = measurementCollector.offer(
        { ok: false, reason: comparable.reason },
        detection.descriptor,
      );
      els.sessionResult.textContent = `Waiting for comparable frames: ${comparable.reason}`;
      if (progress.status === 'failed') {
        measurementCollector.cancel();
        setSessionPhase(SESSION_PHASES.APPLYING);
        setStatus(`Measurement paused. ${progress.reason}`, true);
      }
    } else {
      setStatus(`${comparable.reason} This frame is excluded from the measurement.`, true);
    }
    return;
  }

  if (runtime.comparisonExcluded) {
    runtime.comparisonExcluded = false;
    graph.endGap(Date.now());
  }
  els.btnShutter.disabled = false;

  const distance = euclidean(runtime.baseline.descriptor, detection.descriptor);
  runtime.distanceBuffer.push(distance);
  setDistanceValue(distance);
  updateEqualizer(runtime.baseline.descriptor, detection.descriptor);

  if (runtime.sessionPhase === SESSION_PHASES.MEASURING) {
    const progress = measurementCollector.offer(quality, detection.descriptor);
    if (quality.ok) frameBuffer.push(quality.sharpness, distance);
    if (progress.status === 'collecting') {
      els.sessionResult.textContent = `Comparable samples ${progress.accepted}/${progress.target}`;
    } else if (progress.status === 'done') {
      await completeStepMeasurement(progress.baseline);
    } else if (progress.status === 'failed') {
      setSessionPhase(SESSION_PHASES.APPLYING);
      setStatus(`Could not measure this step. ${progress.reason}`, true);
    }
    return;
  }

  if (distance > MATCH_THRESHOLD) {
    setStatus(`Past the 0.60 match threshold — reads as a different person.`);
  } else if (distance <= runtime.baseline.noiseFloor) {
    setStatus('Inside the noise floor — nothing has changed yet.');
  } else {
    setStatus(`Above the noise floor, below 0.60 — still reads as a match.`);
  }

  // Declared application intervals use an explicit temporal snapshot. Automatic
  // "best" captures remain available only while the experiment is otherwise idle.
  if (runtime.sessionPhase === SESSION_PHASES.APPLYING) return;

  const verdict = spikeDetector.update(distance);
  if (!verdict.candidate) return;

  if (quality.ok) frameBuffer.push(quality.sharpness, distance);

  if (!verdict.capture) return;

  const best = frameBuffer.best();
  if (!best) return;

  await storeCapture(best.canvas, best.distance, verdict.kind);
  spikeDetector.noteCapture(best.distance);
  frameBuffer.clear();
}

/**
 * Watermarks and stores one frame, then marks it on the timeline.
 *
 * @param {HTMLCanvasElement} frame Frame to store.
 * @param {number} distance Distance at capture time.
 * @param {string} kind Capture trigger.
 * @returns {Promise<void>}
 */
async function storeCapture(frame, distance, kind) {
  try {
    const id = await gallery.save(frame, {
      t: Date.now(),
      distance,
      noiseFloor: runtime.baseline ? runtime.baseline.noiseFloor : 0,
      threshold: MATCH_THRESHOLD,
      kind,
    });
    graph.markLatestCapture(id);
    setStatus(`Capture saved at ${distance.toFixed(3)}.`);
  } catch (err) {
    console.error('capture save failed:', err);
    setStatus('Could not save the capture.', true);
  }
}

/**
 * Captures the current frame on demand.
 *
 * @returns {Promise<void>}
 */
async function captureNow() {
  if (!runtime.baseline || !els.video || els.video.readyState < 2) return;

  const videoW = els.video.videoWidth;
  const scale = Math.min(1, CAPTURE_MAX_WIDTH / videoW);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(videoW * scale);
  canvas.height = Math.round(els.video.videoHeight * scale);
  canvas.getContext('2d').drawImage(els.video, 0, 0, canvas.width, canvas.height);

  const distance = Number(els.distanceValue.textContent) || 0;
  await storeCapture(canvas, distance, 'manual');
}

/**
 * Handles a frame in which no face was found.
 *
 * After the debounce the timeline stops advancing entirely and the absence is
 * drawn as one collapsed block. Nothing is sampled until a face returns, so
 * stepping away to apply makeup costs no scroll and produces no readings.
 *
 * @returns {void}
 */
function processNoFace() {
  const now = Date.now();
  if (!runtime.lastFaceAt) runtime.lastFaceAt = now;
  if (now - runtime.lastFaceAt < NO_FACE_DEBOUNCE_MS) return;

  if (!runtime.faceMissing) {
    runtime.faceMissing = true;
    runtime.distanceBuffer = [];
    resetEqualizer();
    setDistanceValue(0);
    if (els.btnShutter) els.btnShutter.disabled = true;
    setStatus('No face — measurement paused.');
  }

  if (runtime.appState === APP_STATES.TRACKING) {
    graph.beginGap(runtime.lastFaceAt, 'no face');
  }

  if (runtime.sessionPhase === SESSION_PHASES.MEASURING) {
    els.sessionResult.textContent = 'Waiting for the face to return.';
  }

  if (runtime.appState === APP_STATES.CAPTURING) {
    setHint('Step into frame.', true);
  }
}

/**
 * Handles a face reappearing after an absence.
 *
 * @returns {void}
 */
function processFaceReturned() {
  const now = Date.now();
  if (runtime.faceMissing) {
    runtime.faceMissing = false;
    graph.endGap(now);
    setStatus('Face back — reading resuming.');
  }
  runtime.lastFaceAt = now;
}

/**
 * Runs one detection pass and schedules the next frame.
 *
 * @returns {Promise<void>}
 */
async function onFrame() {
  if (!runtime.running) return;
  runtime.frameRequestId = window.requestAnimationFrame(onFrame);
  if (runtime.detectorBusy) return;
  if (!els.video || els.video.readyState < 2) return;

  runtime.detectorBusy = true;
  const sourceEpoch = runtime.sourceEpoch;
  try {
    const detection = await faceapi
      .detectSingleFace(els.video, DETECTOR_OPTIONS)
      .withFaceLandmarks()
      .withFaceDescriptor();

    // A camera detection can still be resolving while a local file is being
    // selected. Never publish results produced for the previous source.
    if (sourceEpoch !== runtime.sourceEpoch) return;

    if (!detection || !detection.descriptor) {
      runtime.lastDetectionScore = null;
      runtime.lastDescriptorLength = 0;
      processNoFace();
      return;
    }

    runtime.lastDetectionScore = detection.detection?.score ?? null;
    runtime.lastDescriptorLength = detection.descriptor.length;

    processFaceReturned();

    if (runtime.appState === APP_STATES.CAPTURING) {
      processBaselineFrame(detection);
    } else if (runtime.appState === APP_STATES.TRACKING && runtime.baseline) {
      await processTrackingFrame(detection);
    }
  } catch (err) {
    console.error('realtime detection loop error:', err);
    setStatus('Detection error. Check the console.', true);
  } finally {
    runtime.detectorBusy = false;
  }
}

/**
 * Averages buffered readings into one timeline sample.
 *
 * @returns {void}
 */
function flushDistanceBuffer() {
  if (runtime.appState !== APP_STATES.TRACKING) return;
  if (runtime.faceMissing) {
    graph.draw();
    return;
  }
  if (!runtime.distanceBuffer.length) return;

  const sum = runtime.distanceBuffer.reduce((acc, value) => acc + value, 0);
  const average = sum / runtime.distanceBuffer.length;
  runtime.distanceBuffer = [];
  graph.pushSample(Date.now(), average, runtime.sessionPhase);
}

/**
 * Starts the detection and sampling loops.
 *
 * @returns {void}
 */
function startLoops() {
  if (runtime.running) return;
  runtime.running = true;
  if (runtime.flushTimerId) window.clearInterval(runtime.flushTimerId);
  runtime.flushTimerId = window.setInterval(flushDistanceBuffer, 1000 / SAMPLES_PER_SECOND);
  onFrame();
}

/**
 * Stops the detection and sampling loops without touching the camera.
 *
 * @returns {void}
 */
function stopLoops() {
  runtime.running = false;
  if (runtime.frameRequestId) window.cancelAnimationFrame(runtime.frameRequestId);
  runtime.frameRequestId = null;
  if (runtime.flushTimerId) window.clearInterval(runtime.flushTimerId);
  runtime.flushTimerId = null;
}

/**
 * Releases the camera.
 *
 * Only stopping the tracks turns the hardware indicator off. Pausing the video
 * element leaves the light on, which on this project is exactly the wrong
 * impression to give.
 *
 * @returns {void}
 */
function stopStream() {
  if (runtime.stream) {
    for (const track of runtime.stream.getTracks()) track.stop();
  }
  runtime.stream = null;
  runtime.streamStopped = true;
  if (els.video?.srcObject) els.video.srcObject = null;
}

/** Releases the object URL used by a local-video source. */
function releaseLocalVideo() {
  if (runtime.sourceObjectUrl) URL.revokeObjectURL(runtime.sourceObjectUrl);
  runtime.sourceObjectUrl = null;
}

/**
 * Requests the camera and binds it to the video element.
 *
 * @returns {Promise<void>}
 */
async function initWebcam() {
  if (!els.video) throw new Error('Missing #webcam element');

  runtime.sourceEpoch += 1;
  runtime.lastDetectionScore = null;
  runtime.lastDescriptorLength = 0;
  releaseLocalVideo();
  els.video.pause();
  els.video.removeAttribute('src');
  els.video.load();
  els.video.controls = false;
  els.video.classList.remove('source-video');
  els.video.classList.add('source-camera');

  runtime.stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user',
             width: { ideal: 1080 },
             height: { ideal: 1920 }
    },
    audio: false,
  });
  runtime.streamStopped = false;
  runtime.sourceKind = 'camera';
  els.video.srcObject = runtime.stream;
  await els.video.play();
  els.sourceState.textContent = 'camera';
  els.btnUseCamera.hidden = true;
}

/**
 * Replaces the camera with a local, seekable video. The file never leaves the
 * browser; changing source invalidates the source-specific baseline.
 *
 * @param {File} file Local video chosen by the operator.
 * @returns {Promise<void>}
 */
async function useLocalVideo(file) {
  if (!file) return;
  runtime.sourceEpoch += 1;
  runtime.lastDetectionScore = null;
  runtime.lastDescriptorLength = 0;
  stopLoops();
  stopStream();
  releaseLocalVideo();
  deleteBaseline();

  runtime.sourceKind = 'video';
  runtime.sourceObjectUrl = URL.createObjectURL(file);
  els.video.srcObject = null;
  els.video.src = runtime.sourceObjectUrl;
  els.video.controls = true;
  els.video.loop = false;
  els.video.classList.remove('source-camera');
  els.video.classList.add('source-video');
  els.sourceState.textContent = `local video · ${file.name}`;
  els.btnUseCamera.hidden = false;

  await new Promise((resolve, reject) => {
    const ready = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error('The selected video could not be decoded.'));
    };
    const cleanup = () => {
      els.video.removeEventListener('loadeddata', ready);
      els.video.removeEventListener('error', failed);
    };
    els.video.addEventListener('loadeddata', ready, { once: true });
    els.video.addEventListener('error', failed, { once: true });
    els.video.load();
  });

  startLoops();
  setStatus('Local video ready. Play or seek it, then capture a clean baseline.');
}

/** Returns from a local-video experiment to the live camera. */
async function useCameraSource() {
  stopLoops();
  deleteBaseline();
  setStatus('Connecting the camera…');
  try {
    await initWebcam();
    startLoops();
    setStatus('Camera ready. Capture a baseline to start measuring.');
  } catch (err) {
    console.error('failed to switch to camera:', err);
    setStatus('Camera unavailable. You can still open a local video.', true);
  }
}

/**
 * Loads the vendored face-api models.
 *
 * Every shard lives under /lab-js/vendor, so the page makes no third-party
 * request and runs with the network unplugged. MODEL_URLS.tiny, .landmarks and
 * .recognition all resolve to that one directory.
 *
 * @returns {Promise<void>}
 */
async function loadModels() {
  const vendorRoot = MODEL_URLS.recognition;
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(vendorRoot),
    faceapi.nets.faceLandmark68Net.loadFromUri(vendorRoot),
    faceapi.nets.faceRecognitionNet.loadFromUri(vendorRoot),
  ]);
  setStatus('Models loaded. Preparing camera…');
}

/**
 * Suspends work while the tab is hidden.
 *
 * Window blur is deliberately not the trigger: it fires when another window is
 * clicked while this tab is still on screen, which would kill the camera while
 * the person is looking straight at it.
 *
 * @returns {void}
 */
function handleHidden() {
  stopLoops();
  if (els.video) els.video.pause();
  if (runtime.hiddenStopTimerId) window.clearTimeout(runtime.hiddenStopTimerId);
  runtime.hiddenStopTimerId = window.setTimeout(stopStream, HIDDEN_STOP_DELAY_MS);
}

/**
 * Resumes work when the tab becomes visible again.
 *
 * @returns {Promise<void>}
 */
async function handleVisible() {
  if (runtime.hiddenStopTimerId) {
    window.clearTimeout(runtime.hiddenStopTimerId);
    runtime.hiddenStopTimerId = null;
  }

  try {
    if (runtime.sourceKind === 'camera' && runtime.streamStopped) {
      setStatus('Reconnecting the camera…');
      await initWebcam();
    } else if (runtime.sourceKind === 'camera' && els.video) {
      await els.video.play();
    }
    if (runtime.appState === APP_STATES.TRACKING) runtime.lastFaceAt = Date.now();
    startLoops();
    setStatus(runtime.sourceKind === 'camera' ? 'Camera live.' : 'Local video ready.');
  } catch (err) {
    console.error('failed to resume camera:', err);
    setStatus('Could not reconnect the camera.', true);
  }
}

/**
 * Fully releases every resource held by the page.
 *
 * @returns {void}
 */
function teardown() {
  stopLoops();
  stopStream();
  if (runtime.hiddenStopTimerId) window.clearTimeout(runtime.hiddenStopTimerId);
  runtime.hiddenStopTimerId = null;
  if (graph) graph.destroy();
  if (radialGraph) radialGraph.destroy();
  releaseLocalVideo();
}

/**
 * Binds interaction and lifecycle listeners.
 *
 * @returns {void}
 */
function bindListeners() {
  els.btnBaselineStart.addEventListener('click', startBaselineCapture);
  els.btnStartChange.addEventListener('click', startMakeupStep);
  els.btnMeasureChange.addEventListener('click', startStepMeasurement);
  els.btnOpenVideo.addEventListener('click', () => els.videoUpload.click());

  els.videoUpload.addEventListener('change', async () => {
    const [file] = els.videoUpload.files || [];
    if (!file) return;
    try {
      await useLocalVideo(file);
    } catch (err) {
      console.error('failed to open local video:', err);
      setStatus(err.message || 'Could not open the selected video.', true);
    } finally {
      els.videoUpload.value = '';
    }
  });
  els.btnUseCamera.addEventListener('click', useCameraSource);

  guardDestructive(els.btnBaseline, 'Delete baseline', 'Delete — sure?', deleteBaseline);
  guardDestructive(els.btnDeleteAll, 'Delete all', 'Delete all — sure?', () => gallery.deleteAll());

  els.btnShutter.addEventListener('click', captureNow);
  els.btnDownloadAll.addEventListener('click', () => gallery.downloadAll());

  els.viewerClose.addEventListener('click', () => gallery.close());
  els.viewerCopy.addEventListener('click', () => gallery.copyOpen());
  els.viewerDownload.addEventListener('click', () => gallery.downloadOpen());
  els.viewerDelete.addEventListener('click', () => gallery.deleteOpen());

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && gallery.isOpen()) gallery.close();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) handleHidden();
    else handleVisible();
  });

  window.addEventListener('pagehide', teardown);
}

/**
 * Runtime bridge for diagnostics and Playwright checks.
 *
 * @type {object}
 */
window.gstmxxRealtime = {
  /**
   * Returns a serialisable snapshot of runtime state.
   *
   * @returns {object} State snapshot.
   */
  getState() {
    const stats = graph ? graph.stats() : { samples: 0, gaps: 0, events: 0, following: true };
    return {
      appState: runtime.appState,
      hasBaseline: Boolean(runtime.baseline),
      noiseFloor: runtime.baseline ? runtime.baseline.noiseFloor : null,
      threshold: MATCH_THRESHOLD,
      graphMaxDistance: GRAPH_MAX_DISTANCE,
      windowSeconds: GRAPH_WINDOW_SECONDS,
      faceMissing: runtime.faceMissing,
      distanceBufferLength: runtime.distanceBuffer.length,
      sampleCount: stats.samples,
      gapCount: stats.gaps,
      eventCount: stats.events,
      following: stats.following,
      captureCount: gallery ? gallery.size() : 0,
      running: runtime.running,
      streamStopped: runtime.streamStopped,
      sourceKind: runtime.sourceKind,
      lastDetectionScore: runtime.lastDetectionScore,
      lastDescriptorLength: runtime.lastDescriptorLength,
      sessionPhase: runtime.sessionPhase,
      sessionStep: runtime.sessionStep,
      lastMeasurement: runtime.lastMeasurement
        ? {
            distance: runtime.lastMeasurement.distance,
            spread: runtime.lastMeasurement.spread,
            capturedAt: runtime.lastMeasurement.capturedAt,
          }
        : null,
    };
  },
  /**
   * Starts a baseline capture run without pressing UI controls.
   *
   * @returns {void}
   */
  triggerCalibration() {
    startBaselineCapture();
  },
  /** Marks the beginning of a declared makeup step. */
  startMakeupStep,
  /** Starts the temporal snapshot for the declared makeup step. */
  measureStep: startStepMeasurement,
  /**
   * Releases camera and loops.
   *
   * @returns {void}
   */
  teardown,
  /**
   * Restarts camera and loops after a teardown.
   *
   * @returns {Promise<void>}
   */
  resume: handleVisible,
};

/**
 * Initialises the visualizer and starts its loops.
 *
 * @returns {Promise<void>}
 */
export async function initRealtime() {
  if (runtime.initialized) return;
  runtime.initialized = true;

  setStatus('Loading models…');
  setTrackingState(APP_STATES.NO_BASELINE);
  initEqualizer();

  graph = createGraph({
    scrollEl: els.graphScroll,
    spacerEl: els.graphSpacer,
    canvasEl: els.graphCanvas,
    followEl: els.graphFollow,
    windowSeconds: GRAPH_WINDOW_SECONDS,
    samplesPerSecond: SAMPLES_PER_SECOND,
    maxDistance: GRAPH_MAX_DISTANCE,
    threshold: MATCH_THRESHOLD,
    onMarkerClick: (captureId) => gallery.open(captureId),
  });

  radialGraph = createRadialGraph({
    canvasEl: els.radialCanvas,
    maxDelta: MAX_DELTA,
  });

  gallery = createGallery({
    viewerEl: els.viewer,
    imageEl: els.viewerImage,
    metaEl: els.viewerMeta,
    countEl: els.galleryCount,
    onCountChange: (count) => {
      els.btnDownloadAll.disabled = count === 0;
      els.btnDeleteAll.disabled = count === 0;
    },
    onDelete: (captureId) => {
      if (captureId) graph.clearCapture(captureId);
      else graph.reset();
    },
    onStatus: (message) => setStatus(message),
  });

  createSettings({
    rootEl: els.layer,
    brightnessEl: els.brightness,
    brightnessValueEl: els.brightnessValue,
    equalizerEl: els.toggleEqualizer,
    layoutEl: els.layer,
    onLayoutChange: () => graph.resize(),
  });

  qualityGate = createQualityGate(els.video);
  baselineCollector = createBaselineCollector({
    targetSamples: BASELINE_TARGET_SAMPLES,
    minDurationMs: BASELINE_MIN_MS,
    timeoutMs: BASELINE_TIMEOUT_MS,
    maxSpread: BASELINE_MAX_SPREAD,
  });
  measurementCollector = createBaselineCollector({
    targetSamples: MEASUREMENT_TARGET_SAMPLES,
    minDurationMs: MEASUREMENT_MIN_MS,
    timeoutMs: MEASUREMENT_TIMEOUT_MS,
    maxSpread: MEASUREMENT_MAX_SPREAD,
  });
  spikeDetector = createSpikeDetector({
    sustainMs: SPIKE_SUSTAIN_MS,
    bestMargin: SPIKE_BEST_MARGIN,
    threshold: MATCH_THRESHOLD,
    cooldownMs: SPIKE_COOLDOWN_MS,
  });
  frameBuffer = createFrameBuffer(els.video, FRAME_BUFFER_SLOTS, CAPTURE_MAX_WIDTH);

  bindListeners();
  graph.resize();

  try {
    await gallery.init();
  } catch (err) {
    console.error('capture store unavailable:', err);
    setStatus('Capture storage unavailable — measurement still works.', true);
  }

  await loadModels();
  let sourceReady = false;
  try {
    await initWebcam();
    sourceReady = true;
  } catch (err) {
    runtime.streamStopped = true;
    console.error('camera unavailable:', err);
    els.sourceState.textContent = 'camera unavailable';
    setStatus('Camera unavailable. Open a local video from Source.', true);
  }

  // A stored baseline skips straight to tracking. The trace itself is not
  // restored: replaying old history and appending new samples would draw one
  // continuous line across a discontinuity that could be days wide.
  const stored = sourceReady ? loadBaseline() : null;
  if (stored) adoptBaseline(stored, true);
  else {
    syncBaselineControls();
    if (sourceReady) setStatus('Camera ready. Capture a baseline to start measuring.');
  }

  startLoops();
}

/**
 * Bootstraps the page and reports startup failures in the status pill.
 *
 * @returns {Promise<void>}
 */
async function boot() {
  try {
    await initRealtime();
  } catch (err) {
    console.error('Failed to initialize realtime visualizer:', err);
    setStatus(`Initialization failed: ${err.message || String(err)}`, true);
  }
}

boot();
