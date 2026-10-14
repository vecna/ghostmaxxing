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
   viewer: document.getElementById('viewer'),
   viewerLock: document.getElementById('analysisLockNotice'),
   sourceControls: document.querySelector('.loader-source-controls'),
   analysisSettings: document.getElementById('analysisSettings'),
   sourceFileAction: document.getElementById('sourceFileAction'),
   sourceFileName: document.getElementById('sourceFileName'),
   sourceFileMeta: document.getElementById('sourceFileMeta'),
   placeholder: document.getElementById('placeholder'),
   seek: document.getElementById('videoSeek'),
   currentTime: document.getElementById('currentTimeLabel'),
   duration: document.getElementById('durationLabel'),
   statusDot: document.getElementById('statusDot'),
   statusText: document.getElementById('statusText'),
   start: document.getElementById('startAnalysisBtn'),
   cancel: document.getElementById('cancelAnalysisBtn'),
   sampleInterval: document.getElementById('sampleInterval'),
   selectBase: document.getElementById('selectBaseBtn'),
   selectedBaseLabel: document.getElementById('selectedBaseLabel'),
   analyzeFrame: document.getElementById('analyzeFrameBtn'),
   progress: document.getElementById('analysisProgress'),
   progressLabel: document.getElementById('analysisProgressLabel'),
   analysisMessage: document.getElementById('analysisMessage'),
   analysisMessageTitle: document.getElementById('analysisMessageTitle'),
   analysisMessageBody: document.getElementById('analysisMessageBody'),
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
let selectedBaseTime = null;
let lastProgressState = { scanSampleIndex: 0, scanSampleTotal: null, mediaTime: null };

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
 * Formats source byte size for the compact file identity line.
 *
 * @param {number} bytes Source file size.
 * @returns {string} Human-readable binary size.
 */
function formatFileSize(bytes) {
   if (!Number.isFinite(bytes) || bytes < 0) return 'unknown size';
   const units = ['B', 'KiB', 'MiB', 'GiB'];
   let value = bytes;
   let unitIndex = 0;
   while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
   }
   return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Shows or clears the persistent analysis notice beside the run controls.
 *
 * @param {'error'|'success'|null} kind Notice kind, or null to clear it.
 * @param {string} [title] Short notice heading.
 * @param {string} [body] Actionable explanation.
 * @returns {void}
 */
function renderAnalysisMessage(kind, title = '', body = '') {
   elements.analysisMessage.hidden = kind === null;
   if (kind === null) {
      elements.analysisMessage.removeAttribute('data-kind');
      elements.analysisMessageTitle.textContent = '';
      elements.analysisMessageBody.textContent = '';
      return;
   }
   elements.analysisMessage.dataset.kind = kind;
   elements.analysisMessageTitle.textContent = title;
   elements.analysisMessageBody.textContent = body;
}

/**
 * Converts a stable controller failure reason into baseline guidance that can
 * be understood without reading the technical log.
 *
 * @param {object} update Controller failure update.
 * @returns {{title: string, body: string}} Visible baseline diagnostic.
 */
