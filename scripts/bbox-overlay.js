/**
 * @module bbox-overlay
 * @description
 * Bbox match-state overlay — add-on for ghostati.html.
 *
 * Draws a bounding box around the detected face on its dedicated canvas
 * (`#bboxOverlay`), colored to reflect the latest match state computed by the
 * engine (matched / eluded / unclear / unknown). Renders the current metrics
 * next to the box: live detection score, live distance and closest match ID.
 *
 * Reacts to events on `state.gstmxxEvents`. Does not mutate the engine.
 *
 * Color convention:
 *   red    = identified  (matched)
 *   green  = eluded
 *   blue   = unclear (post-makeup match below threshold against a saved face)
 *   grey   = unknown (also the fallback for any unmapped state)
 *
 * Overlay suppression:
 *   When the engine reports a `matchStateChanged` triggered by an explicit user
 *   action (`source: 'scan' | 'save' | 'find' | 'efficacy'`), the corresponding
 *   on-screen overlay covers the video for a moment. To avoid double visuals,
 *   the bbox is suppressed for `OVERLAY_SUPPRESS_MS` after such an event. The
 *   auto-find loop (`source: 'auto'`) never suppresses.
 */

import { state } from './state.js';
import { avgPoint, drawClosedPath, drawOpenPath, roundRect } from './utils.js';

// ---------- Style constants ----------

/**
 * Stroke / label color for each known match state.
 * Exported so tests can assert color choices.
 * @type {{ matched: string, eluded: string, unclear: string, unknown: string }}
 */
export const COLORS = {
   matched: 'rgba(255, 122, 122, 0.95)',
   eluded:  'rgba(61, 220, 151, 0.95)',
   unclear: 'rgba(122, 192, 255, 0.95)',
   'partial-elusion': 'rgba(122, 192, 255, 0.95)',
   unknown: 'rgba(170, 180, 195, 0.85)',
};

const LINE_WIDTH_CSS = 2.6;

// Same font as the UI logger (see .log-line in styles/ghostati.css). Values are
// in CSS pixels and get multiplied by the canvas/CSS scale in `drawLabels` so
// the visual size stays consistent across resolutions (on mobile the canvas is
// 1920×1080 but rendered at ~350px wide: 12 canvas-pixels would be unreadable
// without scaling).
const LABEL_FONT_FAMILY     = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const LABEL_FONT_SIZE_CSS   = 12;
const LABEL_LINE_HEIGHT_CSS = 16;
const LABEL_PADDING_CSS     = 6;
const LABEL_GAP_CSS         = 8;

/** Suppression window after an overlay-producing user action, in milliseconds. */
export const OVERLAY_SUPPRESS_MS = 4000;

/** Numeric `matchStateChanged.detail` fields that map 1:1 onto `view`. */
const COPYABLE_FIELDS = ['liveMinDist', 'obfMinDist', 'liveMinId', 'obfMinId'];

export const OVERLAY_MODE_STORAGE_KEY = 'ghostati-overlay-mode-v1';

export const OVERLAY_MODES = {
   bbox: 'Vista: bbox',
   mesh: 'Vista: mesh',
   entrambi: 'Vista: entrambi',
   '2d': 'Vista: 2D',
};

// ---------- Module state ----------

/** Pristine values for the rendering view; used as the reset baseline. */
const INITIAL_VIEW = Object.freeze({
   matchState:  'unknown',
   liveMinDist: null,
   obfMinDist:  null,
   liveMinId:   null,
   obfMinId:    null,
   overlayMode: 'bbox',
   lastLandmarks3d: null,
   lastDetection: null,
});

/**
 * Current rendering view — single source of truth for what `drawLabels` and
 * `currentColor` display. Mutated in place (never reassigned) so the export
 * keeps a stable reference for tests.
 */
export const view = { ...INITIAL_VIEW };

let canvas = null;
let overlayEl = null;
let ctx = null;
/** Monotonic deadline (`performance.now()` domain). While `now < this`, skip drawing. */
let suppressUntil = 0;

// ---------- Bootstrap ----------

