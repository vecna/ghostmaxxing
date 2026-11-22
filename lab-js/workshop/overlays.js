/** @module workshop/overlays */
const CONTOURS = [[0, 17], [17, 22], [22, 27], [27, 31], [31, 36], [36, 42], [42, 48], [48, 60], [60, 68]];

/**
 * Draws face-api points or MediaPipe mesh points in source-video coordinates.
 * Separate canvases allow the participant to compose both views independently.
 * @param {HTMLCanvasElement} canvas Layer to update.
 * @param {Array<{x:number,y:number}>|null} points Latest landmarks, if any.
 * @param {HTMLVideoElement} video Source dimensions for this layer.
 * @param {boolean} [mesh=false] Whether points are normalized MediaPipe geometry.
 * @returns {void}
 */
export function paintLandmarks(canvas, points, video, mesh = false) {
   const { videoWidth: width, videoHeight: height } = video;
   if (canvas.width !== width) canvas.width = width;
   if (canvas.height !== height) canvas.height = height;
   const ctx = canvas.getContext('2d');
   ctx.clearRect(0, 0, width, height);
   if (!points?.length) return;

   const radius = Math.max(1, Math.min(width, height) / (mesh ? 475 : 270));
   const x = mesh ? width : 1;
   const y = mesh ? height : 1;
   if (!mesh) {
      ctx.strokeStyle = '#ffe7a8';
      ctx.lineWidth = radius;
      for (const [from, to] of CONTOURS) {
         if (!points[from]) continue;
         ctx.beginPath();
         ctx.moveTo(points[from].x, points[from].y);
         for (const point of points.slice(from + 1, to)) ctx.lineTo(point.x, point.y);
         if (from >= 36) ctx.closePath();
         ctx.stroke();
      }
   }
   ctx.fillStyle = mesh ? '#7fe3b0' : '#ffe7a8';
   ctx.beginPath();
   for (const point of points) {
      ctx.moveTo(point.x * x + radius, point.y * y);
      ctx.arc(point.x * x, point.y * y, radius, 0, 2 * Math.PI);
   }
   ctx.fill();
}