function baselineFailureCopy(update) {
   const time = formatMediaTime(update.baselineTime);
   if (update.reason === 'selected-frame-neighbours-insufficient') {
      const windowSeconds = Math.max(0, update.baselineSearchEnd - update.baselineTime).toFixed(1);
      return {
         title: `Baseline not created at ${time}`,
         body: `The selected frame may be usable, but only ${update.acceptedEmbeddings} of ${update.requiredEmbeddings} comparable nearby frames were found within ${windowSeconds} seconds. Rapid pose, hand, crop, or makeup changes prevented stable local calibration. Select a steadier moment and retry. Makeup already being present is not itself an error.`,
      };
   }
   if (update.reason === 'selected-frame-is-not-comparable') {
      return {
         title: `Baseline frame is not comparable at ${time}`,
         body: 'MediaPipe could not produce a usable aligned face crop. Select a frame with the complete face visible, sufficiently large, evenly exposed, and closer to a frontal pose.',
      };
   }
   if (update.reason === 'face-api-could-not-describe-the-selected-frame') {
      return {
         title: `No face-api reference at ${time}`,
         body: 'MediaPipe found usable face geometry, but face-api could not create a descriptor for the selected frame. Select a clearer frame with less occlusion or motion and retry.',
      };
   }
   if (update.reason === 'selected-frame-descriptors-insufficient') {
      return {
         title: `Not enough face-api references near ${time}`,
         body: `MediaPipe calibration succeeded, but only ${update.acceptedDescriptors} of ${update.requiredDescriptors} nearby frames returned a face-api descriptor. The selected frame may be usable; choose an interval with a clearer, less occluded face and retry.`,
      };
   }
   if (update.reason === 'selected-frame-descriptors-are-not-stable') {
      return {
         title: `Baseline readings are unstable at ${time}`,
         body: 'Nearby face-api descriptors varied too much to define one trustworthy reference. Select a steadier interval and retry.',
      };
   }
   return {
      title: `Baseline not created at ${time}`,
      body: 'The selected point did not provide enough stable, comparable face observations. Choose a clearer and steadier moment; the technical log retains the precise rejection reasons.',
   };
}

/**
 * Seeks the source player from report evidence when analysis is idle. During
 * analysis the controller owns media time, so evidence links remain disabled.
 *
 * @param {number} mediaTime Source timestamp.
 * @returns {void}
 */
function seekToMediaTime(mediaTime) {
   if (analysisRunning || !sourceLoaded) return;
   elements.video.pause();
   elements.video.currentTime = Math.max(0, Math.min(elements.video.duration || mediaTime, mediaTime));
   syncVideoTimeline();
}

/**
 * Creates a timestamp that acts as a source-video seek control.
 *
 * @param {number} mediaTime Source timestamp.
 * @param {string} [extraClass] Optional presentation class.
 * @returns {HTMLButtonElement} Clickable media-time control.
 */
function createMediaTimeButton(mediaTime, extraClass = '') {
   const button = document.createElement('button');
   button.type = 'button';
   button.className = `loader-time-link ${extraClass}`.trim();
   button.dataset.mediaTime = String(mediaTime);
   button.textContent = formatMediaTime(mediaTime);
   button.setAttribute('aria-label', `Show source video at ${formatMediaTime(mediaTime)}`);
   button.disabled = analysisRunning;
   button.addEventListener('click', () => seekToMediaTime(mediaTime));
   return button;
}

/**
 * Renders baseline calibration or scan-sample progress without pretending
 * that browser media time is a reliable encoded-frame number.
 *
 * @param {object} update Controller update.
 * @returns {void}
 */
function renderAnalysisProgress(update) {
   if (update.phase === 'baseline') {
      const accepted = update.baselineAcceptedSamples ?? 0;
      const required = update.baselineRequiredSamples ?? 0;
      const acceptedDescriptors = update.baselineAcceptedDescriptors ?? 0;
      const requiredDescriptors = update.baselineRequiredDescriptors ?? 0;
      const descriptorStage = required > 0 && accepted >= required;
      elements.progress.max = Math.max(1, descriptorStage ? requiredDescriptors : required);
      elements.progress.value = descriptorStage ? acceptedDescriptors : Math.min(accepted, required);
      elements.progressLabel.textContent = descriptorStage
         ? `baseline face-api ${acceptedDescriptors} / ${requiredDescriptors}`
         : `baseline MediaPipe ${accepted} / ${required}`;
      return;
   }

   const index = update.scanSampleIndex ?? lastProgressState.scanSampleIndex;
   const total = update.scanSampleTotal ?? lastProgressState.scanSampleTotal;
   const mediaTime = update.mediaTime ?? update.sample?.mediaTime ?? lastProgressState.mediaTime;
   lastProgressState = { scanSampleIndex: index, scanSampleTotal: total, mediaTime };
   elements.progress.max = Math.max(1, total || 1);
   elements.progress.value = Math.min(index, total || index);
   const percentage = Math.max(0, Math.min(100, Math.round((update.progress ?? 0) * 100)));
   const count = total ? `${index} / ${total} samples` : `${index} samples`;
   if (update.type === 'analysis-cancelled') {
      elements.progressLabel.textContent = `${count} · paused at ${formatMediaTime(mediaTime)}`;
   } else if (update.type === 'analysis-complete') {
      elements.progressLabel.textContent = `${count} · complete`;
   } else {
      elements.progressLabel.textContent = `${count} · ${percentage}%`;
   }
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
   elements.analyzeFrame.textContent = `Analyse frame at ${formatMediaTime(elements.video.currentTime || 0)}`;
   renderBaseSelection();
}