// `main.js` dispatches `ghostatiReady` on `window` when state, DOM elements and
// `window.gstmxx` are all ready. Same convention as `auto-find-loop.js`.
window.addEventListener('ghostatiReady', init, { once: true });

/**
 * Resolve canvas references and wire bus listeners. Idempotent enough to be
 * called from a test harness with a stub canvas already injected into the DOM.
 *
 * @returns {boolean} `true` on successful init, `false` if required DOM nodes
 *   are missing (a console warning is emitted in that case).
 */
export function init() {
   canvas = document.getElementById('bboxOverlay');
   overlayEl = document.getElementById('overlay');
   if (!canvas || !overlayEl) {
      console.warn('[bbox-overlay] missing #bboxOverlay or #overlay, skipping init');
      return false;
   }
   ctx = canvas.getContext('2d');

   const persistedMode = readPersistedOverlayMode();
   if (persistedMode) view.overlayMode = persistedMode;

   state.gstmxxEvents.addEventListener('detection', onDetection);
   state.gstmxxEvents.addEventListener('landmarks3d', onLandmarks3d);
   state.gstmxxEvents.addEventListener('matchStateChanged', onMatchStateChanged);
   state.gstmxxEvents.addEventListener('dbChanged', onDbChanged);
   return true;
}

// ---------- Bus listeners ----------

/**
 * Handle a `detection` event by repainting the bbox and labels (or clearing
 * the canvas, when suppressed or when no face was detected).
 *
 * @param {CustomEvent<{ result: object }>} e
 */
export function onDetection(e) {
   const result = e.detail && e.detail.result;
   view.lastDetection = result || null;
   renderOverlay();
}

/**
 * Handle a `landmarks3d` event by caching the latest 478-point MediaPipe mesh
 * and repainting according to the current overlay mode.
 *
 * @param {CustomEvent<{ landmarks: Array|null }>} e
 */
export function onLandmarks3d(e) {
   const landmarks = e.detail && e.detail.landmarks;
   view.lastLandmarks3d = Array.isArray(landmarks) ? landmarks : null;
   renderOverlay();
}

/**
 * Apply the incoming match state to `view` and arm overlay suppression on
 * non-`auto` sources. `scan`/`save` events don't carry distance fields, so
 * each numeric field is only copied when present in the payload.
 *
 * @param {CustomEvent<{
 *   detectionState: ?string,
 *   liveMinDist: ?number, obfMinDist: ?number,
 *   liveMinId: ?number,   obfMinId: ?number,
 *   source: ?('scan'|'save'|'find'|'efficacy'|'auto')
 * }>} e
 */
export function onMatchStateChanged(e) {
   const d = e.detail;
   if (!d) return;
   const faceapiSection = d.faceapi || null;
   const nextMatchState = d.overall || d.detectionState || faceapiSection?.detectionState;
   if (nextMatchState) view.matchState = nextMatchState;
   for (const k of COPYABLE_FIELDS) {
      if (k in d) view[k] = d[k];
      else if (faceapiSection && k in faceapiSection) view[k] = faceapiSection[k];
   }
   // Any non-auto source has just painted an overlay onto the video; mute the
   // bbox for OVERLAY_SUPPRESS_MS to keep the two visuals from fighting.
   if (d.source && d.source !== 'auto') suppressUntil = performance.now() + OVERLAY_SUPPRESS_MS;

   renderOverlay();
}

/**
 * Reset the view when the DB has been cleared. Other DB events (additions,
 * stat updates) are ignored — they don't invalidate the current match.
 *
 * @param {CustomEvent<{ count: number }>} e
 */
export function onDbChanged(e) {
   if (e.detail?.count === 0) Object.assign(view, {
      ...INITIAL_VIEW,
      overlayMode: view.overlayMode,
      lastLandmarks3d: view.lastLandmarks3d,
      lastDetection: view.lastDetection,
   });
}

/**
 * Change the overlay mode, persist it and repaint immediately.
 *
 * @param {'bbox'|'mesh'|'entrambi'|'2d'} mode
 * @returns {'bbox'|'mesh'|'entrambi'|'2d'}
 */
