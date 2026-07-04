/** @module engine */
import { state } from './state.js';
import { els, clearOverlay } from './dom.js';
import { avgPoint, drawClosedPath, drawOpenPath, roundRect } from './utils.js';
import { resizeCanvas } from './camera.js';
import { persistDb, renderDbStats } from './db.js';
import { setLog } from './utils.js';
import { DETECTOR_OPTIONS } from './config.js';
import { overlayModeNeedsDetailedFaceapi, view as overlayView } from './bbox-overlay.js';
import { computeCompositeMetrics, decideMatchState } from './landmark-analysis.js';

export { seekFaceInDb, computeCompositeMetrics, decideMatchState } from './landmark-analysis.js';

/**
 * Detect a face in the webcam video and optionally draw an overlay.
 * Returns the face detection result or null if no face is found.
 * @param {boolean} drawOverlay - Whether to draw the detection overlay.
 * @returns {Promise<Object|null>} Detection result, faceapi object.
 * @see saveFace - uses detectFaceInCam before saving a face.
 * @see findFace - uses detectFaceInCam to compare against stored faces.
 * @see computeCompositeMetrics - uses detectFaceInCam as the baseline detection.
 */
export async function detectFaceInCam(drawOverlay) {
   clearOverlay();
   try {
      if (!faceapi || !faceapi.detectSingleFace) {
         setLog('[ERROR] face-api modelli non caricati. Riprova tra pochi secondi.');
         state.lastKnownEffectResult = null;
         return null;
      }
      const result = await faceapi.detectSingleFace(els.video, DETECTOR_OPTIONS)
         .withFaceLandmarks()
         .withAgeAndGender()
         .withFaceDescriptor();

      if (!result) {
         state.lastKnownEffectResult = null;
         setLog('Nessun volto rilevato nella webcam.');
         return null;
      }

      if (drawOverlay) drawResult(result);
      return result;
   } catch (err) {
      console.error('[detectFaceInCam]', err);
      const msg = err?.message || String(err);
      setLog(`[ERRORE face-api] ${msg}`);
      state.lastKnownEffectResult = null;
      return null;
   }
}

export function triggerOverlayFadeout() {
   els.overlay.style.transition = 'none';
   els.overlay.style.opacity = '1';
   void els.overlay.offsetHeight; // force reflow
   els.overlay.style.transition = 'opacity 2s ease-in-out';

   if (state.overlayFadeTimeout) clearTimeout(state.overlayFadeTimeout);
   state.overlayFadeTimeout = setTimeout(() => {
      els.overlay.style.opacity = '0';
   }, 5000);
}

/**
 * Build a canvas with video compositing, 2D ghostly overlay, and optional 3D plugin (via event).
 * Executes a Face API detection with landmarks and descriptor on the composite.
 * Returns an object containing the canvas, obfuscatedResult, and weakDetection flag.
 * If detection with the normal threshold (`scoreThreshold: 0.5`) fails, it retries with a relaxed threshold (0.1) to still extract numeric metrics from the composite —
 * useful as a "makeup efficacy indicator" even beyond the detection threshold.
 * `weakDetection` indicates when a fallback detection was required.
 * @param {Object} liveResult - Result from the live face detection.
 * @returns {Promise<Object>} An object with canvas, obfuscatedResult, and weakDetection.
 * @see findFace - uses this function to obtain a composite for post‑makeup comparison.
 * @see computeCompositeMetrics - uses detectFaceInCam as the baseline detection.
 */
export async function compositeAndDetect(liveResult) {
   const canvas = document.createElement('canvas');
   canvas.width = els.overlay.width;
   canvas.height = els.overlay.height;
   const ctx = canvas.getContext('2d');

   ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);

   const style = state.loadedGhostyles.get(state.activeEffect);
   if (style && style.module.onDraw) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const resized = faceapi.resizeResults(liveResult, { width: canvas.width, height: canvas.height });

      if (!resized.detection) {
         console.log('resized.detection non disponibile:', resized);
      } else {
         style.module.onDraw(ctx, resized.landmarks, resized.detection.box);
         ctx.restore();
      }
   }

   state.gstmxxEvents.dispatchEvent(new CustomEvent('beforeEfficacyComposite', {
      detail: { canvas, ctx, liveResult }
   }));

   try {
      let obfuscatedResult = await faceapi.detectSingleFace(canvas, DETECTOR_OPTIONS)
         .withFaceLandmarks()
         .withFaceDescriptor();
      let weakDetection = false;
      if (!obfuscatedResult) {
         const weakOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.1 });
         obfuscatedResult = await faceapi.detectSingleFace(canvas, weakOpts)
            .withFaceLandmarks()
            .withFaceDescriptor();
         weakDetection = !!obfuscatedResult;
      }
      return { canvas, obfuscatedResult, weakDetection };
   } catch (err) {
      console.error('[compositeAndDetect]', err);
      return { canvas, obfuscatedResult: null, weakDetection: false };
   }
}