/**
 * Shows the current scrub position as an explicit baseline action and keeps
 * the already selected reference visible while the person reviews the video.
 *
 * @returns {void}
 */
function renderBaseSelection() {
   const currentTime = Number(elements.video.currentTime) || 0;
   const currentLabel = formatMediaTime(currentTime);
   if (selectedBaseTime === null) {
      elements.selectBase.textContent = `Select base at ${currentLabel}`;
      elements.selectedBaseLabel.textContent = 'No base selected. Scrub the video, then select the displayed frame.';
      return;
   }

   const selectedLabel = formatMediaTime(selectedBaseTime);
   const isAtSelectedFrame = Math.abs(currentTime - selectedBaseTime) < 0.001;
   elements.selectBase.textContent = isAtSelectedFrame
      ? `Base selected at ${selectedLabel}`
      : `Replace base with ${currentLabel}`;
   elements.selectedBaseLabel.textContent = `Distance reference selected at ${selectedLabel}. It will be the first evidence-story entry.`;
}

/**
 * Selects the currently displayed video position as the exact computational
 * and visual baseline. Nearby frames may calibrate noise but cannot replace
 * the selected source timestamp.
 *
 * @returns {void}
 */
function selectCurrentBase() {
   selectedBaseTime = Number(elements.video.currentTime) || 0;
   renderAnalysisMessage(null);
   renderBaseSelection();
   syncControls();
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

   const left = 150;
   const right = 14;
   const plotWidth = cssWidth - left - right;
   const rangeStart = session?.config?.analysisRange?.start ?? 0;
   const rangeEnd = session?.config?.analysisRange?.end ?? session?.source?.duration ?? 1;
   const duration = Math.max(0.001, rangeEnd - rangeStart);
   const x = (mediaTime) => left + ((mediaTime - rangeStart) / duration) * plotWidth;
   const lanes = {
      presence: { top: 18, height: 34, label: 'MediaPipe coverage' },
      drift: { top: 74, height: 50, label: 'ImageEmbedder drift' },
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
      const py = lanes.presence.top + (sample.comparable
         ? 7
         : sample.facePresent ? lanes.presence.height / 2 : lanes.presence.height - 7);
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
   });
   context.stroke();
   for (const sample of timelineSamples) {
      context.fillStyle = sample.comparable ? '#7fe3b0' : sample.facePresent ? '#f3c747' : '#756b60';
      const py = lanes.presence.top + (sample.comparable
         ? 7
         : sample.facePresent ? lanes.presence.height / 2 : lanes.presence.height - 7);
      context.beginPath();
      context.arc(x(sample.mediaTime), py, 2.25, 0, Math.PI * 2);
      context.fill();
   }

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
      context.fillStyle = '#d8c9b5';
      context.font = '700 9px ui-monospace, monospace';
      context.textAlign = 'right';
      context.fillText(
         `trigger ${session.baseline.visualTriggerThreshold.toFixed(4)}`,
         left + plotWidth - 6,
         thresholdY - 7,
      );
      context.textAlign = 'left';
   }

   const faceApiEntries = session.journal.filter((entry) => entry.type === 'face-api-result');
   const numericFaceDistances = faceApiEntries
      .map((entry) => entry.faceDistance)
      .filter(Number.isFinite);
   const faceThreshold = session.config?.faceDistanceThreshold ?? 0.6;
   const faceMax = Math.max(0.8, faceThreshold * 1.25, ...numericFaceDistances.map((value) => value * 1.1));
   context.fillStyle = '#ff8e72';
   for (const entry of faceApiEntries) {
      const px = x(entry.mediaTime);
      if (Number.isFinite(entry.faceDistance)) {
         const py = lanes.face.top + lanes.face.height - (entry.faceDistance / faceMax) * lanes.face.height;
         context.beginPath();
         context.arc(px, py, 3.5, 0, Math.PI * 2);
         context.fill();
      } else {
         const py = lanes.face.top + 7;
         context.strokeStyle = '#ff8e72';
         context.lineWidth = 1.6;
         context.beginPath();
         context.moveTo(px - 3, py - 3);
         context.lineTo(px + 3, py + 3);
         context.moveTo(px + 3, py - 3);
         context.lineTo(px - 3, py + 3);
         context.stroke();
      }
   }
   const faceThresholdY = lanes.face.top + lanes.face.height - (faceThreshold / faceMax) * lanes.face.height;
   context.strokeStyle = 'rgba(255, 142, 114, 0.7)';
   context.setLineDash([4, 4]);
   context.beginPath();
   context.moveTo(left, faceThresholdY);
   context.lineTo(left + plotWidth, faceThresholdY);
   context.stroke();
   context.setLineDash([]);
   context.fillStyle = '#d8c9b5';
   context.font = '700 9px ui-monospace, monospace';
   context.textAlign = 'right';
   context.fillText('× no 2D face', left + plotWidth - 6, faceThresholdY - 7);
   context.fillText(`threshold ${faceThreshold.toFixed(4)}`, left + plotWidth - 6, faceThresholdY + 12);
   context.textAlign = 'left';
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
   card.className = [
      'loader-event',
      `loader-event--${event.status}`,
      event.origin === 'manual' ? 'loader-event--manual' : '',
   ].filter(Boolean).join(' ');
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
   const eventLabel = event.classification === 'manual-frame-check'
      ? 'Manual frame check'
      : event.classification === 'identity-distance'
      ? 'Identity-distance transition'
      : event.classification === 'detector-divergence'
         ? 'Detector divergence — review'
         : event.status === 'confirmed' ? 'Mixed transition — review' : 'Candidate';
   title.append(`${eventLabel} · `, createMediaTimeButton(event.anchorMediaTime));
   body.appendChild(title);

   const best = event.observations.at(-1);
   const metrics = document.createElement('p');
   metrics.className = 'loader-event__metrics';
   metrics.textContent = [
      best?.faceDistance === null ? 'face-api: no face' : `face-api: ${best?.faceDistance?.toFixed(4) ?? 'n/a'}`,
      best?.visualDrift === null ? 'ImageEmbedder drift: n/a' : `ImageEmbedder drift: ${best.visualDrift.toFixed(4)}`,
   ].join(' · ');
   body.appendChild(metrics);

   const reasons = document.createElement('p');
   reasons.className = 'loader-event__reasons';
   reasons.textContent = event.origin === 'manual'
      ? 'Requested manually from the source position. This is one explicit check, not a repeated automatic transition.'
      : `Trigger: ${(best?.reasons || []).join(', ') || 'verification'}`;
   body.appendChild(reasons);

   if (event.origin === 'manual') {
      const interpretation = document.createElement('p');
      interpretation.className = 'loader-event__warning';
      interpretation.textContent = event.interpretation === 'above-threshold'
         ? `The face-api distance is at or above the ${(best?.faceThreshold ?? 0.6).toFixed(4)} threshold.`
         : event.interpretation === 'below-threshold'
            ? `The face-api distance is below the ${(best?.faceThreshold ?? 0.6).toFixed(4)} threshold.`
            : event.interpretation === 'no-2d-face'
               ? 'MediaPipe retained a comparable crop, but face-api returned no 2D face.'
               : 'This frame did not meet MediaPipe comparability limits; any face-api value is shown only as diagnostic context.';
      body.appendChild(interpretation);
   }

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
 * @param {string} itemId Event identifier.
 * @param {object} session Current session.
 * @returns {void}
 */