export function setOverlayMode(mode) {
   if (!Object.keys(OVERLAY_MODES).includes(mode)) return view.overlayMode;
   view.overlayMode = mode;
   persistOverlayMode(mode);
   renderOverlay();
   return view.overlayMode;
}

/**
 * @returns {'bbox'|'mesh'|'entrambi'|'2d'}
 */
export function cycleOverlayMode() {
   const keys = Object.keys(OVERLAY_MODES);
   const index = keys.indexOf(view.overlayMode);
   return setOverlayMode(keys[(index + 1) % keys.length]);
}

// ---------- Geometry / rendering helpers ----------

/** Match the bbox canvas's intrinsic size to the engine overlay's. */
function syncSize() {
   if (canvas.width !== overlayEl.width || canvas.height !== overlayEl.height) {
      canvas.width = overlayEl.width;
      canvas.height = overlayEl.height;
   }
}

/** Mirror the bbox canvas in lockstep with the engine overlay (CSS transform). */
function syncMirror() {
   const t = overlayEl.style.transform;
   if (canvas.style.transform !== t) canvas.style.transform = t;
}

/** Clear the entire bbox canvas. */
function clearBbox() {
   ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/** Repaint the shared overlay canvas from the latest cached streams. */
function renderOverlay() {
   if (!canvas || !overlayEl || !ctx) return;
   syncSize();
   syncMirror();
   clearBbox();
   if (performance.now() < suppressUntil) return;

   if (view.overlayMode === '2d') {
      drawFaceapiScaffold2d();
      return;
   }

   const box = getLastBox();
   if (includesBbox() && box) {
      drawBox(box);
      drawLabels(box, extractScore(view.lastDetection));
   }
   if (includesMesh()) drawMesh478();
}

function includesBbox() {
   return view.overlayMode === 'bbox' || view.overlayMode === 'entrambi';
}

function includesMesh() {
   return view.overlayMode === 'mesh' || view.overlayMode === 'entrambi';
}

export function overlayModeNeedsDetailedFaceapi(mode = view.overlayMode) {
   return mode === '2d';
}

function getLastBox() {
   if (!view.lastDetection) return null;
   const resized = faceapi.resizeResults(view.lastDetection, {
      width: canvas.width,
      height: canvas.height,
   });
   return extractBox(resized) || null;
}

function readPersistedOverlayMode() {
   try {
      const raw = localStorage.getItem(OVERLAY_MODE_STORAGE_KEY);
      return Object.keys(OVERLAY_MODES).includes(raw) ? raw : null;
   } catch {
      return null;
   }
}

function persistOverlayMode(mode) {
   try {
      localStorage.setItem(OVERLAY_MODE_STORAGE_KEY, mode);
   } catch {
      // Persistence is optional; rendering still works without storage access.
   }
}

/**
 * Pull the bounding box out of a face-api result, handling both shapes.
 *
 *   detectSingleFace()                        → result.box
 *   detectSingleFace().withFaceLandmarks()    → result.detection.box
 *
 * @param {object} resized A face-api result already passed through `resizeResults`.
 * @returns {{x:number, y:number, width:number, height:number}|undefined}
 */
export function extractBox(resized) {
   return (resized.detection && resized.detection.box) || resized.box;
}

/**
 * Pull the detection confidence score out of a face-api result. Same dual
 * shape as {@link extractBox}.
 *
 * @param {object} result
 * @returns {number|null}
 */
export function extractScore(result) {
   if (result.detection && typeof result.detection.score === 'number') return result.detection.score;
   if (typeof result.score === 'number') return result.score;
   return null;
}

/**
 * Format a number for display, or `'—'` when not a finite number.
 *
 * @param {*} value
 * @param {number} digits
 * @returns {string}
 */
export function fmt(value, digits) {
   return (typeof value === 'number' && Number.isFinite(value)) ? value.toFixed(digits) : '—';
}

/**
 * Pick the stroke / label color from {@link COLORS} matching the current
 * `view.matchState`, with a fallback to the `unknown` grey.
 *
 * @returns {string}
 */
export function currentColor() {
   return COLORS[view.matchState] || COLORS.unknown;
}

/** Ratio between intrinsic canvas pixels and CSS pixels at the current layout. */
function cssScale() {
   // getBoundingClientRect() is transform-aware, so a CSS zoom on an ancestor
   // (the lab's #viewer digital zoom) is reflected here. Using it instead of
   // clientWidth keeps overlay strokes, dots and the info box a constant
   // on-screen size at any zoom level, and consistent on small monitors.
   const rect = canvas.getBoundingClientRect();
   const cssW = rect.width || canvas.clientWidth || canvas.width;
   return canvas.width / cssW;
}

/**
 * Stroke the bounding rectangle at the current color and scaled line width.
 * @param {{x:number, y:number, width:number, height:number}} box
 */
function drawBox(box) {
   const scale = cssScale();
   ctx.save();
   ctx.lineWidth = LINE_WIDTH_CSS * scale;
   ctx.strokeStyle = currentColor();
   ctx.strokeRect(box.x, box.y, box.width, box.height);
   ctx.restore();
}

function drawMesh478() {
   if (!Array.isArray(view.lastLandmarks3d) || view.lastLandmarks3d.length !== 478) return;

   const scale = cssScale();
   const radius = 1.5 * scale;
   ctx.save();
   ctx.fillStyle = currentColor();
   for (const point of view.lastLandmarks3d) {
      ctx.beginPath();
      ctx.arc(point.x * canvas.width, point.y * canvas.height, radius, 0, Math.PI * 2);
      ctx.fill();
   }
   ctx.restore();
}

function drawFaceapiScaffold2d() {
   const resized = getResizedDetection();
   const box = resized && extractBox(resized);
   const landmarks = resized && resized.landmarks;

   if (!landmarks || typeof landmarks.getLeftEye !== 'function') {
      if (box) {
         drawBox(box);
         drawLabels(box, extractScore(view.lastDetection));
      }
      return;
   }

   const leftEye = landmarks.getLeftEye();
   const rightEye = landmarks.getRightEye();
   const nose = landmarks.getNose();
   const jaw = landmarks.getJawOutline();
   const mouth = landmarks.getMouth();
   const scale = cssScale();

   ctx.save();
   ctx.lineWidth = 2.2 * scale;
   ctx.strokeStyle = currentColor();
   ctx.strokeRect(box.x, box.y, box.width, box.height);

   const leftCenter = avgPoint(leftEye);
   const rightCenter = avgPoint(rightEye);
   ctx.beginPath();
   ctx.moveTo(leftCenter.x, leftCenter.y);
   ctx.lineTo(rightCenter.x, rightCenter.y);
   ctx.stroke();

   drawClosedPath(ctx, leftEye, null, 'rgba(255, 122, 122, 0.85)', 2 * scale);
   drawClosedPath(ctx, rightEye, null, 'rgba(255, 122, 122, 0.85)', 2 * scale);
   drawOpenPath(ctx, jaw, 'rgba(159, 122, 234, 0.88)', 2 * scale);
   drawOpenPath(ctx, nose, 'rgba(61, 220, 151, 0.88)', 2 * scale);
   drawClosedPath(ctx, mouth, null, 'rgba(255, 204, 102, 0.88)', 2 * scale);

   ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
   for (const point of [leftCenter, rightCenter, avgPoint(nose.slice(3)), avgPoint(mouth.slice(0, 7))]) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.4 * scale, 0, Math.PI * 2);
      ctx.fill();
   }

   drawFaceapiScaffoldLabels(box, resized, scale);
   ctx.restore();
}

