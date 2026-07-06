/** @module face-thumbnails */
import {
   THUMBNAIL_JPEG_QUALITY,
   THUMBNAIL_MARGIN_RATIO,
   THUMBNAIL_MAX_ENTRIES,
   THUMBNAIL_OUTPUT_SIZE,
} from './config.js';
import { setLog } from './utils.js';

export const THUMBNAILS_STORAGE_KEY = 'local-face-lab-thumbnails-v1';

/**
 * Creates the empty thumbnail-store shape used when localStorage has no saved
 * face thumbnails, contains malformed data, or is being reset with the database.
 *
 * @returns {{entries: Array<object>, maxEntries: number}} Empty thumbnail store with configured capacity.
 * @see loadThumbnailsStore - Falls back to this shape when storage cannot be read.
 * @see clearAllThumbnails - Persists this shape when the local face archive is cleared.
 */
function defaultStore() {
   return {
      entries: [],
      maxEntries: THUMBNAIL_MAX_ENTRIES,
   };
}

/**
 * Writes the normalized face-thumbnail store to localStorage under the module's
 * dedicated key, keeping images separate from the 2D and 3D biometric databases.
 *
 * @param {{entries: Array<object>, maxEntries: number}} store - Store object to serialize.
 * @returns {void}
 * @see saveThumbnail - Persists after adding or evicting a thumbnail.
 * @see deleteThumbnail - Persists after removing one face thumbnail.
 * @see clearAllThumbnails - Persists the empty thumbnail store.
 */
function persistStore(store) {
   localStorage.setItem(THUMBNAILS_STORAGE_KEY, JSON.stringify(store));
}

/**
 * Converts face IDs from UI, database, or test inputs into the numeric key used
 * by the thumbnail store.
 *
 * @param {number|string} id - Face id to normalize.
 * @returns {number} Numeric id, possibly `NaN` for invalid input.
 * @see saveThumbnail - Normalizes the saved face id before storage.
 * @see deleteThumbnail - Normalizes the target id before removal.
 * @see getThumbnail - Normalizes the lookup id before reading.
 */
function normalizeId(id) {
   return typeof id === 'number' ? id : Number(id);
}

/**
 * Logs thumbnail storage events through the plugin-facing logger when available,
 * falling back to the app logger during tests or early module use. In practice
 * this reports FIFO evictions when the local thumbnail cache reaches capacity.
 *
 * @param {string} message - Message to write under the `thumbnails` source.
 * @returns {void}
 * @see saveThumbnail - Reports evicted thumbnails when capacity is exceeded.
 */
function logThumbnailEvent(message) {
   if (window.gstmxx && typeof window.gstmxx.log === 'function') {
      window.gstmxx.log(message, 'thumbnails');
      return;
   }
   setLog(message, 'thumbnails');
}

/**
 * Repairs parsed localStorage data into the current thumbnail-store contract.
 * Invalid records are dropped, IDs are coerced to numbers, and capacity falls
 * back to the configured default when older or corrupted data omits it.
 *
 * @param {*} parsed - Parsed JSON value read from localStorage.
 * @returns {{entries: Array<{id: number, dataUrl: string, savedAt: string}>, maxEntries: number}} Normalized thumbnail store.
 * @see loadThumbnailsStore - Applies this after parsing persisted thumbnail data.
 */
function normalizeStoreShape(parsed) {
   if (!parsed || !Array.isArray(parsed.entries)) return defaultStore();

   const maxEntries = Number.isFinite(parsed.maxEntries) && parsed.maxEntries > 0
      ? Math.floor(parsed.maxEntries)
      : THUMBNAIL_MAX_ENTRIES;

   const entries = parsed.entries
      .filter((entry) => entry && Number.isFinite(Number(entry.id)) && typeof entry.dataUrl === 'string' && typeof entry.savedAt === 'string')
      .map((entry) => ({
         id: Number(entry.id),
         dataUrl: entry.dataUrl,
         savedAt: entry.savedAt,
      }));

   return { entries, maxEntries };
}