function appendStoryOrderButtons(actions, itemId, session) {
   const order = orderedStoryItems(session).map((item) => item.id);
   const index = order.indexOf(itemId);
   const earlier = document.createElement('button');
   earlier.type = 'button';
   earlier.textContent = 'Move earlier';
   earlier.disabled = index <= 0 || order[index - 1] === 'baseline';
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
 * Builds the pinned computational reference as the first story item. Its
 * source timestamp and role in the distance calculation remain unchanged.
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
   title.append('Baseline · distance reference · ', createMediaTimeButton(baseline.mediaTime));
   body.appendChild(title);

   const metrics = document.createElement('p');
   metrics.className = 'loader-event__metrics';
   metrics.textContent = [
      `ImageEmbedder trigger ${baseline.visualTriggerThreshold.toFixed(4)}`,
      `face-api baseline spread ${baseline.faceSpread.toFixed(4)}`,
      `face-api decision threshold ${(session.config?.faceDistanceThreshold ?? 0.6).toFixed(4)}`,
   ].join(' · ');
   body.appendChild(metrics);

   const explanation = document.createElement('p');
   explanation.className = 'loader-event__reasons';
   explanation.textContent = 'This frame anchors the distances and remains the first story entry. Its source timestamp and computational role never change.';
   body.appendChild(explanation);

   if (baseline.faceSpread > (session.config?.maximumBaselineFaceSpread ?? 0.3)) {
      const warning = document.createElement('p');
      warning.className = 'loader-event__warning';
      warning.textContent = 'The selected baseline has elevated face-api variation. Treat distances near the decision threshold as review evidence.';
      body.appendChild(warning);
   }

   const actions = document.createElement('div');
   actions.className = 'loader-event__actions';
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
      elements.baselineSummary.replaceChildren(
         document.createTextNode('Reference '),
         createMediaTimeButton(session.baseline.mediaTime, 'loader-time-link--summary'),
         document.createTextNode([
            ` · visual trigger ${session.baseline.visualTriggerThreshold.toFixed(4)}`,
            `face noise ${session.baseline.faceSpread.toFixed(4)}`,
         ].join(' · ')),
      );
   } else {
      elements.baselineSummary.textContent = 'Distance reference not acquired yet.';
   }

   if (session) {
      elements.reportSummary.textContent = [
         `${session.summary.sampledFrames} samples`,
         `${session.summary.faceApiRuns} face-api checks`,
         `${session.summary.confirmedEvents} confirmed events`,
         `${session.summary.manualChecks || 0} manual checks`,
      ].join(' · ');
      elements.downloadReport.disabled = session.status !== 'complete';
      elements.downloadLog.disabled = session.samples.length === 0;
      elements.undo.disabled = session.editorial.undo.length === 0;
      elements.redo.disabled = session.editorial.redo.length === 0;
   }
}

