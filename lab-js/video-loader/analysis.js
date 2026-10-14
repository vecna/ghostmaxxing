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
 * Computes Euclidean distance between equal-length vectors. The Video Loader
 * uses this metric for face-api descriptors: `buildFaceBaseline()` uses it to
 * choose the representative descriptor and measure baseline spread, while the
 * controller uses it to compare later face-api checks with that baseline and
 * the configured `0.6` identity-distance threshold.
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
 * Computes cosine similarity between equal-length vectors. It is used only
 * for MediaPipe ImageEmbedder vectors from aligned face crops. The baseline
 * medoid and every later visual-drift sample use `1 - cosineSimilarity(...)`;
 * this value is a generic appearance-change signal, not an identity score.
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
 * Returns the median without mutating the caller's collection. Baseline
 * construction uses it to summarise face-api descriptor spread and the centre
 * of ImageEmbedder drift; `medianAbsoluteDeviation()` calls it again to derive
 * the adaptive visual-change threshold from baseline noise.
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
 * Picks the real vector with the smallest total distance to its peers. Both
 * baseline builders use this helper: cosine distance selects a representative
 * ImageEmbedder vector, and Euclidean distance selects a representative
 * face-api descriptor. Keeping an observed vector, instead of an arithmetic
 * mean, also lets the controller associate the visual baseline with a real
 * sampled timestamp.
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
 * Uses the human-selected ImageEmbedder vector as the actual baseline while
 * nearby vectors estimate normal visual noise. The Video Loader uses this
 * variant only for an explicitly anchored baseline, ensuring that later
 * visual drift is computed from the frame the person selected rather than a
 * medoid several seconds later.
 *
 * @param {Array<ArrayLike<number>>} embeddings Nearby stable embeddings.
 * @param {number} referenceIndex Index of the explicitly selected frame.
 * @param {object} [options] Adaptive-trigger tuning.
 * @param {number} [options.minimumDelta] Minimum drift above baseline noise.
 * @param {number} [options.madMultiplier] Robust-noise multiplier.
 * @returns {{embedding: number[], referenceIndex: number, medianDrift: number, mad: number, triggerThreshold: number, drifts: number[]}} Anchored baseline model.
 */
export function buildAnchoredEmbeddingBaseline(embeddings, referenceIndex, options = {}) {
   if (!embeddings[referenceIndex]) throw new Error('Anchored embedding baseline requires a valid reference index.');
   const minimumDelta = options.minimumDelta ?? 0.025;
   const madMultiplier = options.madMultiplier ?? 6;
   const embedding = Array.from(embeddings[referenceIndex]);
   const drifts = embeddings.map((candidate) => visualDrift(candidate, embedding));
   const medianDrift = median(drifts);
   const mad = medianAbsoluteDeviation(drifts);
   return {
      embedding,
      referenceIndex,
      medianDrift,
      mad,
      triggerThreshold: medianDrift + Math.max(minimumDelta, mad * madMultiplier),
      drifts,
   };
}

/**
 * Uses the face-api descriptor from the human-selected frame as the identity
 * baseline and measures nearby descriptor spread around it. The Video Loader
 * uses this for explicit baseline selection so every later L2 distance truly
 * originates from the visible baseline card.
 *
 * @param {Array<ArrayLike<number>>} descriptors Nearby stable descriptors.
 * @param {number} referenceIndex Index of the selected frame descriptor.
 * @returns {{descriptor: number[], referenceIndex: number, spread: number}} Anchored face-api baseline.
 */
export function buildAnchoredFaceBaseline(descriptors, referenceIndex) {
   if (!descriptors[referenceIndex]) throw new Error('Anchored face baseline requires a valid reference index.');
   const descriptor = Array.from(descriptors[referenceIndex]);
   const distances = descriptors.map((candidate) => euclideanDistance(candidate, descriptor));
   return {
      descriptor,
      referenceIndex,
      spread: median(distances),
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

         if (sample.comparable && sample.mediaTime - lastFaceApiAt >= heartbeatSeconds) {
            reasons.push('identity-heartbeat');
         }

         previousPresence = sample.facePresent;
         const outsideCooldown = sample.mediaTime - lastFaceApiAt >= minimumFaceApiGapSeconds;
         return {
            shouldVerify: sample.facePresent && sample.comparable && reasons.length > 0 && outsideCooldown,
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
