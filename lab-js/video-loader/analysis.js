/**
 * @module video-loader/analysis
 * @description
 * Pure numerical helpers and trigger policy for the seekable-video analyser.
 * The module deliberately has no DOM or model dependencies so thresholds,
 * baseline selection, and event decisions can be tested without loading the
 * large vendored runtimes.
 */

/** Default face-api descriptor distance used by the vendored FaceMatcher. */
export const DEFAULT_FACE_DISTANCE_THRESHOLD = 0.6;

/**
 * Computes Euclidean distance between equal-length vectors.
 *
 * @param {ArrayLike<number>} left First vector.
 * @param {ArrayLike<number>} right Second vector.
 * @returns {number} L2 distance.
 * @throws {Error} When vector lengths differ.
 */
export function euclideanDistance(left, right) {
   if (left.length !== right.length) throw new Error('Vectors must have the same length.');
   let sum = 0;
   for (let index = 0; index < left.length; index += 1) {
      const delta = left[index] - right[index];
      sum += delta * delta;
   }
   return Math.sqrt(sum);
}

/**
 * Computes cosine similarity between equal-length vectors.
 *
 * @param {ArrayLike<number>} left First vector.
 * @param {ArrayLike<number>} right Second vector.
 * @returns {number} Similarity in the range -1..1, or zero for a zero vector.
 * @throws {Error} When vector lengths differ.
 */
export function cosineSimilarity(left, right) {
   if (left.length !== right.length) throw new Error('Vectors must have the same length.');
   let dot = 0;
   let leftNorm = 0;
   let rightNorm = 0;
   for (let index = 0; index < left.length; index += 1) {
      dot += left[index] * right[index];
      leftNorm += left[index] * left[index];
      rightNorm += right[index] * right[index];
   }
   const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
   return denominator === 0 ? 0 : dot / denominator;
}

/**
 * Returns the median without mutating the caller's collection.
 *
 * @param {number[]} values Numeric values.
 * @returns {number} Median, or zero for an empty collection.
 */