/**
 * Compares paused-run settings with the editable UI values. It prevents a
 * changed cadence or reference from being presented as a lossless resume.
 *
 * @param {object|null} session Current analysis session.
 * @param {number} requestedSampleInterval Sampling interval requested by the UI or API.
 * @param {number|null} requestedBaselineTime Baseline timestamp requested by the UI or API.
 * @returns {{samplingChanged: boolean, baselineChanged: boolean}} Restart reasons.
 */
function getPausedSettingsChanges(session, requestedSampleInterval, requestedBaselineTime) {
   if (session?.status !== 'cancelled') return { samplingChanged: false, baselineChanged: false };
   const pausedSampleInterval = Number(session.config?.sampleIntervalSeconds);
   const pausedBaselineTime = Number(
      session.baseline?.selectedMediaTime
      ?? session.baseline?.mediaTime
      ?? session.config?.baselineSearchStart,
   );
   return {
      samplingChanged: Number.isFinite(pausedSampleInterval)
         && requestedSampleInterval !== pausedSampleInterval,
      baselineChanged: requestedBaselineTime !== null
         && Number.isFinite(pausedBaselineTime)
         && Math.abs(Number(requestedBaselineTime) - pausedBaselineTime) >= 0.001,
   };
}

/**
 * Updates controls after model, file, and analysis state changes.
 *
 * @returns {void}
 */