/**
 * Run a single effect pass: performs face detection (with optional landmarks) and draws the effect overlay.
 * Manages state flags to avoid concurrent inference.
 * @returns {Promise<boolean>} Whether the overlay should be cleared (no face detected without active effect).
 * @see drawGhostyleOverlay - invoked to render the effect.
 * @see detectFaceInCam - used internally for detection when an active effect is present.
 */
export async function runEffectPass() {
   if (state.isSystemBusy || state.effectInferenceInFlight || els.video.readyState < 2) return;
   state.effectInferenceInFlight = true;
   let retToCleanOverlay = false; // do not clean except if no face detected and no active effect, otherwise keep last overlay
   try {
      if (!faceapi || !faceapi.detectSingleFace) return;
      const detector = faceapi.detectSingleFace(els.video, DETECTOR_OPTIONS);
      let result = null;
      if (state.activeEffect) {
         result = await detector.withFaceLandmarks();
      } else if (overlayModeNeedsDetailedFaceapi(overlayView.overlayMode)) {
         result = await detector.withFaceLandmarks().withAgeAndGender();
      } else {
         result = await detector;
      }

      if (!result) {
         state.lastKnownEffectResult = null;
         if (state.activeEffect)
            retToCleanOverlay = true;
      } else if (state.activeEffect) {
         drawGhostyleOverlay(result, false);
      } else {
         state.lastKnownEffectResult = result;
      }

      state.gstmxxEvents.dispatchEvent(new CustomEvent('detection', {
         detail: { result: result || null, activeEffect: state.activeEffect }
      }));
   } catch (err) {
      console.error(err);
   } finally {
      state.effectInferenceInFlight = false;
   }
   return retToCleanOverlay;
}

/**
 * Draw the effect overlay onto the canvas, optionally including the detection scaffold.
 * Resizes the canvas, clears previous drawings, and renders the active effect style if present.
 * @param {Object} result - Face detection result.
 * @param {boolean} [includeDetectionScaffold=false] - Whether to draw the detection scaffold.
 * @see runEffectPass - calls this to render overlay after detection.
 * @see drawDetectionScaffold - optionally used when includeDetectionScaffold is true.
 */
export function drawGhostyleOverlay(result, includeDetectionScaffold = false) {
   resizeCanvas(els);
   const ctx = els.overlay.getContext('2d');
   ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
   const resized = faceapi.resizeResults(result, { width: els.overlay.width, height: els.overlay.height });
   if (!resized.detection) {
      console.log("drawGhostyleOverlay: no detection?", resized);
      // messo questo log perché a volte è undefined?
      return;
   }
   if (includeDetectionScaffold) drawDetectionScaffold(resized);
   if (state.activeEffect) {
      const style = state.loadedGhostyles.get(state.activeEffect);
      if (style && style.module.onDraw) {
         ctx.save();
         ctx.lineCap = 'round';
         ctx.lineJoin = 'round';
         style.module.onDraw(ctx, resized.landmarks, resized.detection.box);
         ctx.restore();
      }
   }
   state.lastKnownEffectResult = result;
}

/**
 * Draw visual scaffolding for a detection result: bounding box, eye line, and facial landmarks.
 * Useful for debugging and user feedback.
 * @param {CanvasRenderingContext2D} ctx - Canvas context to draw on.
 * @param {Object} resized - Resized detection result containing box and landmarks.
 * @see drawGhostyleOverlay - may call this when includeDetectionScaffold is true.
 * @see drawResult - calls this to display detection scaffold.
 */
