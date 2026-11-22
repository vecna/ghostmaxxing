/** @module workshop/recognition */
import { descriptorDistance, isFaceDescriptor } from '../face-descriptor.js';

export const MATCH_THRESHOLD = 0.58;
export const NEAR_MARGIN = 0.05;
export const HISTORY_MS = 8000;
export const SAMPLE_EXPIRY_MS = 1500;

/**
 * Result of comparing the current observation with the numbered archive.
 * @typedef {object} RecognitionReading
 * @property {string} status Matched, near, far, absent or empty.
 * @property {?number} id The closest face ID if one can be measured.
 * @property {?number} distance Euclidean distance to that face.
 */

/**
 * Ordered changes observed over a rolling time window.
 * @typedef {object} RecognitionHistory
 * @property {RecognitionReading} reading Latest observation.
 * @property {number} at Timestamp of the latest observation in milliseconds.
 * @property {object[]} segments Intervals grouped by verdict and face ID.
 */

/**
 * Recognition data clipped to the current time window.
 * @typedef {object} RecognitionView
 * @property {?RecognitionReading} reading Current unexpired observation.
 * @property {object[]} segments Visible intervals.
 */

/**
 * Classifies one observation against the closest saved face.
 * @param {object} options The current model sample and comparison settings.
 * @param {ArrayLike<number>|null} options.descriptor The detected descriptor, or null if absent.
 * @param {Array<{id: number, descriptor: ArrayLike<number>}>} options.faces The local archive.
 * @param {number} [options.threshold] The inclusive match boundary.
 * @param {number} [options.nearMargin] Distance above threshold treated as near.
 * @returns {RecognitionReading} Verdict and candidate.
 */
export function classifyRecognition({
   descriptor,
   faces,
   threshold = MATCH_THRESHOLD,
   nearMargin = NEAR_MARGIN,
}) {
   if (!faces.length) return { status: 'empty', id: null, distance: null };
   if (!isFaceDescriptor(descriptor)) return { status: 'absent', id: null, distance: null };

   let id = null;
   let distance = Infinity;
   for (const face of faces) {
      if (!isFaceDescriptor(face.descriptor)) continue;
      const candidate = descriptorDistance(descriptor, face.descriptor);
      if (candidate < distance || (candidate === distance && face.id < id)) {
         distance = candidate;
         id = face.id;
      }
   }
   if (id === null) return { status: 'empty', id: null, distance: null };
   const status = distance <= threshold ? 'matched' : distance <= threshold + nearMargin ? 'near' : 'far';
   return { status, id, distance };
}

/**
 * Appends a timestamped observation, retaining only the recent timeline.
 * Consecutive readings with the same verdict and ID form one segment. Long
 * breaks between observations remain gaps rather than extending the old verdict.
 * @param {?RecognitionHistory} history Previous history.
 * @param {RecognitionReading} reading Result from classifyRecognition.
 * @param {number} at Monotonic time in milliseconds.
 * @returns {RecognitionHistory} Updated history.
 */
export function appendReading(history, reading, at) {
   if (history && at < history.at) return history;
   const segments = history?.segments.filter(segment => segment.to >= at - HISTORY_MS) ?? [];
   const last = segments.at(-1);
   const from = history ? Math.min(at, history.at + SAMPLE_EXPIRY_MS) : at;
   if (last) segments[segments.length - 1] = { ...last, to: from };
   if (!last || from < at || last.status !== reading.status || last.id !== reading.id) {
      segments.push({ status: reading.status, id: reading.id, from: at, to: at });
   }
   return { reading, at, segments };
}

/**
 * Clips the scrollback to the current eight-second window and expires stale readings.
 * @param {?RecognitionHistory} history Recorded observations.
 * @param {number} now Monotonic time in milliseconds.
 * @returns {RecognitionView} Current result and visible intervals.
 */
export function recognitionView(history, now) {
   if (!history) return { reading: null, segments: [] };
   const start = now - HISTORY_MS;
   const last = history.segments.at(-1);
   const expiresAt = history.at + SAMPLE_EXPIRY_MS;
   const segments = history.segments
      .map(segment => ({
         ...segment,
         startedAt: segment.from,
         from: Math.max(segment.from, start),
         to: Math.min(segment === last ? expiresAt : segment.to, now),
      }))
      .filter(segment => segment.to > segment.from);
   return { reading: now <= expiresAt ? history.reading : null, segments };
}