function syncControls() {
   const session = controller.getSession();
   const resumable = session?.status === 'cancelled';
   const changes = getPausedSettingsChanges(
      session,
      Number(elements.sampleInterval.value),
      selectedBaseTime,
   );
   const restartLabel = changes.samplingChanged && changes.baselineChanged
      ? 'Restart with new settings'
      : changes.samplingChanged
         ? 'Restart with new sampling'
         : 'Restart with new baseline';
   const restartRequired = changes.samplingChanged || changes.baselineChanged;
   elements.start.disabled = !sourceLoaded
      || !controller.isModelsReady()
      || (!resumable && selectedBaseTime === null)
      || analysisRunning;
   elements.start.textContent = resumable
      ? restartRequired ? restartLabel : 'Resume analysis'
      : session?.status === 'complete'
         ? 'Analyse again'
         : session?.status === 'failed' ? 'Retry analysis' : 'Analyse video';
   elements.cancel.disabled = !analysisRunning;
   elements.start.hidden = analysisRunning;
   elements.cancel.hidden = !analysisRunning;
   elements.file.disabled = analysisRunning;
   elements.sampleInterval.disabled = analysisRunning;
   elements.selectBase.disabled = !sourceLoaded || analysisRunning;
   elements.analyzeFrame.disabled = !sourceLoaded || !session?.baseline || analysisRunning;
   elements.seek.disabled = !sourceLoaded || analysisRunning;
   elements.video.inert = analysisRunning;
   elements.video.setAttribute('aria-disabled', String(analysisRunning));
   elements.viewer.classList.toggle('is-analysis-locked', analysisRunning);
   elements.viewerLock.hidden = !analysisRunning;
   elements.sourceControls.classList.toggle('is-muted', analysisRunning);
   elements.analysisSettings.classList.toggle('is-muted', analysisRunning);
   document.querySelectorAll('.loader-time-link').forEach((button) => {
      button.disabled = analysisRunning;
   });
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
   selectedBaseTime = null;
   elements.sourceFileAction.textContent = 'Replace local video';
   elements.sourceFileName.textContent = session.source.name;
   elements.sourceFileName.title = session.source.name;
   elements.sourceFileMeta.textContent = [
      session.source.width && session.source.height ? `${session.source.width} × ${session.source.height}` : null,
      formatMediaTime(session.source.duration),
      formatFileSize(session.source.size),
   ].filter(Boolean).join(' · ');
   renderAnalysisMessage(null);
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
   const currentSession = controller.getSession();
   const requestedSampleInterval = Number(options.sampleIntervalSeconds ?? elements.sampleInterval.value);
   const requestedBaselineValue = options.baselineTime ?? selectedBaseTime;
   const changes = getPausedSettingsChanges(currentSession, requestedSampleInterval, requestedBaselineValue);
   const restartRequired = changes.samplingChanged || changes.baselineChanged;
   const resume = options.resume ?? (currentSession?.status === 'cancelled' && !restartRequired);
   const baselineWasExplicitlySelected = options.baselineTime !== undefined && options.baselineTime !== null
      || selectedBaseTime !== null;
   analysisRunning = true;
   renderAnalysisMessage(null);
   syncControls();
   setStatus('working', resume ? 'resuming analysis' : 'analysing video');
   if (!resume) {
      lastProgressState = { scanSampleIndex: 0, scanSampleTotal: null, mediaTime: null };
      elements.progress.max = 1;
      elements.progress.value = 0;
      elements.progressLabel.textContent = 'building baseline';
   }
   try {
      const session = await controller.analyze({
         resume,
         sampleIntervalSeconds: requestedSampleInterval,
         baselineTime: Number(options.baselineTime ?? selectedBaseTime ?? options.start ?? 0),
         baselineSelectionMode: options.baselineSelectionMode
            ?? (baselineWasExplicitlySelected ? 'anchored' : 'search'),
         start: options.start,
         end: options.end,
      });
      renderSession(session);
      setStatus('ready', session.status === 'complete' ? 'analysis complete' : 'analysis paused');
      return session;
   } catch (error) {
      const failedBaseline = controller.getSession()?.status === 'failed';
      setStatus('error', failedBaseline ? 'baseline not created' : error.message || String(error));
      if (!failedBaseline) {
         renderAnalysisMessage('error', 'Analysis stopped', error.message || String(error));
      }
      dispatchLoaderEvent('error', { message: error.message || String(error) });
      throw error;
   } finally {
      analysisRunning = false;
      syncControls();
   }
}

