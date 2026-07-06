/** @module landmark-analysis */
import { state } from './state.js';
import { distance } from './utils.js';

/**
 * Converts a face-api descriptor distance into the "diversity" percentage used
 * by the Ghostmaxxing UI copy. Lower descriptor distances mean closer biometric
 * matches, so this display value is a user-facing scale for how different the
 * live or Ghostyle-composited face appears from the stored reference.
 *
 * @param {number} dist - face-api descriptor distance to display.
 * @returns {number} Rounded diversity percentage capped at 100.
 * @see decideMatchState - Formats match and elusion headlines with this scale.
 * @see renderInfo - Shows closest-distance diversity in the analysis panel.
 */
export function distanceToDiversity(dist) {
   if (!Number.isFinite(dist) || dist <= 0) return 0;
   return Math.min(100, Math.round(dist * 100));
}

/**
 * Finds the closest saved 2D biometric face for a live face-api result. This is
 * the baseline "before Ghostyle" lookup used to decide whether the camera view
 * currently matches a stored identity.
 *
 * @param {object|null|undefined} liveResult - face-api detection result from the live camera or analysis snapshot.
 * @param {object} [liveResult.detection] - Detection metadata containing the confidence score.
 * @param {number} [liveResult.detection.score] - face-api confidence score for the live face.
 * @param {Array<number>} [liveResult.descriptor] - face-api descriptor for nearest-neighbor matching.
 * @param {Array<object>} [dbFaces=state.db.faces] - Saved 2D face records to compare against.
 * @returns {{liveScore: number|null, liveMinDist: number|null, liveMinId: number|null}} Closest live match metrics.
 * @see findFace - Uses the result before evaluating an active Ghostyle.
 * @see autoFindLoop - Reuses this lookup for repeated automatic face searches.
 * @see composeAnalysisData - Uses this lookup for the analysis panel nearest-face summary.
 */
export function seekFaceInDb(liveResult, dbFaces = state.db?.faces || []) {
   const liveScore = liveResult?.detection?.score ?? null;
   const descriptor = liveResult?.descriptor;
   if (!descriptor || !Array.isArray(dbFaces) || dbFaces.length === 0) {
      return { liveScore, liveMinDist: null, liveMinId: null };
   }

   const distances = dbFaces.map((e) => ({
      id: e.id,
      distance: distance(descriptor, e.descriptor),
   })).sort((a, b) => a.distance - b.distance);

   const liveMinDist = distances.length ? distances[0].distance : null;
   const liveMinId = distances.length ? distances[0].id : null;
   return { liveScore, liveMinDist, liveMinId };
}

/**
 * Computes nearest-match metrics for the Ghostyle-composited face-api result.
 * In the project flow this measures whether makeup or an adversarial overlay
 * still resolves to a saved identity, produces only a weak detection, or makes
 * face-api fail to find a face at all.
 *
 * @param {object|null|undefined} composite - Output from compositing the live frame with the active Ghostyle.
 * @param {object} [composite.obfuscatedResult] - face-api result detected on the composited Ghostyle image.
 * @param {object} [composite.obfuscatedResult.detection] - Detection metadata for the composited image.
 * @param {number} [composite.obfuscatedResult.detection.score] - face-api confidence score for the composited image.
 * @param {Array<number>} [composite.obfuscatedResult.descriptor] - face-api descriptor extracted from the composited image.
 * @param {boolean} [composite.weakDetection] - Whether the composited image was detected only weakly.
 * @param {Array<object>} [dbFaces=state.db.faces] - Saved 2D face records to compare against.
 * @returns {{obfScore: number|null, obfMinDist: number|null, obfMinId: number|null, weakDetection: boolean, detectionTotallyFailed: boolean}} Ghostyle-composite match metrics.
 * @see compositeAndDetect - Produces the composite object passed into this helper.
 * @see evaluateMatch - Calls this before building the final match/elusion detail.
 */