export function drawDetectionScaffold(ctx, resized) {
   const box = resized.detection.box;
   const landmarks = resized.landmarks;
   const leftEye = landmarks.getLeftEye();
   const rightEye = landmarks.getRightEye();
   const nose = landmarks.getNose();
   const jaw = landmarks.getJawOutline();
   const mouth = landmarks.getMouth();

   ctx.save();
   ctx.lineWidth = 2.2;
   ctx.strokeStyle = 'rgba(122, 162, 255, 0.95)';
   ctx.strokeRect(box.x, box.y, box.width, box.height);

   const leftCenter = avgPoint(leftEye);
   const rightCenter = avgPoint(rightEye);
   ctx.beginPath();
   ctx.moveTo(leftCenter.x, leftCenter.y);
   ctx.lineTo(rightCenter.x, rightCenter.y);
   ctx.stroke();

   ctx.strokeStyle = 'rgba(255, 122, 122, 0.85)';
   drawClosedPath(ctx, leftEye, null, 'rgba(255, 122, 122, 0.85)', 2);
   drawClosedPath(ctx, rightEye, null, 'rgba(255, 122, 122, 0.85)', 2);

   ctx.strokeStyle = 'rgba(159, 122, 234, 0.88)';
   drawOpenPath(ctx, jaw, 'rgba(159, 122, 234, 0.88)', 2);
   ctx.strokeStyle = 'rgba(61, 220, 151, 0.88)';
   drawOpenPath(ctx, nose, 'rgba(61, 220, 151, 0.88)', 2);
   ctx.strokeStyle = 'rgba(255, 204, 102, 0.88)';
   drawClosedPath(ctx, mouth, null, 'rgba(255, 204, 102, 0.88)', 2);

   ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
   [leftCenter, rightCenter, avgPoint(nose.slice(3)), avgPoint(mouth.slice(0, 7))].forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
   });

   const lines = ['volto rilevato'];
   if (typeof resized.age === 'number') lines.push(`eta stimata: ${Math.round(resized.age)}`);
   if (resized.gender) lines.push(`genere stimato: ${resized.gender}`);

   ctx.font = '14px Inter, system-ui, sans-serif';
   const pad = 6;
   const lineHeight = 18;
   const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
   const boxWidth = maxWidth + pad * 2;
   const boxHeight = lines.length * lineHeight + pad * 2;
   const startX = box.x;
   const startY = Math.max(16, box.y - boxHeight - 8);

   if (state.isMirrored) {
      ctx.translate(startX + boxWidth / 2, startY + boxHeight / 2);
      ctx.scale(-1, 1);
      ctx.translate(-(startX + boxWidth / 2), -(startY + boxHeight / 2));
   }

   ctx.fillStyle = 'rgba(15, 17, 21, 0.78)';
   ctx.strokeStyle = 'rgba(255,255,255,0.10)';
   ctx.lineWidth = 1;
   roundRect(ctx, startX, startY, boxWidth, boxHeight, 8);
   ctx.fill();
   ctx.stroke();

   ctx.fillStyle = 'rgba(238, 242, 255, 0.96)';
   lines.forEach((line, i) => {
      ctx.fillText(line, startX + pad, startY + pad + (i + 1) * lineHeight - 4);
   });
   ctx.restore();
}

/**
 * Draw the detection result on the overlay canvas, including the detection scaffold and any active effect.
 * @param {Object} result - Detection result.
 * @see drawDetectionScaffold - used to draw scaffold.
 * @see drawGhostyleOverlay - effect drawing is performed here if active.
 */
export function drawResult(result) {
   resizeCanvas(els);
   const ctx = els.overlay.getContext('2d');
   ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
   const resized = faceapi.resizeResults(result, { width: els.overlay.width, height: els.overlay.height });
   drawDetectionScaffold(ctx, resized);
   if (state.activeEffect) {
      const style = state.loadedGhostyles.get(state.activeEffect);
      if (style && style.module.onDraw) {
         ctx.save();
         ctx.lineCap = 'round';
         ctx.lineJoin = 'round';
         style.module.onDraw(ctx, resized.landmarks, resized.detection.box);
         ctx.restore();
      }
   }
   state.lastKnownEffectResult = result;
}


/**
 * Capture the current face, save its descriptor and metadata to the local database, and log the action.
 * @see detectFaceInCam - obtains the face data to be saved.
 */
export async function saveFace() {
   const result = await detectFaceInCam(true);
   if (!result) return;
   triggerOverlayFadeout();
   const id = state.db.nextId;
   state.db.nextId += 1;
   state.db.faces.push({
      id,
      descriptor: Array.from(result.descriptor),
      landmarks: result.landmarks?.positions
         ? result.landmarks.positions.map((p) => ({ x: p.x, y: p.y }))
         : null,
      age: Math.round(result.age),
      gender: result.gender || null,
      savedAt: new Date().toISOString()
   });
   persistDb();
   renderDbStats();
   const score = result.detection.score;
   setLog(`Impronta biometrica salvata con ID ${id}. Detection score: ${score.toFixed(2)}.`);
   return { id, result };
}

// This function shares the helper that are private, and so it can be 
// used by the auto-loop-search-face
export function evaluateMatch(liveInfo, composite) {
   const { liveMinDist, liveMinId } = liveInfo;

   // here some boolean are computed to help the generation of color/message

   const m = composite ? computeCompositeMetrics(composite) : {
      obfScore: null,
      obfMinDist: null,
      obfMinId: null,
      weakDetection: false,
      detectionTotallyFailed: false
   };

   const { detectionState, headline, distance, matchedId } = decideMatchState({
      liveMinDist,
      liveMinId,
      ...m,
   });

   return {
      headline,
      detail: {
         detectionState,
         distance,
         matchedId,
         ghostylePresent: !!composite,
         liveMinDist,
         liveMinId,
         obfMinDist: m.obfMinDist,
         obfMinId: m.obfMinId,
      },
   };
}

/**
 * Determine whether a 2D or 3D effect plugin is currently active.
 * @returns {boolean} True if an effect plugin is active.
 * @see findFace - checks plugin status before compositing.
 */
export function hasActivePlugin() {
   const G = window.gstmxx;
   const a2d = typeof G.getActiveEffect === 'function' && G.getActiveEffect();
   const a3d = typeof G.getActiveEffect3d === 'function' && G.getActiveEffect3d();
   return !!(a2d || a3d);
   // state.activeEffect = string with the effect name
}