/**
 * Runs an explicit comparison for the frame currently shown by the source
 * player and adds the result to the editable evidence story.
 *
 * @param {number} [mediaTime] Optional timestamp supplied by automation.
 * @returns {Promise<object>} Created manual evidence event.
 */
async function analyzeCurrentFrame(mediaTime = Number(elements.video.currentTime) || 0) {
   analysisRunning = true;
   renderAnalysisMessage(null);
   syncControls();
   setStatus('working', 'analysing selected frame');
   try {
      const event = await controller.analyzeFrame(mediaTime);
      renderSession(controller.getSession());
      setStatus('ready', 'manual frame check added');
      return event;
   } catch (error) {
      setStatus('error', 'frame check failed');
      renderAnalysisMessage('error', 'Frame check failed', error.message || String(error));
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
   if (update.type === 'sample' || update.type === 'analysis-cancelled' || update.type === 'analysis-complete') {
      renderAnalysisProgress(update);
   }
   if (update.type === 'sample') {
      renderSession(update.session);
   }
   if (update.type === 'analysis-failed') {
      const copy = baselineFailureCopy(update);
      renderAnalysisMessage('error', copy.title, copy.body);
      setStatus('error', 'baseline not created');
   }
   if (update.type === 'manual-frame-checked') {
      const observation = update.event.observations.at(-1);
      const distance = Number.isFinite(observation?.faceDistance)
         ? `face-api distance ${observation.faceDistance.toFixed(4)}`
         : 'face-api returned no numeric distance';
      renderAnalysisMessage(
         'success',
         `Frame added at ${formatMediaTime(update.event.anchorMediaTime)}`,
         `${distance}. Review the new manual card in the evidence story.`,
      );
      renderSession(update.session);
   }
   if (update.type === 'baseline-ready' || update.type === 'event-confirmed') {
      renderSession(update.session);
      syncControls();
   }
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
elements.sampleInterval.addEventListener('change', syncControls);
elements.selectBase.addEventListener('click', selectCurrentBase);
elements.start.addEventListener('click', () => startAnalysis().catch(() => {}));
elements.cancel.addEventListener('click', () => controller.cancel());
elements.analyzeFrame.addEventListener('click', () => analyzeCurrentFrame().catch(() => {}));
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
   /** @param {number} mediaTime Source timestamp to compare with the baseline. */
   analyzeFrame: (mediaTime) => analyzeCurrentFrame(mediaTime),
   /** @returns {Promise<object>} Resumes the current cancelled analysis. */
   resume: () => startAnalysis({ resume: true }),
   /** @returns {void} Requests a resumable pause at the next sample boundary. */
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
