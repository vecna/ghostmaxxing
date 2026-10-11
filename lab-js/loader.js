/**
 * @module loader
 * @description
 * User-interface adapter for the seekable Video Loader. This page analyses
 * existing local videos only; live camera assistance belongs to realtime.html.
 * The model pipeline and the serialisable session live in dedicated modules so
 * Playwright can drive exactly the same behaviour as a person using the page.
 */

import { applyI18n, initI18n, setupLocaleSelect } from './i18n.js';
import { createVideoAnalysisController } from './video-loader/controller.js';
import {
   applyEditorialCommand,
   redoEditorialCommand,
   undoEditorialCommand,
} from './video-loader/session.js';

const elements = {
   file: document.getElementById('videoFile'),
   video: document.getElementById('video'),
   placeholder: document.getElementById('placeholder'),
   seek: document.getElementById('videoSeek'),
   currentTime: document.getElementById('currentTimeLabel'),
   duration: document.getElementById('durationLabel'),
   statusDot: document.getElementById('statusDot'),
   statusText: document.getElementById('statusText'),
   start: document.getElementById('startAnalysisBtn'),
   cancel: document.getElementById('cancelAnalysisBtn'),
   sampleInterval: document.getElementById('sampleInterval'),
   baselineTime: document.getElementById('baselineTime'),
   useCurrentTime: document.getElementById('useCurrentTimeBtn'),
   progress: document.getElementById('analysisProgress'),
   progressLabel: document.getElementById('analysisProgressLabel'),
   baselineSummary: document.getElementById('baselineSummary'),
   timeline: document.getElementById('analysisTimeline'),
   eventList: document.getElementById('eventList'),
   emptyReport: document.getElementById('emptyReport'),
   reportSummary: document.getElementById('reportSummary'),
   downloadReport: document.getElementById('downloadReportBtn'),
   downloadLog: document.getElementById('downloadLogBtn'),
   undo: document.getElementById('undoEditBtn'),
   redo: document.getElementById('redoEditBtn'),
};

const controller = createVideoAnalysisController(elements.video);
let pendingSourceMetadata = {};
let sourceLoaded = false;
let analysisRunning = false;

/**
 * Formats a media timestamp as `mm:ss.mmm` or `hh:mm:ss.mmm`.
 *
 * @param {number} seconds Media timestamp in seconds.
 * @returns {string} Human-readable timestamp.
 */
function formatMediaTime(seconds) {
   if (!Number.isFinite(seconds)) return '00:00.000';
   const hours = Math.floor(seconds / 3600);
   const minutes = Math.floor((seconds % 3600) / 60);
   const rest = seconds % 60;
   const prefix = hours ? `${String(hours).padStart(2, '0')}:` : '';
   return `${prefix}${String(minutes).padStart(2, '0')}:${rest.toFixed(3).padStart(6, '0')}`;
}

/**
 * Updates the visible application status.
 *
 * @param {'init'|'ready'|'working'|'error'} kind Status kind.
 * @param {string} message Human-readable status.
 * @returns {void}
 */
function setStatus(kind, message) {
   elements.statusDot.className = 'status-dot';
   if (kind === 'ready') elements.statusDot.classList.add('live');
   if (kind === 'working') elements.statusDot.classList.add('working');
   if (kind === 'error') elements.statusDot.classList.add('error');
   elements.statusText.textContent = message;
}

/**
 * Dispatches a stable browser event consumed by Playwright and optional tools.
 *
 * @param {string} type Event suffix.
 * @param {object} [detail={}] Serializable detail.
 * @returns {void}
 */
function dispatchLoaderEvent(type, detail = {}) {
   window.dispatchEvent(new CustomEvent(`gstmxx-video-loader:${type}`, { detail }));
}

/**
 * Starts a browser download without coupling the report and technical log.
 *
 * @param {string} filename Suggested filename.
 * @param {string} contents Text contents.
 * @param {string} mimeType MIME type.
 * @returns {void}
 */
