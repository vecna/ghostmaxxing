/**
 * @module bbox-overlay
 * @description
 * Bbox match-state overlay — layer for Ghostmaxxing.
 *
 * Draws a bounding box around the detected face on its dedicated canvas
 * (`#bboxOverlay`), colored to reflect the latest match state computed by the
 * engine (matched / eluded / unclear / unknown). Renders the current metrics
 * next to the box: live detection score, live distance and closest match ID.
 *
 * Reacts to events on `state.gstmxxEvents`. Does not mutate the engine.
 *
 * Architectural note (intentional, do not "fix"): the live scaffold and the
 * composite readout deliberately use different images and different detectors —
 * the scaffold tracks the raw webcam frame for responsive per-frame feedback,
 * while the composite readout re-runs detection on the overlay-applied image on
 * the slower auto-find tick. Pointing the scaffold at the composite would make
 * the overlay feel laggy and conflate "is a face visible" with "does the
 * modified face still match". Keep them separate.
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
import { t } from './i18n.js';
import { avgPoint, drawClosedPath, drawOpenPath, roundRect, syncMirror, syncSize } from './utils.js';

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

// Same font as the UI logger. Values are
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

window.addEventListener('gstmxxReady', init, { once: true });

/**
 * Resolves the bbox canvas and overlay references after `main.js` has finished
 * preparing state, DOM elements, and `window.gstmxx`, then wires the shared
 * event bus that drives all bbox, mesh, and 2D scaffold repainting. The setup is
 * deliberately light enough for tests to call with stub canvases in the DOM.
 *
 * @returns {boolean} True when required DOM nodes are present and listeners are attached.
 * @see main - Dispatches `gstmxxReady` when the lab environment is ready.
 * @see onDetection - Receives live face-api detection events.
 * @see onLandmarks3d - Receives MediaPipe mesh events.
 * @see onMatchStateChanged - Receives scan/save/find/auto match-state events.
 * @see onDbChanged - Receives database changes that may reset overlay state.
 */