export function computeCompositeMetrics(composite, dbFaces = state.db?.faces || []) {
   if (!composite || !composite.obfuscatedResult) {
      return {
         obfScore: null,
         obfMinDist: null,
         obfMinId: null,
         weakDetection: !!composite?.weakDetection,
         detectionTotallyFailed: true,
      };
   }

   const obfScore = composite.obfuscatedResult?.detection?.score ?? null;
   const descriptor = composite.obfuscatedResult?.descriptor;
   const distances = Array.isArray(dbFaces)
      ? dbFaces.map((e) => ({ id: e.id, distance: distance(descriptor, e.descriptor) })).sort((a, b) => a.distance - b.distance)
      : [];

   const obfMinDist = distances.length ? distances[0].distance : null;
   const obfMinId = distances.length ? distances[0].id : null;

   return {
      obfScore,
      obfMinDist,
      obfMinId,
      weakDetection: !!composite.weakDetection,
      detectionTotallyFailed: false,
   };
}

/**
 * Converts live and Ghostyle-composited 2D match metrics into the app's final
 * match state and Italian user-facing headline. The branches distinguish a
 * clear live match, no saved-face match, a Ghostyle that still matches a saved
 * identity (`unclear`), weak composited detection, and total face-api failure on
 * the composited image.
 *
 * @param {object} metrics - Combined live and obfuscated face-api metrics.
 * @param {number|null} metrics.liveMinDist - Closest live descriptor distance before applying a Ghostyle.
 * @param {number|null} metrics.liveMinId - Saved face id closest to the live descriptor.
 * @param {number|null} metrics.obfMinDist - Closest descriptor distance after Ghostyle compositing.
 * @param {number|null} metrics.obfMinId - Saved face id closest to the Ghostyle-composited descriptor.
 * @param {boolean} metrics.weakDetection - Whether face-api only weakly detected the composited image.
 * @param {boolean} metrics.detectionTotallyFailed - Whether face-api found no face in the composited image.
 * @param {number} [metrics.matchThreshold=state.MATCH_THRESHOLD] - face-api distance threshold for a saved-face match.
 * @returns {{detectionState: 'matched'|'eluded'|'unclear', headline: string, distance: number|null, matchedId: number|null}} Final UI state for the 2D match readout.
 * @see evaluateMatch - Uses this decision for scan and efficacy result details.
 * @see composeAnalysisData - Uses this decision for analysis-panel narrative text.
 */
export function decideMatchState({
   liveMinDist,
   liveMinId,
   obfMinDist,
   obfMinId,
   weakDetection,
   detectionTotallyFailed,
   matchThreshold = state.MATCH_THRESHOLD,
}) {
   const thresholdDiversity = distanceToDiversity(matchThreshold);

   if (obfMinDist != null || weakDetection || detectionTotallyFailed) {
      if (typeof obfMinId === 'number' && obfMinDist <= matchThreshold) {
         const obfDiversity = distanceToDiversity(obfMinDist);
         return {
            detectionState: 'unclear',
            headline: `Il rilevatore con il Ghostyle vede il volto con ID ${obfMinId} - diversita ${obfDiversity}%.`,
            distance: obfMinDist,
            matchedId: obfMinId,
         };
      }
      if (detectionTotallyFailed) {
         return {
            detectionState: 'eluded',
            headline: 'Rilevatore ingannato dal Ghostyle! face-api non trova un volto nel disegno composito.',
            distance: obfMinDist,
            matchedId: null,
         };
      }
      if (weakDetection) {
         return {
            detectionState: 'eluded',
            headline: 'Individuazione sul Ghostyle con bassa confidenza (face-api non vede chiaramente un volto).',
            distance: obfMinDist,
            matchedId: null,
         };
      }

      const obfDiversity = distanceToDiversity(obfMinDist);
      return {
         detectionState: 'eluded',
         headline: `Ghostyle attivo: volto rilevato ma diversita ${obfDiversity}% sopra soglia ${thresholdDiversity}%.`,
         distance: obfMinDist,
         matchedId: null,
      };
   }

   if (typeof liveMinDist === 'number' && liveMinDist <= matchThreshold) {
      const liveDiversity = distanceToDiversity(liveMinDist);
      return {
         detectionState: 'matched',
         headline: `Corrispondenza trovata: ID ${liveMinId} (diversita ${liveDiversity}% sotto soglia ${thresholdDiversity}%).`,
         distance: liveMinDist,
         matchedId: liveMinId,
      };
   }

   const liveDiversity = distanceToDiversity(liveMinDist);
   return {
      detectionState: 'eluded',
      headline: `Nessuna corrispondenza: diversita ${liveDiversity}% sopra soglia ${thresholdDiversity}%.`,
      distance: liveMinDist,
      matchedId: null,
   };
}