function drawFaceapiScaffoldLabels(box, resized, scale) {
   const lines = ['volto rilevato'];
   if (typeof resized.age === 'number') lines.push(`eta stimata: ${Math.round(resized.age)}`);
   if (resized.gender) lines.push(`genere stimato: ${resized.gender}`);

   const fontSize = 12 * scale;
   const pad = 5 * scale;
   const lineHeight = 15 * scale;

   ctx.font = `${fontSize}px ${LABEL_FONT_FAMILY}`;
   const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
   const labelWidth = maxWidth + pad * 2;
   const labelHeight = lines.length * lineHeight + pad * 2;
   const startX = Math.max(0, Math.min(box.x, canvas.width - labelWidth));
   const startY = Math.max(16 * scale, box.y - labelHeight - 8 * scale);

   if ((canvas.style.transform || '').includes('scaleX(-1)')) {
      ctx.translate(startX + labelWidth / 2, startY + labelHeight / 2);
      ctx.scale(-1, 1);
      ctx.translate(-(startX + labelWidth / 2), -(startY + labelHeight / 2));
   }

   ctx.fillStyle = 'rgba(15, 17, 21, 0.78)';
   ctx.strokeStyle = 'rgba(255,255,255,0.10)';
   ctx.lineWidth = scale;
   roundRect(ctx, startX, startY, labelWidth, labelHeight, 8 * scale);
   ctx.fill();
   ctx.stroke();

   ctx.fillStyle = 'rgba(238, 242, 255, 0.96)';
   lines.forEach((line, index) => {
      ctx.fillText(line, startX + pad, startY + pad + index * lineHeight + lineHeight * 0.15);
   });
}