export function init() {
   canvas = document.getElementById('bboxOverlay');
   overlayEl = document.getElementById('overlay');
   if (!canvas || !overlayEl) {
      console.warn(t('console_bbox_overlay_missing'));
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
 * Caches the latest face-api detection result and repaints the bbox layer. In
 * Ghostmaxxing this is the bridge from the recognition engine's live camera
 * result to the visual box, metrics label, or 2D landmark scaffold.
 *
 * @param {CustomEvent} e - `detection` event carrying the latest face-api result in `detail.result`.
 * @returns {void}
 * @see init - Registers this on `state.gstmxxEvents`.
 * @see detectFaceInCam - Dispatches detection events from the 2D engine.
 * @see renderOverlay - Repaints after the cached detection changes.
 */
export function onDetection(e) {
   const result = e.detail && e.detail.result;
   view.lastDetection = result || null;
   renderOverlay();
}

/**
 * Caches the latest 478-point MediaPipe mesh and repaints the bbox layer when
 * the selected overlay mode includes the 3D mesh. This lets the overlay update
 * from MediaPipe frames without asking the 2D engine to redraw.
 *
 * @param {CustomEvent} e - `landmarks3d` event carrying normalized mesh points in `detail.landmarks`.
 * @returns {void}
 * @see init - Registers this on `state.gstmxxEvents`.
 * @see tick - Dispatches `landmarks3d` from `mediapipe-loop.js`.
 * @see renderOverlay - Repaints after cached mesh landmarks change.
 */
export function onLandmarks3d(e) {
   const landmarks = e.detail && e.detail.landmarks;
   view.lastLandmarks3d = Array.isArray(landmarks) ? landmarks : null;
   renderOverlay();
}

/**
 * Applies a unified `matchStateChanged` payload to the overlay view and starts
 * temporary suppression for explicit user-action sources. Auto-find events keep
 * drawing continuously, while scan/save/find/efficacy overlays get a short
 * quiet window so the bbox does not compete with the result visualization.
 *
 * @param {CustomEvent} e - Match-state event whose `detail` may include top-level or nested face-api metrics.
 * @returns {void}
 * @see init - Registers this on `state.gstmxxEvents`.
 * @see tick - Dispatches auto match-state updates from `auto-find-loop.js`.
 * @see main - Dispatches scan/save match-state updates during user workflows.
 * @see renderOverlay - Repaints after match colors and labels are updated.
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
   if (d.source && d.source !== 'auto') suppressUntil = performance.now() + OVERLAY_SUPPRESS_MS;

   renderOverlay();
}

/**
 * Resets match metrics when the local face archive is cleared, while preserving
 * the current overlay mode and cached camera data. Database additions and stat
 * updates do not invalidate the current visual match state, so they are ignored.
 *
 * @param {CustomEvent} e - Database event whose `detail.count` is zero after archive clearing.
 * @returns {void}
 * @see init - Registers this on `state.gstmxxEvents`.
 * @see clearDb - Dispatches the zero-count database event after wiping the archive.
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
 * Changes which landmark visualization is painted on `#bboxOverlay`, persists
 * the user's choice, and repaints immediately. The lab uses this to switch
 * between bbox metrics, 3D mesh dots, both layers, and the detailed 2D scaffold.
 *
 * @param {'bbox'|'mesh'|'entrambi'|'2d'} mode - Requested overlay mode.
 * @returns {'bbox'|'mesh'|'entrambi'|'2d'} Active overlay mode after validation.
 * @see init - Applies the persisted mode on startup.
 * @see main - Calls this from the overlay mode button.
 * @see applyView - Calls this when the lab UI switches camera/points/mesh views.
 * @see renderOverlay - Repaints the chosen mode.
 */
export function setOverlayMode(mode) {
   if (!Object.keys(OVERLAY_MODES).includes(mode)) return view.overlayMode;
   view.overlayMode = mode;
   persistOverlayMode(mode);
   renderOverlay();
   return view.overlayMode;
}

// ---------- Geometry / rendering helpers ----------

/**
 * Clears the dedicated bbox canvas before each repaint, preventing stale boxes,
 * labels, or mesh dots from lingering when the current mode or detection changes.
 *
 * @returns {void}
 * @see renderOverlay - Clears before drawing the active overlay mode.
 */
function clearBbox() {
   ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Repaints `#bboxOverlay` from the cached detection, match, and MediaPipe mesh
 * streams. It mirrors and sizes the canvas to the main overlay, honors temporary
 * suppression after explicit user actions, then draws the selected bbox, mesh,
 * combined, or detailed 2D scaffold view.
 *
 * @returns {void}
 * @see onDetection - Calls this after face-api detection updates.
 * @see onLandmarks3d - Calls this after MediaPipe mesh updates.
 * @see onMatchStateChanged - Calls this after match-state updates.
 * @see setOverlayMode - Calls this after a mode change.
 */
function renderOverlay() {
   if (!canvas || !overlayEl || !ctx) return;
   syncSize(canvas, overlayEl);
   syncMirror(canvas, overlayEl);
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

/**
 * Reports whether the current overlay mode should draw the face bounding box
 * and metric label block.
 *
 * @returns {boolean} True for bbox-only and combined modes.
 * @see renderOverlay - Uses this to decide whether to call `drawBox` and `drawLabels`.
 */
function includesBbox() {
   return view.overlayMode === 'bbox' || view.overlayMode === 'entrambi';
}

/**
 * Reports whether the current overlay mode should draw the cached 478-point
 * MediaPipe mesh.
 *
 * @returns {boolean} True for mesh-only and combined modes.
 * @see renderOverlay - Uses this to decide whether to call `drawMesh478`.
 */
function includesMesh() {
   return view.overlayMode === 'mesh' || view.overlayMode === 'entrambi';
}

/**
 * Tells the 2D engine whether it should request detailed face-api landmarks for
 * the current overlay mode. The detailed scaffold mode needs landmark chains,
 * while bbox and mesh modes can use cheaper detection data.
 *
 * @param {'bbox'|'mesh'|'entrambi'|'2d'} [mode=view.overlayMode] - Overlay mode to inspect.
 * @returns {boolean} True when detailed face-api landmarks are required.
 * @see runEffectPass - Uses this to choose the face-api detection pipeline.
 */
export function overlayModeNeedsDetailedFaceapi(mode = view.overlayMode) {
   return mode === '2d';
}

/**
 * Resizes the latest face-api detection to the bbox canvas coordinate space and
 * extracts the current bounding rectangle for drawing.
 *
 * @returns {{x:number, y:number, width:number, height:number}|null} Current box in canvas pixels.
 * @see renderOverlay - Uses this before drawing bbox metrics.
 * @see extractBox - Handles the two face-api result shapes.
 */
function getLastBox() {
   if (!view.lastDetection) return null;
   const resized = faceapi.resizeResults(view.lastDetection, {
      width: canvas.width,
      height: canvas.height,
   });
   return extractBox(resized) || null;
}

/**
 * Reads the persisted overlay mode from localStorage and validates it against
 * the known Ghostmaxxing overlay modes.
 *
 * @returns {'bbox'|'mesh'|'entrambi'|'2d'|null} Persisted mode, or null when unavailable.
 * @see init - Applies the persisted mode during overlay startup.
 */
function readPersistedOverlayMode() {
   try {
      const raw = localStorage.getItem(OVERLAY_MODE_STORAGE_KEY);
      return Object.keys(OVERLAY_MODES).includes(raw) ? raw : null;
   } catch {
      return null;
   }
}

/**
 * Stores the user's overlay mode preference. Storage failures are ignored
 * because overlay rendering should keep working even when localStorage is
 * unavailable or blocked.
 *
 * @param {'bbox'|'mesh'|'entrambi'|'2d'} mode - Overlay mode to persist.
 * @returns {void}
 * @see setOverlayMode - Persists each accepted mode change.
 */
function persistOverlayMode(mode) {
   try {
      localStorage.setItem(OVERLAY_MODE_STORAGE_KEY, mode);
   } catch {
   }
}

/**
 * Pulls the bounding box out of a face-api result, handling both shapes used in
 * the project: plain detections expose `result.box`, while detailed landmark
 * detections expose `result.detection.box`.
 *
 * @param {object} resized - face-api result already passed through `resizeResults`.
 * @returns {{x:number, y:number, width:number, height:number}|undefined} Extracted bounding box.
 * @see getLastBox - Extracts the cached live detection box.
 * @see drawFaceapiScaffold2d - Extracts the detailed scaffold box.
 */
export function extractBox(resized) {
   return (resized.detection && resized.detection.box) || resized.box;
}

/**
 * Pulls the detection confidence score out of a face-api result, matching the
 * same plain versus detailed result shapes handled by `extractBox`.
 *
 * @param {object} result - face-api result to inspect.
 * @returns {number|null} Detection score, or null when no numeric score exists.
 * @see renderOverlay - Passes this score into bbox metric labels.
 * @see drawFaceapiScaffold2d - Uses this score when falling back to bbox labels.
 */
export function extractScore(result) {
   if (result.detection && typeof result.detection.score === 'number') return result.detection.score;
   if (typeof result.score === 'number') return result.score;
   return null;
}

/**
 * Formats numeric bbox metrics for the overlay label block, using an em dash
 * placeholder when a metric is missing, invalid, or not yet computed.
 *
 * @param {*} value - Metric value to display.
 * @param {number} digits - Decimal places for finite numbers.
 * @returns {string} Formatted metric or placeholder.
 * @see drawLabels - Formats detection score, distance, and face id values.
 */
export function fmt(value, digits) {
   return (typeof value === 'number' && Number.isFinite(value)) ? value.toFixed(digits) : '—';
}

/**
 * Picks the stroke and label color for the latest match state, mapping
 * identified, eluded, unclear, partial-elusion, and unknown outcomes to the
 * overlay color convention documented by this module.
 *
 * @returns {string} CSS color for the current match state.
 * @see drawBox - Uses this for the bbox stroke.
 * @see drawMesh478 - Uses this for mesh dots.
 * @see drawFaceapiScaffold2d - Uses this for scaffold strokes.
 * @see drawLabels - Uses this for metric text.
 */
export function currentColor() {
   return COLORS[view.matchState] || COLORS.unknown;
}

/**
 * Computes the intrinsic-canvas to CSS-pixel scale so strokes, dots, and text
 * stay visually stable on mobile, high-resolution canvases, and the lab's
 * digital zoom. The bounding rect is used because it includes CSS transforms.
 *
 * @returns {number} Canvas-pixels per CSS pixel.
 * @see drawBox - Scales bbox stroke width.
 * @see drawMesh478 - Scales mesh dot radius.
 * @see drawFaceapiScaffold2d - Scales scaffold strokes and anchors.
 * @see drawLabels - Scales the metric label block.
 */
function cssScale() {
   const rect = canvas.getBoundingClientRect();
   const cssW = rect.width || canvas.clientWidth || canvas.width;
   return canvas.width / cssW;
}

/**
 * Strokes the live face bounding rectangle using the current match-state color
 * and scaled line width, making the box readable across the responsive canvas.
 *
 * @param {{x:number, y:number, width:number, height:number}} box - Bounding box in canvas pixels.
 * @returns {void}
 * @see renderOverlay - Draws the standard bbox mode.
 * @see drawFaceapiScaffold2d - Draws the fallback box for detailed 2D mode.
 */
function drawBox(box) {
   const scale = cssScale();
   ctx.save();
   ctx.lineWidth = LINE_WIDTH_CSS * scale;
   ctx.strokeStyle = currentColor();
   ctx.strokeRect(box.x, box.y, box.width, box.height);
   ctx.restore();
}

/**
 * Draws the cached MediaPipe 478-point face mesh as colored dots on the bbox
 * canvas. It only renders complete meshes so partial or malformed landmark
 * payloads do not leave misleading points on the video.
 *
 * @returns {void}
 * @see renderOverlay - Calls this for mesh and combined overlay modes.
 * @see onLandmarks3d - Supplies the cached mesh data this function reads.
 */
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

/**
 * Draws the detailed 2D face-api scaffold for the `2d` overlay mode: bounding
 * box, eye axis, eye contours, jaw, nose, mouth, anchor dots, and a small live
 * detection label. If detailed landmarks are not present, it falls back to the
 * standard bbox and metrics label.
 *
 * @returns {void}
 * @see renderOverlay - Calls this when `view.overlayMode` is `2d`.
 * @see overlayModeNeedsDetailedFaceapi - Requests the detailed landmark data needed here.
 * @see drawFaceapiScaffoldLabels - Draws the live-scope scaffold label.
 */
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

/**
 * Draws the label for the detailed 2D scaffold, explicitly marking it as the
 * live camera view. This matters because the top readout may describe the
 * Ghostyle-composited matcher result, so "live face detected" and "matcher sees
 * no face" can both be true without contradicting each other.
 *
 * @param {{x:number, y:number, width:number, height:number}} box - Detection box in canvas pixels.
 * @param {object} resized - Detailed face-api result already resized to canvas coordinates.
 * @param {number} scale - Canvas-pixels per CSS pixel.
 * @returns {void}
 * @see drawFaceapiScaffold2d - Calls this after drawing detailed landmarks.
 */
function drawFaceapiScaffoldLabels(box, resized, scale) {
   const lines = [t('overlay_face_detected_label')];
   if (typeof resized.age === 'number') lines.push(t('overlay_estimated_age_label', { age: Math.round(resized.age) }));
   if (resized.gender) lines.push(t('overlay_estimated_gender_label', { gender: resized.gender }));

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

/**
 * Resizes the cached face-api detection to the current bbox canvas dimensions,
 * preserving alignment after camera resize, device-pixel-ratio changes, or
 * overlay canvas resync.
 *
 * @returns {object|null} Resized face-api result, or null when no detection is cached.
 * @see drawFaceapiScaffold2d - Uses this for detailed 2D drawing.
 * @see getLastBox - Uses the same resize behavior for bbox extraction.
 */
function getResizedDetection() {
   if (!view.lastDetection) return null;
   return faceapi.resizeResults(view.lastDetection, {
      width: canvas.width,
      height: canvas.height,
   });
}

/**
 * Draws the metric label block next to the bounding box, showing live detection
 * confidence, current face-api distance, live face id, and obfuscated id drift
 * when a Ghostyle changes the nearest saved identity. The text is un-mirrored
 * when the webcam canvas is mirrored so it remains readable.
 *
 * @param {{x:number, y:number, width:number, height:number}} box - Bounding box in canvas pixels.
 * @param {number|null} score - Live detection score from face-api.
 * @returns {void}
 * @see renderOverlay - Calls this for standard bbox metrics.
 * @see drawFaceapiScaffold2d - Calls this when detailed landmarks are unavailable.
 * @see fmt - Formats each numeric metric shown in the label block.
 */
function drawLabels(box, score) {
   const lines = [
      `detection ${fmt(score, 2)}`,
      `distance  ${fmt(view.liveMinDist, 3)}`,
      `faceId    ${fmt(view.liveMinId, 0)}`,
   ];

   if (Number.isFinite(view.obfMinId) && view.obfMinId !== view.liveMinId) {
      lines.push(`ObfFaceId! ${fmt(view.obfMinId, 0)}`);
   }

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
