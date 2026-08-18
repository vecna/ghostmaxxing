/**
 * @module config
 * @description
 * Centralised configuration constants for Ghostmaxxing. Lives in one place so that
 * URLs, detector thresholds, and recording defaults can be changed without
 * touching engine code. All values here are static and module-load-time
 * resolvable; runtime-mutable state belongs in `state.js`.
 *
 * Why a separate module: keeps testable engines free of hard-coded URLs
 * (which makes them mockable) and concentrates the network surface in one
 * file so the upgrade path to npm + bundler is mechanical.
 */

const VENDOR_ROOT_URL = new URL('./vendor/', import.meta.url).href;

/**
 * Local URLs for vendored face-api model shards (TinyFaceDetector + landmarks /
 * recognition / age-gender / expressions). Every network fetch stays inside
 * `/lab-js/vendor` so pages can run without third-party CDNs.
 *
 * @see lab-js/main.js – `loadModels()` reads these and calls `faceapi.nets.*.loadFromUri()`.
 */
export const MODEL_URLS = {
   tiny: VENDOR_ROOT_URL,
   landmarks: VENDOR_ROOT_URL,
   recognition: VENDOR_ROOT_URL,
   ageGender: VENDOR_ROOT_URL,
   expressions: VENDOR_ROOT_URL
};

export const ANALYZE_PANEL_MAX_WIDTH_DESKTOP = 900;

/**
 * Maximum number of face thumbnails retained in the dedicated localStorage
 * thumbnail store. When the limit is exceeded, the oldest thumbnail entry is
 * evicted (FIFO by `savedAt`).
 */
export const THUMBNAIL_MAX_ENTRIES = 200;

/**
 * Extra margin ratio applied around the detected face box before thumbnail
 * cropping. The margin is computed from the shortest side of the box.
 */
export const THUMBNAIL_MARGIN_RATIO = 0.30;

/**
 * Output thumbnail size in pixels (square canvas, width and height).
 */
export const THUMBNAIL_OUTPUT_SIZE = 160;

/**
 * JPEG quality used when exporting captured face thumbnails.
 */
export const THUMBNAIL_JPEG_QUALITY = 0.8;

/**
 * Vendored tasks-vision ES module path used for dynamic imports.
 *
 * @see lab-js/engine-3d.js – `loadMobileNet()` does `await import(MEDIAPIPE_TASKS_VISION_URL)`.
 * @see lab-js/mediapipe-loop.js – uses the same package for face landmarks.
 */
export const MEDIAPIPE_TASKS_VISION_URL = new URL('./vendor/tasks-vision@0.10.35.js', import.meta.url).href;

/**
 * Local URL of the MediaPipe WASM directory loaded by `FilesetResolver.forVisionTasks()`.
 *
 * @see lab-js/engine-3d.js
 * @see lab-js/mediapipe-loop.js
 */
export const MEDIAPIPE_WASM_URL = new URL('./vendor/wasm', import.meta.url).href;

/**
 * Local URL of the MediaPipe FaceLandmarker `.task` bundle (float16, 478 landmarks).
 *
 * @see lab-js/mediapipe-loop.js – passed to `FaceLandmarker.createFromOptions()`.
 */
export const MEDIAPIPE_FACE_LANDMARKER_URL = new URL('./vendor/face_landmarker.task', import.meta.url).href;

/**
 * Local URL of the MediaPipe ImageEmbedder model bundle (MobileNetV3 Small, float32).
 * Produces the embedding vector consumed by the 3D recognition pipeline.
 *
 * @see lab-js/engine-3d.js – passed to `ImageEmbedder.createFromOptions()`.
 */
export const MEDIAPIPE_IMAGE_EMBEDDER_URL = new URL('./vendor/mobilenet_v3_small.tflite', import.meta.url).href;

/**
 * Pre-built TinyFaceDetector options reused across every face-api detection
 * call so the inference parameters stay consistent between the live loop, the
 * efficacy composite, and the save/find pipelines. `scoreThreshold` is the
 * minimum confidence for a face to be reported; `inputSize` is the square
 * input dimension fed to the detector (larger = more accurate, slower).
 *
 * @see lab-js/engine.js – `detectFaceInCam`, `runEffectPass`, `compositeAndDetect`.
 */
export const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
   inputSize: 416,
   scoreThreshold: 0.5
});

/**
 * Defaults for the in-app one-second video recording feature. Mode selects
 * between a direct browser download and an HTTP POST to a backend endpoint;
 * the upload contract is documented inline so the backend implementer doesn't
 * need to read the recording code.
 *
 * @see lab-js/camera.js – `recordOneSecond()` reads `mode`, `uploadEndpoint`, `durationMs`.
 */
export const RECORDING_CONFIG = {
   // Mode of operation: 'queue' keeps the recorded Blob in the browser so the
   // upload/consent flow can decide whether it ever leaves the device.
   mode: 'queue',

   // Endpoint used by the consented submit action.
   // Expected backend contract:
   //   - Method:        POST
   //   - Content-Type:  multipart/form-data
   //   - Payload field: 'video' (the recording blob)
   //   - Required field: 'consent_version'
   //   - Response:      { ok, uploadId, deleteToken }
   uploadEndpoint: '/api/uploads',

   // Duration of the recording in milliseconds (default: 2 seconds).
   durationMs: 2000
};

export const UPLOAD_CONSENT_VERSION = '2026-07-v1';
export const APP_VERSION = '0.1.0';
