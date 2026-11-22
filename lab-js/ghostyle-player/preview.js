/** @module ghostyle-player/preview */
import { DETECTOR_OPTIONS, MODEL_URLS } from '../config.js';
import { createUvRenderer } from '../ghostyle3d-uv-renderer.js';
import { paintLandmarks } from '../workshop/overlays.js';
import { drawCameraLayers } from '../workshop/media.js';

/**
 * Loads face detection and 2D landmarks for placement of paint and brush strokes.
 * @param {object} api face-api or a test double.
 * @returns {Promise<Function>} A detector that returns geometry for one frame.
 */
export async function loadLandmarks2d(api) {
   await Promise.all([
      api.nets.tinyFaceDetector.loadFromUri(MODEL_URLS.tiny),
      api.nets.faceLandmark68Net.loadFromUri(MODEL_URLS.landmarks),
   ]);
   return async video => api.detectSingleFace(video, DETECTOR_OPTIONS).withFaceLandmarks();
}

/**
 * Draws the selected Ghostyle in independent 2D and UV layers.
 * @param {object} layers Preview canvases with camera dimensions.
 * @param {Function} getTopology Provider for the MediaPipe mesh topology.
 * @returns {object} Preview, diagnostics, and compositing operations.
 */
export function createPreview(layers, getTopology) {
   const uv = createUvRenderer({
      uvPath: new URL('../../data/face_canonical_uv.json', import.meta.url).href,
      getFaceLandmarker: getTopology,
   });

   /** Clears an effect plane and supplies its isolated drawing state. */
   function drawLayer(canvas, video, paint) {
      if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
      if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      try {
         paint?.(ctx);
      } finally {
         ctx.restore();
      }
   }

   return {
      /** Redraws paint effects and clears either layer when its geometry is absent. */
      render(video, active, detection, mesh) {
         drawLayer(layers.uv, video, ctx => {
            if (active?.module.paintUV && mesh) uv.render(active.module, ctx, mesh, active.values);
         });
         drawLayer(layers.effect, video, ctx => {
            if (active?.module.onDraw && detection) {
               active.module.onDraw(ctx, detection.landmarks, detection.detection?.box, active.values);
            }
         });
      },

      /** Renders the optional geometry annotations over the current camera image. */
      annotate(video, detection, mesh) {
         if (!layers.points.hidden) paintLandmarks(layers.points, detection?.landmarks.positions, video);
         if (!layers.mesh.hidden) paintLandmarks(layers.mesh, mesh, video, true);
         if (layers.brush.width !== video.videoWidth) layers.brush.width = video.videoWidth;
         if (layers.brush.height !== video.videoHeight) layers.brush.height = video.videoHeight;
      },

      /** Composites the camera, paint, diagnostics and brush in preview order. */
      capture(video, canvas) {
         drawCameraLayers(video, canvas, Object.values(layers));
      },
   };
}