function getResizedDetection() {
   if (!view.lastDetection) return null;
   return faceapi.resizeResults(view.lastDetection, {
      width: canvas.width,
      height: canvas.height,
   });
}

/**
 * Draw the metric labels next to the bounding box. The label block is
 * un-mirrored (the CSS mirror applies to the whole canvas) so the text reads
 * left-to-right even when the webcam is in mirror mode.
 *
 * @param {{x:number, y:number, width:number, height:number}} box
 * @param {number|null} score Live detection score from face-api.
 */
function drawLabels(box, score) {
   const lines = [
      `detection ${fmt(score, 2)}`,
      `distance  ${fmt(view.liveMinDist, 3)}`,
      `faceId    ${fmt(view.liveMinId, 0)}`,
   ];

   // If the Ghostyle has shifted the closest match onto a different ID than
   // the live detector picks, surface it: it makes the embedding drift under
   // makeup readable at a glance.
   if (Number.isFinite(view.obfMinId) && view.obfMinId !== view.liveMinId) {
      lines.push(`ObfFaceId! ${fmt(view.obfMinId, 0)}`);
   }

   // Canvas→CSS scale: multiply every CSS-px dimension to get canvas-px values
   // that match the on-screen rendering size.
   const scale = cssScale();
   const fontSize   = LABEL_FONT_SIZE_CSS   * scale;
   const lineHeight = LABEL_LINE_HEIGHT_CSS * scale;
   const padding    = LABEL_PADDING_CSS     * scale;
   const gap        = LABEL_GAP_CSS         * scale;

   ctx.save();
   ctx.font = `${fontSize}px ${LABEL_FONT_FAMILY}`;
   ctx.textBaseline = 'top';
   const widths = lines.map(t => ctx.measureText(t).width);
   const blockW = Math.max(...widths) + padding * 2;
   const blockH = lineHeight * lines.length + padding * 2;

   const aboveY = box.y - blockH - gap;
   const belowY = box.y + box.height + gap;
   const top = aboveY >= 0 ? aboveY : belowY;
   let left = box.x;
   if (left + blockW > canvas.width) left = canvas.width - blockW;
   if (left < 0) left = 0;

   // Un-mirror just the label block if the canvas is mirrored, so the text is
   // legible regardless of camera orientation.
   const mirrored = (canvas.style.transform || '').includes('scaleX(-1)');
   if (mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      left = canvas.width - left - blockW;
   }

   ctx.fillStyle = 'rgba(12, 14, 22, 0.78)';
   ctx.fillRect(left, top, blockW, blockH);

   ctx.fillStyle = currentColor();
   lines.forEach((t, i) => {
      ctx.fillText(t, left + padding, top + padding + i * lineHeight);
   });
   ctx.restore();
}