function downloadText(filename, contents, mimeType) {
   const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
   const anchor = document.createElement('a');
   anchor.href = url;
   anchor.download = filename;
   anchor.click();
   window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Downloads a selected evidence frame from its data URL.
 *
 * @param {string} filename Suggested filename.
 * @param {string} dataUrl JPEG data URL.
 * @returns {void}
 */
function downloadFrame(filename, dataUrl) {
   const anchor = document.createElement('a');
   anchor.href = dataUrl;
   anchor.download = filename;
   anchor.click();
}

/**
 * Synchronises video labels and the manual seek control.
 *
 * @returns {void}
 */
function syncVideoTimeline() {
   const duration = Number.isFinite(elements.video.duration) ? elements.video.duration : 0;
   elements.currentTime.textContent = formatMediaTime(elements.video.currentTime);
   elements.duration.textContent = formatMediaTime(duration);
   elements.seek.max = String(duration);
   if (!elements.seek.matches(':active')) elements.seek.value = String(elements.video.currentTime || 0);
}

/**
 * Draws three separate evidence lanes: MediaPipe presence, ImageEmbedder drift,
 * and sparse face-api distances. Values from different models are never
 * merged into one scale.
 *
 * @param {object|null} session Current analysis session.
 * @returns {void}
 */
function drawTimeline(session) {
   const canvas = elements.timeline;
   const context = canvas.getContext('2d');
   if (!context || typeof context.setTransform !== 'function') return;
   const cssWidth = Math.max(320, canvas.clientWidth || 960);
   const cssHeight = 210;
   const ratio = window.devicePixelRatio || 1;
   canvas.width = Math.round(cssWidth * ratio);
   canvas.height = Math.round(cssHeight * ratio);
   context.setTransform(ratio, 0, 0, ratio, 0, 0);
   context.clearRect(0, 0, cssWidth, cssHeight);
   context.fillStyle = '#17130f';
   context.fillRect(0, 0, cssWidth, cssHeight);

   const left = 112;
   const right = 14;
   const plotWidth = cssWidth - left - right;
   const duration = session?.source?.duration || 1;
   const x = (mediaTime) => left + (mediaTime / duration) * plotWidth;
   const lanes = {
      presence: { top: 18, height: 34, label: 'MediaPipe face' },
      drift: { top: 74, height: 50, label: 'Visual drift' },
      face: { top: 146, height: 48, label: 'face-api L2' },
   };

   context.font = '700 11px ui-monospace, monospace';
   context.textBaseline = 'middle';
   for (const lane of Object.values(lanes)) {
      context.fillStyle = '#b8aa96';
      context.fillText(lane.label, 10, lane.top + lane.height / 2);
      context.strokeStyle = 'rgba(255, 231, 168, 0.12)';
      context.strokeRect(left, lane.top, plotWidth, lane.height);
   }
   if (!session?.samples?.length) return;
   const timelineSamples = session.samples
      .filter((sample) => sample.phase !== 'baseline')
      .sort((leftSample, rightSample) => leftSample.mediaTime - rightSample.mediaTime);
   if (!timelineSamples.length) return;

   const threshold = session.baseline?.visualTriggerThreshold || 0.1;
   const driftMax = Math.max(0.1, threshold * 3, ...timelineSamples.map((sample) => sample.visualDrift || 0));
   context.lineWidth = 2;
   context.strokeStyle = '#7fe3b0';
   context.beginPath();
   timelineSamples.forEach((sample, index) => {
      const px = x(sample.mediaTime);
      const py = lanes.presence.top + (sample.facePresent ? 7 : lanes.presence.height - 7);
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
   });
   context.stroke();

   context.strokeStyle = '#f3c747';
   context.beginPath();
   let started = false;
   for (const sample of timelineSamples) {
      if (sample.visualDrift === null) {
         started = false;
         continue;
      }
      const px = x(sample.mediaTime);
      const py = lanes.drift.top + lanes.drift.height - (sample.visualDrift / driftMax) * lanes.drift.height;
      if (!started) context.moveTo(px, py);
      else context.lineTo(px, py);
      started = true;
   }
   context.stroke();

   if (session.baseline) {
      const thresholdY = lanes.drift.top + lanes.drift.height
         - (session.baseline.visualTriggerThreshold / driftMax) * lanes.drift.height;
      context.strokeStyle = 'rgba(243, 199, 71, 0.65)';
      context.setLineDash([4, 4]);
      context.beginPath();
      context.moveTo(left, thresholdY);
      context.lineTo(left + plotWidth, thresholdY);
      context.stroke();
      context.setLineDash([]);
   }

   const faceApiEntries = session.journal.filter((entry) => entry.type === 'face-api-result');
   context.fillStyle = '#ff8e72';
   for (const entry of faceApiEntries) {
      const value = entry.faceDistance === null ? 0.8 : Math.min(1, entry.faceDistance);
      const px = x(entry.mediaTime);
      const py = lanes.face.top + lanes.face.height - value * lanes.face.height;
      context.beginPath();
      context.arc(px, py, 3.5, 0, Math.PI * 2);
      context.fill();
   }
   const faceThresholdY = lanes.face.top + lanes.face.height - 0.6 * lanes.face.height;
   context.strokeStyle = 'rgba(255, 142, 114, 0.7)';
   context.setLineDash([4, 4]);
   context.beginPath();
   context.moveTo(left, faceThresholdY);
   context.lineTo(left + plotWidth, faceThresholdY);
   context.stroke();
   context.setLineDash([]);
}

/**
 * Builds one editable evidence card.
 *
 * @param {object} event Session evidence event.
 * @param {object} session Current session.
 * @returns {HTMLElement} Event card.
 */
function createEventCard(event, session) {
   const card = document.createElement('article');
   card.className = `loader-event loader-event--${event.status}`;
   card.dataset.eventId = event.id;

   if (event.selectedFrame) {
      const image = document.createElement('img');
      image.src = event.selectedFrame.dataUrl;
      image.alt = `Selected video frame at ${formatMediaTime(event.selectedFrame.mediaTime)}`;
      card.appendChild(image);
   }

   const body = document.createElement('div');
   body.className = 'loader-event__body';
   const title = document.createElement('h3');
   const eventLabel = event.classification === 'identity-distance'
      ? 'Identity-distance transition'
      : event.classification === 'detector-divergence'
         ? 'Detector divergence — review'
         : event.status === 'confirmed' ? 'Mixed transition — review' : 'Candidate';
   title.textContent = `${eventLabel} · ${formatMediaTime(event.anchorMediaTime)}`;
   body.appendChild(title);

   const best = event.observations.at(-1);
   const metrics = document.createElement('p');
   metrics.className = 'loader-event__metrics';
   metrics.textContent = [
      best?.faceDistance === null ? 'face-api: no face' : `face-api: ${best?.faceDistance?.toFixed(4) ?? 'n/a'}`,
      best?.visualDrift === null ? 'visual drift: n/a' : `visual drift: ${best.visualDrift.toFixed(4)}`,
   ].join(' · ');
   body.appendChild(metrics);

   const reasons = document.createElement('p');
   reasons.className = 'loader-event__reasons';
   reasons.textContent = `Trigger: ${(best?.reasons || []).join(', ') || 'verification'}`;
   body.appendChild(reasons);

   const caption = document.createElement('textarea');
   caption.value = event.caption;
   caption.placeholder = 'Explain why this before/after moment matters…';
   caption.setAttribute('aria-label', 'Event caption');
   caption.addEventListener('change', () => {
      applyEditorialCommand(session, { type: 'caption', eventId: event.id, value: caption.value });
      renderSession(session);
   });
   body.appendChild(caption);

   const actions = document.createElement('div');
   actions.className = 'loader-event__actions';
   appendStoryOrderButtons(actions, event.id, session);
   const promote = document.createElement('button');
   promote.type = 'button';
   promote.textContent = event.promoted ? 'Selected for story' : 'Select for story';
   promote.disabled = event.promoted;
   promote.addEventListener('click', () => {
      applyEditorialCommand(session, { type: 'promote', eventId: event.id });
      renderSession(session);
   });
   actions.appendChild(promote);

   const reject = document.createElement('button');
   reject.type = 'button';
   reject.textContent = 'Reject';
   reject.addEventListener('click', () => {
      applyEditorialCommand(session, { type: 'reject', eventId: event.id });
      renderSession(session);
   });
   actions.appendChild(reject);

   if (event.selectedFrame) {
      const save = document.createElement('button');
      save.type = 'button';
      save.textContent = 'Download frame';
      save.addEventListener('click', () => downloadFrame(
         `ghostmaxxing-${formatMediaTime(event.selectedFrame.mediaTime).replaceAll(':', '-')}.jpg`,
         event.selectedFrame.dataUrl,
      ));
      actions.appendChild(save);
   }
   body.appendChild(actions);
   card.appendChild(body);
   return card;
}

/**
 * Returns report items in human-controlled story order. Source timestamps are
 * never changed by an editorial move.
 *
 * @param {object} session Current session.
 * @returns {Array<{id: string, kind: 'baseline'|'event', value: object}>} Ordered items.
 */
function orderedStoryItems(session) {
   if (!session) return [];
   const events = new Map(session.events
      .filter((event) => event.status === 'confirmed')
      .map((event) => [event.id, event]));
   const ordered = [];
   for (const id of session.editorial.storyOrder) {
      if (id === 'baseline' && session.baseline) {
         ordered.push({ id, kind: 'baseline', value: session.baseline });
      } else if (events.has(id)) {
         ordered.push({ id, kind: 'event', value: events.get(id) });
         events.delete(id);
      }
   }
   for (const event of events.values()) ordered.push({ id: event.id, kind: 'event', value: event });
   return ordered;
}

/**
 * Adds reversible story-order controls to one evidence card.
 *
 * @param {HTMLElement} actions Action container.
 * @param {string} itemId Event identifier or the reserved baseline identifier.
 * @param {object} session Current session.
 * @returns {void}
 */
function appendStoryOrderButtons(actions, itemId, session) {
   const order = orderedStoryItems(session).map((item) => item.id);
   const index = order.indexOf(itemId);
   const earlier = document.createElement('button');
   earlier.type = 'button';
   earlier.textContent = 'Move earlier';
   earlier.disabled = index <= 0;
   earlier.addEventListener('click', () => {
      applyEditorialCommand(session, { type: 'move-earlier', eventId: itemId });
      renderSession(session);
   });
   actions.appendChild(earlier);

   const later = document.createElement('button');
   later.type = 'button';
   later.textContent = 'Move later';
   later.disabled = index < 0 || index >= order.length - 1;
   later.addEventListener('click', () => {
      applyEditorialCommand(session, { type: 'move-later', eventId: itemId });
      renderSession(session);
   });
   actions.appendChild(later);
}

/**
 * Builds the computational reference as a reorderable story item. Its source
 * timestamp and role in the distance calculation remain unchanged.
 *
 * @param {object} baseline Session baseline.
 * @param {object} session Current session.
 * @returns {HTMLElement} Reference card.
 */
function createBaselineCard(baseline, session) {
   const card = document.createElement('article');
   card.className = 'loader-event loader-event--reference';
   card.dataset.eventId = 'baseline';

   if (baseline.frame) {
      const image = document.createElement('img');
      image.src = baseline.frame.dataUrl;
      image.alt = `Computational reference frame at ${formatMediaTime(baseline.mediaTime)}`;
      card.appendChild(image);
   }

   const body = document.createElement('div');
   body.className = 'loader-event__body';
   const title = document.createElement('h3');
   title.textContent = `Computational reference · ${formatMediaTime(baseline.mediaTime)}`;
   body.appendChild(title);

   const metrics = document.createElement('p');
   metrics.className = 'loader-event__metrics';
   metrics.textContent = `visual trigger ${baseline.visualTriggerThreshold.toFixed(4)} · face noise ${baseline.faceSpread.toFixed(4)}`;
   body.appendChild(metrics);

   const explanation = document.createElement('p');
   explanation.className = 'loader-event__reasons';
   explanation.textContent = 'This frame anchors the distances. Move its story position without changing its source timestamp or computational role.';
   body.appendChild(explanation);

   const actions = document.createElement('div');
   actions.className = 'loader-event__actions';
   appendStoryOrderButtons(actions, 'baseline', session);
   const save = document.createElement('button');
   save.type = 'button';
   save.textContent = 'Download frame';
   save.addEventListener('click', () => downloadFrame(
      `ghostmaxxing-reference-${formatMediaTime(baseline.mediaTime).replaceAll(':', '-')}.jpg`,
      baseline.frame.dataUrl,
   ));
   actions.appendChild(save);
   body.appendChild(actions);
   card.appendChild(body);
   return card;
}

/**
 * Re-renders report summary, timeline, and evidence cards from session state.
 *
 * @param {object|null} session Current analysis session.
 * @returns {void}
 */
function renderSession(session) {
   drawTimeline(session);
   elements.eventList.replaceChildren();
   const storyItems = orderedStoryItems(session);
   elements.emptyReport.hidden = storyItems.length > 0;
   for (const item of storyItems) {
      elements.eventList.appendChild(item.kind === 'baseline'
         ? createBaselineCard(item.value, session)
         : createEventCard(item.value, session));
   }

   if (session?.baseline) {
      elements.baselineSummary.textContent = [
         `Reference ${formatMediaTime(session.baseline.mediaTime)}`,
         `visual trigger ${session.baseline.visualTriggerThreshold.toFixed(4)}`,
         `face noise ${session.baseline.faceSpread.toFixed(4)}`,
      ].join(' · ');
   } else {
      elements.baselineSummary.textContent = 'Distance reference not acquired yet.';
   }

   if (session) {
      elements.reportSummary.textContent = [
         `${session.summary.sampledFrames} samples`,
         `${session.summary.faceApiRuns} face-api checks`,
         `${session.summary.confirmedEvents} confirmed events`,
      ].join(' · ');
      elements.downloadReport.disabled = session.status !== 'complete';
      elements.downloadLog.disabled = session.samples.length === 0;
      elements.undo.disabled = session.editorial.undo.length === 0;
      elements.redo.disabled = session.editorial.redo.length === 0;
   }
}

/**
 * Updates controls after model, file, and analysis state changes.
 *
 * @returns {void}
 */
function syncControls() {
   elements.start.disabled = !sourceLoaded || !controller.isModelsReady() || analysisRunning;
   elements.cancel.disabled = !analysisRunning;
   elements.file.disabled = analysisRunning;
   elements.sampleInterval.disabled = analysisRunning;
   elements.baselineTime.disabled = analysisRunning;
   elements.useCurrentTime.disabled = !sourceLoaded || analysisRunning;
}

/**
 * Loads the file currently selected in the input.
 *
 * @returns {Promise<object|null>} Loaded session, or null when no file exists.
 */
async function loadSelectedFile() {
   const file = elements.file.files?.[0];
   if (!file) return null;
   setStatus('working', 'loading video');
   const session = await controller.loadFile(file, pendingSourceMetadata);
   pendingSourceMetadata = {};
   sourceLoaded = true;
   elements.placeholder.hidden = true;
   elements.seek.disabled = false;
   syncVideoTimeline();
   renderSession(session);
   setStatus('ready', 'ready to analyse');
   syncControls();
   dispatchLoaderEvent('source-loaded', { source: session.source });
   return session;
}

/**
 * Runs analysis using the currently selected sampling interval.
 *
 * @param {object} [options] Optional API-provided range and cadence overrides.
 * @returns {Promise<object>} Completed session.
 */
async function startAnalysis(options = {}) {
   analysisRunning = true;
   syncControls();
   setStatus('working', 'analysing video');
   elements.progress.value = 0;
   elements.progressLabel.textContent = '0%';
   try {
      const session = await controller.analyze({
         sampleIntervalSeconds: Number(options.sampleIntervalSeconds ?? elements.sampleInterval.value),
         baselineTime: Number(options.baselineTime ?? elements.baselineTime.value),
         start: options.start,
         end: options.end,
      });
      renderSession(session);
      setStatus(session.status === 'complete' ? 'ready' : 'init', session.status);
      return session;
   } catch (error) {
      setStatus('error', error.message || String(error));
      dispatchLoaderEvent('error', { message: error.message || String(error) });
      throw error;
   } finally {
      analysisRunning = false;
      syncControls();
   }
}

controller.subscribe((update) => {
   if (update.type === 'models-ready') {
      setStatus(sourceLoaded ? 'ready' : 'init', sourceLoaded ? 'ready to analyse' : 'select a local video');
      syncControls();
      dispatchLoaderEvent('models-ready');
      return;
   }
   if (update.type === 'sample') {
      const percentage = Math.max(0, Math.min(100, Math.round(update.progress * 100)));
      elements.progress.value = percentage;
      elements.progressLabel.textContent = `${percentage}%`;
      renderSession(update.session);
   }
   if (update.type === 'baseline-ready' || update.type === 'event-confirmed') renderSession(update.session);
   dispatchLoaderEvent(update.type, {
      progress: update.progress,
      eventId: update.event?.id,
   });
});

elements.file.addEventListener('change', () => {
   loadSelectedFile().catch((error) => setStatus('error', error.message || String(error)));
});
elements.video.addEventListener('timeupdate', syncVideoTimeline);
elements.video.addEventListener('seeked', syncVideoTimeline);
elements.video.addEventListener('loadedmetadata', syncVideoTimeline);
elements.seek.addEventListener('input', () => {
   elements.video.currentTime = Number(elements.seek.value) || 0;
   syncVideoTimeline();
});
elements.useCurrentTime.addEventListener('click', () => {
   elements.baselineTime.value = elements.video.currentTime.toFixed(3);
});
elements.start.addEventListener('click', () => startAnalysis().catch(() => {}));
elements.cancel.addEventListener('click', () => controller.cancel());
elements.undo.addEventListener('click', () => {
   const session = controller.getSession();
   if (session && undoEditorialCommand(session)) renderSession(session);
});
elements.redo.addEventListener('click', () => {
   const session = controller.getSession();
   if (session && redoEditorialCommand(session)) renderSession(session);
});
elements.downloadReport.addEventListener('click', () => {
   const bundle = controller.exportBundle();
   downloadText('ghostmaxxing-video-report.json', JSON.stringify(bundle.report, null, 2), 'application/json');
});
elements.downloadLog.addEventListener('click', () => {
   const bundle = controller.exportBundle();
   downloadText('ghostmaxxing-analysis.ndjson', bundle.technicalLog, 'application/x-ndjson');
});

/**
 * Stable automation API shared by the UI and the Playwright CLI.
 *
 * @type {object}
 */
window.gstmxxVideoLoader = {
   /** @returns {boolean} Whether vendored models are ready. */
   isModelsReady: () => controller.isModelsReady(),
   /** @returns {boolean} Whether a source has loaded metadata. */
   isSourceLoaded: () => sourceLoaded,
   /** @returns {boolean} Whether an analysis is in progress. */
   isAnalysisRunning: () => analysisRunning,
   /** @returns {object|null} Current mutable session for diagnostic automation. */
   getSession: () => controller.getSession(),
   /** @returns {object} Report, technical log, and selected frame artifacts. */
   exportBundle: () => controller.exportBundle(),
   /** @param {object} metadata Source provenance supplied before setInputFiles(). */
   setSourceMetadata(metadata) { pendingSourceMetadata = { ...metadata }; },
   /** @param {object} options Analysis range and cadence. */
   analyze: (options = {}) => startAnalysis(options),
   /** @returns {void} Requests cancellation at the next sample boundary. */
   cancel: () => controller.cancel(),
};

/**
 * Initialises localisation and model loading without requesting a camera.
 *
 * @returns {Promise<void>} Resolves after model loading succeeds or fails.
 */
async function init() {
   initI18n();
   setupLocaleSelect(document.getElementById('localeSelect'), applyI18n);
   applyI18n();
   renderSession(null);
   syncControls();
   setStatus('init', 'loading models');
   try {
      await controller.loadModels();
   } catch (error) {
      setStatus('error', `model loading failed: ${error.message || String(error)}`);
      dispatchLoaderEvent('error', { message: error.message || String(error) });
   }
}

init();
