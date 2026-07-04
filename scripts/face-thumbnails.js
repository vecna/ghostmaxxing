/** @module face-thumbnails */
import {
   THUMBNAIL_JPEG_QUALITY,
   THUMBNAIL_MARGIN_RATIO,
   THUMBNAIL_MAX_ENTRIES,
   THUMBNAIL_OUTPUT_SIZE,
} from './config.js';
import { setLog } from './utils.js';

export const THUMBNAILS_STORAGE_KEY = 'local-face-lab-thumbnails-v1';

function defaultStore() {
   return {
      entries: [],
      maxEntries: THUMBNAIL_MAX_ENTRIES,
   };
}

function persistStore(store) {
   localStorage.setItem(THUMBNAILS_STORAGE_KEY, JSON.stringify(store));
}

function normalizeId(id) {
   return typeof id === 'number' ? id : Number(id);
}

function logThumbnailEvent(message) {
   if (window.gstmxx && typeof window.gstmxx.log === 'function') {
      window.gstmxx.log(message, 'thumbnails');
      return;
   }
   setLog(message, 'thumbnails');
}

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

export function deleteThumbnail(id) {
   const normalizedId = normalizeId(id);
   if (!Number.isFinite(normalizedId)) return;

   const store = loadThumbnailsStore();
   store.entries = store.entries.filter((entry) => entry.id !== normalizedId);
   persistStore(store);
}

export function getThumbnail(id) {
   const normalizedId = normalizeId(id);
   if (!Number.isFinite(normalizedId)) return null;

   const store = loadThumbnailsStore();
   const entry = store.entries.find((item) => item.id === normalizedId);
   return entry ? entry.dataUrl : null;
}

export function clearAllThumbnails() {
   persistStore(defaultStore());
}
