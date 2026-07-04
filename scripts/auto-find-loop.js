/**
 * @module auto-find-loop
 * @description
 * Auto-find loop — add-on per ghostati.html
 *
 * Ogni N secondi rifà la pipeline di "trova faccia" in modo silenzioso:
 * - detection live con descrittore
 * - se c'è un plugin attivo (2D o 3D), compositing + ri-detection per ottenere
 *   il descrittore post-makeup
 * - calcolo distanze min vs DB e dispatch di `matchStateChanged`
 *
 * Non scrive log testuali (lo fa solo il pulsante "trova faccia"). Si appoggia
 * a `bbox-overlay.js` per la visualizzazione delle metriche live accanto al box.
 *
 * Auto-pause: se il video non è pronto, il DB è vuoto, o non viene rilevato un
 * volto, il tick viene saltato. Lock: se un pass è ancora in volo (composite +
 * detection può richiedere ~100-200ms), il tick successivo viene saltato.
 */

import { compositeAndDetect, evaluateMatch, detectFaceInCam, hasActivePlugin, seekFaceInDb } from './engine.js';
import { findFace3d, evaluateMatch3d } from './engine-3d.js';
import { state } from './state.js';

window.addEventListener('ghostatiReady', autoFindLoop, { once: true });

function autoFindLoop() {
   const INTERVAL_MS = 2000;
   let tickCount = 0;

   setInterval(async () => {
      tickCount++;
      // Guard: skip early ticks if models not ready
      if (tickCount < 2) return; // allow brief stabilization
      await tick();
   }, INTERVAL_MS);
}

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
      // Silently fail — don't spam logs, let UI show last known state
   }
}
