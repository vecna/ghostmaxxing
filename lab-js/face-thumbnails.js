/** @module face-thumbnails */
import { THUMBNAIL_JPEG_QUALITY, THUMBNAIL_MARGIN_RATIO, THUMBNAIL_OUTPUT_SIZE } from './config.js';
import { t } from './i18n.js';

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
 * @param {HTMLVideoElement|HTMLCanvasElement} videoEl - Webcam or frozen source frame.
 * @param {{x: number, y: number, width: number, height: number}} box - face-api detection box in video pixels.
 * @param {object} [options={}] - Optional thumbnail rendering overrides.
 * @param {number} [options.marginRatio] - Extra crop margin as a ratio of the face box short side.
 * @param {number} [options.outputSize] - Square output canvas size in pixels.
 * @param {number} [options.jpegQuality] - JPEG quality passed to `toDataURL`.
 * @returns {Promise<string>} JPEG data URL for storage or comparison.
 * @throws {Error} When the video element, face box, video frame, or canvas context is unavailable.
 */
export async function captureThumbnail(videoEl, box, options = {}) {
   const marginRatio = Number.isFinite(options.marginRatio) ? options.marginRatio : THUMBNAIL_MARGIN_RATIO;
   const outputSize = Number.isFinite(options.outputSize) ? options.outputSize : THUMBNAIL_OUTPUT_SIZE;
   const jpegQuality = Number.isFinite(options.jpegQuality) ? options.jpegQuality : THUMBNAIL_JPEG_QUALITY;

   if (!videoEl) throw new Error(t('capture_thumbnail_video_required_error'));
   if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y) || !Number.isFinite(box.width) || !Number.isFinite(box.height)) {
      throw new Error(t('capture_thumbnail_invalid_box_error'));
   }

   const frameWidth = Number(videoEl.videoWidth || (videoEl.tagName === 'CANVAS' ? videoEl.width : videoEl.clientWidth) || 0);
   const frameHeight = Number(videoEl.videoHeight || (videoEl.tagName === 'CANVAS' ? videoEl.height : videoEl.clientHeight) || 0);
   if (!frameWidth || !frameHeight) {
      throw new Error(t('capture_thumbnail_frame_not_ready_error'));
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
   if (!ctx) throw new Error(t('capture_thumbnail_context_error'));

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
