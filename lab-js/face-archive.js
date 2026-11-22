/** @module face-archive */
import { isFaceDescriptor } from './face-descriptor.js';

export const FACE_ARCHIVE_KEY = 'gstmxx.faces.v1';
export const FACE_DESCRIPTOR_MODEL = 'face-api-128d-v1';

/**
 * Opens the same-origin archive used by Lab and Realtime. Mutations read the
 * latest record inside a cross-tab Web Lock when the browser provides it.
 * @param {object} [options] Browser dependencies or test substitutes.
 * @param {Storage} [options.storage] Storage implementation.
 * @param {LockManager|null} [options.locks] Lock manager for concurrent writes.
 * @param {Console} [options.logger] Diagnostic logger.
 * @returns {object} Operations to read, save and remove local face templates.
 */
export function createFaceArchive({
   storage,
   locks = globalThis.navigator?.locks,
   logger = console,
} = {}) {
   /** Reads a fresh, model-compatible archive or returns an empty one. */
   function read() {
      const empty = { nextId: 0, activeRealtimeId: null, faces: [] };
      try {
         const data = JSON.parse((storage ?? globalThis.localStorage).getItem(FACE_ARCHIVE_KEY));
         if (data?.model !== FACE_DESCRIPTOR_MODEL || !Array.isArray(data.faces)) return empty;
         const faces = data.faces.filter(face => Number.isSafeInteger(face?.id)
            && face.id >= 0 && isFaceDescriptor(face.descriptor));
         const nextId = faces.reduce((next, face) => Math.max(next, face.id + 1), 0);
         return {
            faces,
            nextId: Math.max(Number.isSafeInteger(data.nextId) ? data.nextId : 0, nextId),
            activeRealtimeId: faces.some(face => face.id === data.activeRealtimeId && face.realtime)
               ? data.activeRealtimeId : null,
         };
      } catch (error) {
         logger.warn('Could not read local face archive', error);
         return empty;
      }
   }

   /**
    * Commits one change to the archive as a single storage write.
    * @param {function(object): *} change Updates the fresh archive and returns the result.
    * @returns {Promise<*>} The committed result, or a rejection if storage fails.
    */
   async function update(change) {
      const commit = () => {
         const data = read();
         const result = change(data);
         (storage ?? globalThis.localStorage).setItem(FACE_ARCHIVE_KEY, JSON.stringify({
            model: FACE_DESCRIPTOR_MODEL,
            ...data,
         }));
         return result;
      };
      return locks ? locks.request(FACE_ARCHIVE_KEY, commit) : commit();
   }

   return {
      read,

      /**
       * Adds a face under the next stable ID. Realtime calibration, when supplied,
       * also makes this the current Realtime reference.
       * @param {object} face Face descriptor, ISO capture date, optional JPEG and calibration.
       * @returns {Promise<object>} Saved face including its archive ID.
       */
      async save({ descriptor, savedAt, thumbnail, realtime }) {
         if (!isFaceDescriptor(descriptor)) throw new TypeError('Invalid face descriptor');
         const vector = Array.from(descriptor);
         return update(data => {
            const face = { id: data.nextId++, descriptor: vector, savedAt };
            if (thumbnail) face.thumbnail = thumbnail;
            if (realtime) {
               face.realtime = realtime;
               data.activeRealtimeId = face.id;
            }
            data.faces.push(face);
            return face;
         });
      },

      /**
       * Deletes a face template and clears its active reference if necessary.
       * @param {number} id Archive face ID.
       * @returns {Promise<void>}
       */
      remove(id) {
         return update(data => {
            data.faces = data.faces.filter(face => face.id !== id);
            if (data.activeRealtimeId === id) data.activeRealtimeId = null;
         });
      },

      /**
       * Ends a Realtime session, optionally deleting the active face on explicit reset.
       * @param {object} [options] Reference to detach.
       * @param {?number} [options.id] Session face ID. Omit to use the active reference.
       * @param {boolean} [options.removeFace=false] Whether to also delete the template.
       * @returns {Promise<void>}
       */
      async clearRealtime({ id, removeFace = false } = {}) {
         if (id === null) return;
         return update(data => {
            const target = id ?? data.activeRealtimeId;
            if (removeFace) data.faces = data.faces.filter(face => face.id !== target);
            if (data.activeRealtimeId === target) data.activeRealtimeId = null;
         });
      },
   };
}
