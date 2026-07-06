/**
 * @module auto-find-loop
 * @description
 * Silent auto-find loop for the Ghostmaxxing lab page.
 *
 * Every few seconds this add-on repeats the "find face" pipeline without
 * writing user-facing log text: it detects the live face descriptor, composites
 * and re-detects when a 2D or 3D Ghostyle is active, computes the nearest
 * distances/similarities against the local databases, and dispatches a unified
 * `matchStateChanged` payload.
 *
 * Textual logs remain reserved for explicit user actions such as the "find
 * face" button. Live feedback is rendered by `bbox-overlay.js` and `lab-ui.js`,
 * which listen for the auto payload and update the box/readout metrics.
 *
 * Auto-pause behavior: when models/video/database inputs are not ready or no
 * face is detected, the current tick exits without changing the UI. The loop
 * also allows one interval of startup stabilization before the first scan.
 */

import { compositeAndDetect, evaluateMatch, detectFaceInCam, hasActivePlugin, seekFaceInDb } from './engine.js';
import { findFace3d, evaluateMatch3d } from './engine-3d.js';
import { state } from './state.js';

window.addEventListener('ghostatiReady', autoFindLoop, { once: true });

/**
 * Starts the silent polling loop after the main app has initialized `state`,
 * `window.gstmxx`, the webcam, and plugin infrastructure. The first interval is
 * skipped to give face-api, MediaPipe, and camera state a short stabilization
 * window before auto metrics begin updating the overlay.
 *
 * @returns {void}
 * @see main - Dispatches `ghostatiReady` once the lab environment is ready.
 * @see tick - Performs each silent 2D/3D matching pass.
 * @see renderReadout - Receives the auto `matchStateChanged` payload through the event bus.
 * @see onMatchStateChanged - Updates the bbox overlay from auto match-state events.
 */
function autoFindLoop() {
   const INTERVAL_MS = 2000;
   let tickCount = 0;

   setInterval(async () => {
      tickCount++;
      if (tickCount < 2) return; // allow brief stabilization
      await tick();
   }, INTERVAL_MS);
}

/**
 * Runs one silent auto-find pass. It detects the live face, builds the 2D
 * face-api section when the 2D database has records, builds the 3D MediaPipe
 * ImageEmbedder section, derives the combined overall state, and dispatches
 * `matchStateChanged` with `source: 'auto'` so overlays update without applying
 * the suppression used for explicit scan/save/find actions.
 *
 * Errors are logged only to the developer console to avoid spamming the lab log;
 * the UI keeps showing the last known match state until a later tick succeeds.
 *
 * @returns {Promise<void>} Resolves after the pass dispatches or exits early.
 * @see detectFaceInCam - Provides the live face-api detection and descriptor.
 * @see evaluateMatch - Converts live and composited 2D metrics into payload detail.
 * @see findFace3d - Produces live and composited 3D ImageEmbedder metrics.
 * @see evaluateMatch3d - Converts 3D metrics into the `mediapipe` payload section.
 * @see renderReadout - Displays auto distance/readout metrics in the lab UI.
 * @see onMatchStateChanged - Colors and labels the bbox overlay from this payload.
 */
async function tick() {
   try {
      const liveResult = await detectFaceInCam(false);
      if (!liveResult) return;

      // ── 2D (face-api) ───────────────────────────────────────────────────────
      let faceapiSection = null;
      if (state.db.faces.length > 0) {
         const liveInfo   = seekFaceInDb(liveResult);
         const composite  = hasActivePlugin() ? await compositeAndDetect(liveResult) : null;
         const { detail } = evaluateMatch(liveInfo, composite);
         faceapiSection = {
            detectionState: detail.detectionState,
            distance:       detail.distance,
            matchedId:      detail.matchedId,
            liveMinDist:    liveInfo.liveMinDist,
            liveMinId:      liveInfo.liveMinId,
            obfMinDist:     detail.obfMinDist ?? null,
            obfMinId:       detail.obfMinId   ?? null,
         };
      }

      // ── 3D (MobileNet) ──────────────────────────────────────────────────────
      const result3d         = await findFace3d();
      const mediapipeSection = evaluateMatch3d(result3d);

      // ── overall ─────────────────────────────────────────────────────────────
      const f = faceapiSection?.detectionState;
      const m = mediapipeSection?.detectionState;
      const overall = (!f && !m)              ? 'unknown'
         : (!f || !m)                         ? 'unknown'
         : (f === m)                          ? f
         :                                      'partial-elusion';

      state.gstmxxEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
         detail: {
            source: 'auto',
            ghostylePresent: hasActivePlugin(),
            faceapi:    faceapiSection,
            mediapipe:  mediapipeSection,
            overall,
         }
      }));
   } catch (err) {
      console.error('[auto-find-loop] tick error:', err);
   }
}