export function median(values) {
   if (!values.length) return 0;
   const sorted = [...values].sort((left, right) => left - right);
   const middle = Math.floor(sorted.length / 2);
   return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Computes median absolute deviation, a robust estimate of baseline noise.
 *
 * @param {number[]} values Numeric values.
 * @returns {number} Median absolute deviation.
 */
export function medianAbsoluteDeviation(values) {
   const centre = median(values);
   return median(values.map((value) => Math.abs(value - centre)));
}

/**
 * Picks the real vector with the smallest total distance to its peers.
 *
 * @param {Array<ArrayLike<number>>} vectors Candidate vectors.
 * @param {function(ArrayLike<number>, ArrayLike<number>): number} metric Distance metric.
 * @returns {{vector: number[], index: number, distances: number[]}} Medoid and distances to it.
 * @throws {Error} When no vector is provided.
 */
export function vectorMedoid(vectors, metric) {
   if (!vectors.length) throw new Error('vectorMedoid() requires at least one vector.');
   let bestIndex = 0;
   let bestTotal = Infinity;
   for (let left = 0; left < vectors.length; left += 1) {
      let total = 0;
      for (let right = 0; right < vectors.length; right += 1) {
         if (left !== right) total += metric(vectors[left], vectors[right]);
      }
      if (total < bestTotal) {
         bestTotal = total;
         bestIndex = left;
      }
   }
   const vector = Array.from(vectors[bestIndex]);
   return {
      vector,
      index: bestIndex,
      distances: vectors.map((candidate) => metric(candidate, vector)),
   };
}

/**
 * Builds a robust ImageEmbedder baseline and its adaptive drift threshold.
 *
 * ImageEmbedder is a generic visual model, not a biometric matcher. The
 * threshold therefore comes from the current video's stable baseline rather
 * than a universal identity claim.
 *
 * @param {Array<ArrayLike<number>>} embeddings Stable aligned-face embeddings.
 * @param {object} [options] Threshold tuning.
 * @param {number} [options.minimumDelta] Minimum drift above baseline noise.
 * @param {number} [options.madMultiplier] Robust-noise multiplier.
 * @returns {{embedding: number[], medoidIndex: number, medianDrift: number, mad: number, triggerThreshold: number, drifts: number[]}} Baseline model.
 */
export function buildEmbeddingBaseline(embeddings, options = {}) {
   const minimumDelta = options.minimumDelta ?? 0.025;
   const madMultiplier = options.madMultiplier ?? 6;
   const result = vectorMedoid(embeddings, (left, right) => 1 - cosineSimilarity(left, right));
   const medianDrift = median(result.distances);
   const mad = medianAbsoluteDeviation(result.distances);
   return {
      embedding: result.vector,
      medoidIndex: result.index,
      medianDrift,
      mad,
      triggerThreshold: medianDrift + Math.max(minimumDelta, mad * madMultiplier),
      drifts: result.distances,
   };
}

/**
 * Builds the face-api descriptor baseline as a medoid and reports its spread.
 *
 * @param {Array<ArrayLike<number>>} descriptors Stable face-api descriptors.
 * @returns {{descriptor: number[], medoidIndex: number, spread: number}} Baseline descriptor.
 */
export function buildFaceBaseline(descriptors) {
   const result = vectorMedoid(descriptors, euclideanDistance);
   return {
      descriptor: result.vector,
      medoidIndex: result.index,
      spread: median(result.distances),
   };
}

/**
 * Computes ImageEmbedder visual drift from a baseline embedding.
 *
 * @param {ArrayLike<number>} embedding Current aligned-face embedding.
 * @param {ArrayLike<number>} baseline Baseline aligned-face embedding.
 * @returns {number} Cosine distance where zero means identical direction.
 */
export function visualDrift(embedding, baseline) {
   return 1 - cosineSimilarity(embedding, baseline);
}

/**
 * Creates the stateful policy that decides when expensive face-api work is
 * justified. The policy retains numeric samples only; it never retains frames.
 *
 * @param {object} [options] Trigger policy overrides.
 * @param {number} [options.heartbeatSeconds=4] Maximum gap between identity checks.
 * @param {number} [options.minimumFaceApiGapSeconds=0.75] Cooldown between expensive checks.
 * @param {number} [options.jumpDelta=0.035] Single-sample visual-drift jump.
 * @param {number} [options.requiredVotes=2] Above-threshold samples required.
 * @param {number} [options.voteWindow=3] Recent samples considered for votes.
 * @returns {{evaluate: Function, markFaceApi: Function, reset: Function}} Trigger detector.
 */
export function createTriggerDetector(options = {}) {
   const heartbeatSeconds = options.heartbeatSeconds ?? 4;
   const minimumFaceApiGapSeconds = options.minimumFaceApiGapSeconds ?? 0.75;
   const jumpDelta = options.jumpDelta ?? 0.035;
   const requiredVotes = options.requiredVotes ?? 2;
   const voteWindow = options.voteWindow ?? 3;

   let previousPresence = null;
   let previousDrift = null;
   let lastFaceApiAt = -Infinity;
   /** @type {boolean[]} */
   let recentVotes = [];

   return {
      /**
       * Evaluates one lightweight sample.
       *
       * @param {{mediaTime: number, facePresent: boolean, comparable: boolean, visualDrift: number|null, visualThreshold: number|null}} sample Current sample.
       * @returns {{shouldVerify: boolean, reasons: string[], observations: string[]}} Trigger decision.
       */
      evaluate(sample) {
         const reasons = [];
         const observations = [];

         if (previousPresence !== null && sample.facePresent !== previousPresence) {
            observations.push(sample.facePresent ? 'mediapipe-face-returned' : 'mediapipe-face-lost');
            if (sample.facePresent) reasons.push('mediapipe-face-returned');
         }

         if (sample.comparable && sample.visualDrift !== null && sample.visualThreshold !== null) {
            const aboveThreshold = sample.visualDrift > sample.visualThreshold;
            recentVotes.push(aboveThreshold);
            recentVotes = recentVotes.slice(-voteWindow);
            const votes = recentVotes.filter(Boolean).length;
            if (recentVotes.length >= requiredVotes && votes >= requiredVotes) reasons.push('visual-drift-sustained');

            if (previousDrift !== null && sample.visualDrift - previousDrift > jumpDelta) {
               reasons.push('visual-drift-jump');
            }
            previousDrift = sample.visualDrift;
         } else {
            recentVotes = [];
         }

         if (sample.facePresent && sample.mediaTime - lastFaceApiAt >= heartbeatSeconds) {
            reasons.push('identity-heartbeat');
         }

         previousPresence = sample.facePresent;
         const outsideCooldown = sample.mediaTime - lastFaceApiAt >= minimumFaceApiGapSeconds;
         return {
            shouldVerify: sample.facePresent && reasons.length > 0 && outsideCooldown,
            reasons: [...new Set(reasons)],
            observations,
         };
      },

      /**
       * Records completion of a face-api pass.
       *
       * @param {number} mediaTime Video timestamp in seconds.
       * @returns {void}
       */
      markFaceApi(mediaTime) {
         lastFaceApiAt = mediaTime;
      },

      /**
       * Clears temporal state before analysing another source.
       *
       * @returns {void}
       */
      reset() {
         previousPresence = null;
         previousDrift = null;
         lastFaceApiAt = -Infinity;
         recentVotes = [];
      },
   };
}