/**
 * Moves a crop rectangle back inside the video frame without changing its size
 * unless the requested crop is larger than the frame. This keeps edge-face
 * thumbnails from sampling outside the webcam image.
 *
 * @param {{x: number, y: number, width: number, height: number}} rect - Desired crop rectangle with margin applied.
 * @param {number} frameWidth - Source video frame width.
 * @param {number} frameHeight - Source video frame height.
 * @returns {{x: number, y: number, width: number, height: number}} Crop rectangle safe for `drawImage`.
 * @see captureThumbnail - Uses this before drawing the face crop into the square thumbnail canvas.
 */
function shiftRectInsideBounds(rect, frameWidth, frameHeight) {
   const shifted = { ...rect };

   if (shifted.width > frameWidth) {
      shifted.x = 0;
      shifted.width = frameWidth;
   } else {
      if (shifted.x < 0) shifted.x = 0;
      if (shifted.x + shifted.width > frameWidth) shifted.x = frameWidth - shifted.width;
   }

   if (shifted.height > frameHeight) {
      shifted.y = 0;
      shifted.height = frameHeight;
   } else {
      if (shifted.y < 0) shifted.y = 0;
      if (shifted.y + shifted.height > frameHeight) shifted.y = frameHeight - shifted.height;
   }

   return shifted;
}

/**
 * Captures a square JPEG thumbnail around a detected face box from the live
 * webcam frame. The crop includes configurable margin, is clamped to frame
 * bounds, letterboxes with black when needed, and is used as the small identity
 * preview in history and analysis comparisons.
 *
 * @param {HTMLVideoElement} videoEl - Live webcam video element to sample from.
 * @param {{x: number, y: number, width: number, height: number}} box - face-api detection box in video pixels.
 * @param {object} [options={}] - Optional thumbnail rendering overrides.
 * @param {number} [options.marginRatio] - Extra crop margin as a ratio of the face box short side.
 * @param {number} [options.outputSize] - Square output canvas size in pixels.
 * @param {number} [options.jpegQuality] - JPEG quality passed to `toDataURL`.
 * @returns {Promise<string>} JPEG data URL for storage or comparison.
 * @throws {Error} When the video element, face box, video frame, or canvas context is unavailable.
 * @see tryCaptureThumbnailOnSave - Captures the saved-face thumbnail during the Save workflow.
 * @see buildVisualComparison - Captures the current face thumbnail for the analysis panel.
 */
export async function captureThumbnail(videoEl, box, options = {}) {
   const marginRatio = Number.isFinite(options.marginRatio) ? options.marginRatio : THUMBNAIL_MARGIN_RATIO;
   const outputSize = Number.isFinite(options.outputSize) ? options.outputSize : THUMBNAIL_OUTPUT_SIZE;
   const jpegQuality = Number.isFinite(options.jpegQuality) ? options.jpegQuality : THUMBNAIL_JPEG_QUALITY;

   if (!videoEl) throw new Error('captureThumbnail: video element is required.');
   if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y) || !Number.isFinite(box.width) || !Number.isFinite(box.height)) {
      throw new Error('captureThumbnail: invalid face box.');
   }

   const frameWidth = Number(videoEl.videoWidth || videoEl.clientWidth || 0);
   const frameHeight = Number(videoEl.videoHeight || videoEl.clientHeight || 0);
   if (!frameWidth || !frameHeight) {
      throw new Error('captureThumbnail: video frame not ready.');
   }

   const shortSide = Math.min(box.width, box.height);
   const margin = shortSide * Math.max(0, marginRatio);

   const rawRect = {
      x: box.x - margin,
      y: box.y - margin,
      width: box.width + margin * 2,
      height: box.height + margin * 2,
   };

   const cropRect = shiftRectInsideBounds(rawRect, frameWidth, frameHeight);

   const canvas = document.createElement('canvas');
   canvas.width = outputSize;
   canvas.height = outputSize;
   const ctx = canvas.getContext('2d');
   if (!ctx) throw new Error('captureThumbnail: 2d context unavailable.');

   const scale = Math.min(outputSize / cropRect.width, outputSize / cropRect.height);
   const destWidth = cropRect.width * scale;
   const destHeight = cropRect.height * scale;
   const destX = (outputSize - destWidth) / 2;
   const destY = (outputSize - destHeight) / 2;

   ctx.fillStyle = 'rgba(0, 0, 0, 1)';
   ctx.fillRect(0, 0, outputSize, outputSize);
   ctx.drawImage(
      videoEl,
      cropRect.x,
      cropRect.y,
      cropRect.width,
      cropRect.height,
      destX,
      destY,
      destWidth,
      destHeight,
   );

   return canvas.toDataURL('image/jpeg', jpegQuality);
}

