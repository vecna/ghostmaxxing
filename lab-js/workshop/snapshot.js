/** @module workshop/snapshot */
import { deliverMedia, drawCameraLayers } from './media.js';

const CREDIT = 'Ghostmaxxing · https://ghostmaxxing.vecna.eu/';

/**
 * Copies the current camera composite as a PNG with its context both drawn on
 * the image and available to paste as plain text.
 * @param {HTMLVideoElement} video Live camera.
 * @param {HTMLCanvasElement[]} layers Visible layers in compositing order.
 * @param {string} [detail] Available match or Ghostyle information.
 * @returns {Promise<'copied'|'shared'|'downloaded'|'cancelled'>} Delivery outcome.
 */
export function copySnapshot(video, layers, detail) {
   const lines = detail ? [CREDIT, detail] : [CREDIT];
   const { videoWidth: width, videoHeight: height } = video;
   const fontSize = Math.max(12, Math.min(28, Math.round(width / 42)));
   const margin = Math.round(fontSize * 0.8);
   const lineHeight = Math.round(fontSize * 1.45);
   const canvas = document.createElement('canvas');
   canvas.width = width;
   canvas.height = height + margin * 2 + lineHeight * lines.length;
   drawCameraLayers(video, canvas, layers);

   const context = canvas.getContext('2d');
   context.fillStyle = '#100d0a';
   context.fillRect(0, height, width, canvas.height - height);
   context.font = '600 ' + fontSize + 'px system-ui';
   context.textBaseline = 'middle';
   context.fillStyle = '#ffe7a8';
   for (let index = 0; index < lines.length; index++) {
      context.fillText(lines[index], margin, height + margin + lineHeight * (index + 0.5), width - margin * 2);
   }

   const png = new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
         if (blob) resolve(blob);
         else reject(new Error('Could not encode the snapshot as PNG'));
      }, 'image/png');
   });
   return deliverMedia(png, 'ghostmaxxing.png', 'image/png', lines.join('\n'));
}