/**
 * Loads the persisted face-thumbnail store from localStorage, tolerating missing
 * entries, malformed JSON, and stale shapes so the history drawer never fails
 * because thumbnail metadata is corrupt.
 *
 * @returns {{entries: Array<{id: number, dataUrl: string, savedAt: string}>, maxEntries: number}} Normalized thumbnail store.
 * @see saveThumbnail - Reads the current store before adding an entry.
 * @see deleteThumbnail - Reads the current store before filtering an entry.
 * @see getThumbnail - Reads the current store before lookup.
 */
export function loadThumbnailsStore() {
   try {
      const raw = localStorage.getItem(THUMBNAILS_STORAGE_KEY);
      if (!raw) return defaultStore();
      const parsed = JSON.parse(raw);
      return normalizeStoreShape(parsed);
   } catch {
      return defaultStore();
   }
}

/**
 * Saves or replaces the thumbnail for a face id and enforces the configured
 * FIFO capacity. When capacity is exceeded, the oldest `savedAt` entries are
 * evicted and a thumbnail log message is emitted.
 *
 * @param {number|string} id - Saved face id associated with the thumbnail.
 * @param {string} dataUrl - JPEG data URL produced by `captureThumbnail`.
 * @returns {void}
 * @see init - Calls this after `saveFace` succeeds in the Save workflow.
 * @see logThumbnailEvent - Reports FIFO eviction messages.
 */
export function saveThumbnail(id, dataUrl) {
   if (typeof dataUrl !== 'string' || !dataUrl) return;

   const normalizedId = normalizeId(id);
   if (!Number.isFinite(normalizedId)) return;

   const store = loadThumbnailsStore();
   const savedAt = new Date().toISOString();

   store.entries = store.entries.filter((entry) => entry.id !== normalizedId);
   store.entries.push({ id: normalizedId, dataUrl, savedAt });

   while (store.entries.length > store.maxEntries) {
      store.entries.sort((a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime());
      const evicted = store.entries.shift();
      if (evicted) {
         logThumbnailEvent(`Thumbnail evicted for ID ${evicted.id} (FIFO capacity ${store.maxEntries}).`);
      }
   }

   persistStore(store);
}

/**
 * Deletes the thumbnail associated with a face id, used when a history card
 * removes the corresponding 2D/3D face records.
 *
 * @param {number|string} id - Face id whose thumbnail should be removed.
 * @returns {void}
 * @see removeFaceById - Removes thumbnail data when deleting a single saved face.
 */
export function deleteThumbnail(id) {
   const normalizedId = normalizeId(id);
   if (!Number.isFinite(normalizedId)) return;

   const store = loadThumbnailsStore();
   store.entries = store.entries.filter((entry) => entry.id !== normalizedId);
   persistStore(store);
}

/**
 * Retrieves the stored thumbnail data URL for a saved face id. Missing or
 * invalid ids return null so history and analysis UI can fall back gracefully.
 *
 * @param {number|string} id - Face id to look up.
 * @returns {string|null} Stored JPEG data URL, or null when no thumbnail exists.
 * @see createHistoryCard - Displays saved thumbnails in the history drawer.
 * @see buildVisualComparison - Retrieves the baseline thumbnail for analysis comparisons.
 */
export function getThumbnail(id) {
   const normalizedId = normalizeId(id);
   if (!Number.isFinite(normalizedId)) return null;

   const store = loadThumbnailsStore();
   const entry = store.entries.find((item) => item.id === normalizedId);
   return entry ? entry.dataUrl : null;
}

/**
 * Clears all saved face thumbnails while preserving the thumbnail-store schema.
 * This keeps the thumbnail cache aligned with the local 2D and 3D biometric
 * databases when the user clears the archive.
 *
 * @returns {void}
 * @see clearDb - Calls this when wiping the local biometric archive.
 */
export function clearAllThumbnails() {
   persistStore(defaultStore());
}
