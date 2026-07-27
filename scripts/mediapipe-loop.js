/**
 * @module mediapipe-loop
 * @description
 * Runtime loop for MediaPipe FaceLandmarker.
 *
 * Loads the 478-landmark MediaPipe face mesh model, runs inference against the
 * lab `<video>` element, and dispatches `gstmxx.events.landmarks3d` whenever a
 * throttled new video frame has landmarks available. This module deliberately
 * runs beside the face-api engine with separate models and backend state, so 3D
 * overlays and future plugins can listen to the shared event bus without
 * changing the 2D recognition engine.
 */

import { FaceLandmarker, FilesetResolver } from './vendor/tasks-vision@0.10.35.js';
import { MEDIAPIPE_WASM_URL, MEDIAPIPE_FACE_LANDMARKER_URL } from './config.js';
import { t } from './i18n.js';

let faceLandmarker = null;
let lastVideoTime = -1;
let lastInferAt = 0;
let video = null;
let fpsSelect = null;
let running = false;

/**
 * Reads the MediaPipe loop throttle from the lab FPS selector and falls back to
 * the project default interval when the UI control is missing or invalid.
 *
 * @returns {number} Milliseconds to wait between FaceLandmarker inferences.
 * @see tick - Uses the delay to avoid running MediaPipe on every animation frame.
 */
function getFrameDelayMs() {
   const v = fpsSelect && parseInt(fpsSelect.value, 10);
   return Number.isFinite(v) && v > 0 ? v : 120;
}

/**
 * Waits until the webcam video element has enough data for MediaPipe video-mode
 * inference. Startup uses this so the first `detectForVideo` call happens only
 * after the camera stream has produced usable frame data.
 *
 * @param {HTMLVideoElement} v - Lab webcam video element.
 * @returns {Promise<void>} Resolves immediately when the video is already ready.
 * @see init - Waits for the camera stream before announcing `mediapipeReady`.
 */
async function waitForVideoReady(v) {
   if (v.readyState >= 2) return;
   await new Promise(resolve => {
      v.addEventListener('loadeddata', resolve, { once: true });
   });
}

/**
 * Initializes the MediaPipe landmark loop after the Ghostmaxxing UI has exposed
 * `window.gstmxx`, the event bus, and the webcam video element. It loads the
 * CDN FaceLandmarker task, exposes the FaceLandmarker constants for UV/3D
 * plugins, logs readiness, emits `mediapipeReady`, and starts the animation loop.
 * The Italian warning and error messages in this function report missing
 * `gstmxx.events`, missing `#video`, or MediaPipe load failure during startup.
 *
 * @returns {Promise<void>} Resolves after setup starts the loop, or exits early when prerequisites fail.
 * @see main - Dispatches `ghostatiReady` once `window.gstmxx`, state, and DOM handles are ready.
 * @see tick - Started after MediaPipe and the video stream are ready.
 * @see initPlugins3dLoader - Receives `FaceLandmarker` through `window.gstmxx.FaceLandmarker`.
 */
async function init() {
   const events = window.gstmxx && window.gstmxx.events;
   if (!events) {
      console.warn(t('console_mediapipe_events_missing'));
      return;
   }
   video = document.getElementById('video');
   if (!video) {
      console.warn(t('console_mediapipe_video_missing'));
      return;
   }
   fpsSelect = document.getElementById('fpsSelect');

   try {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
         baseOptions: { modelAssetPath: MEDIAPIPE_FACE_LANDMARKER_URL, delegate: 'GPU' },
         outputFaceBlendshapes: false,
         runningMode: 'VIDEO',
         numFaces: 1
      });
      window.gstmxx.FaceLandmarker = FaceLandmarker;
   } catch (err) {
      console.error(t('console_mediapipe_init_error'), err);
      if (window.gstmxx && window.gstmxx.log) {
         gstmxx.log(t('mediapipe_load_error_log', { message: err.message }), 'mediapipe');
      }
      return;
   }

   await waitForVideoReady(video);
   if (window.gstmxx && window.gstmxx.log) {
      gstmxx.log(t('mediapipe_ready_log'), 'mediapipe');
   }
   events.dispatchEvent(new CustomEvent('mediapipeReady', { detail: {} }));

   running = true;
   tick();
}

/**
 * Runs the per-frame MediaPipe work: throttles duplicate/too-fast video frames,
 * extracts the current 478-point mesh, caches it on `window.gstmxx.lastLandmarks3d`,
 * and publishes `landmarks3d` for overlays, 3D ghostyles, and efficacy compositing.
 * The cached landmarks let engine-3d and plugins reuse the latest mesh without
 * re-running FaceLandmarker inference.
 *
 * @returns {void}
 * @see init - Starts the loop after `mediapipeReady` is dispatched.
 * @see tick - Re-schedules itself with `requestAnimationFrame` while running.
 * @see onLandmarks3d - Consumes `landmarks3d` to repaint the bounding-box/mesh overlay.
 * @see initPlugins3dLoader - Consumes `landmarks3d` to render active `paintUV` ghostyles.
 * @see compositeAndDetect3d - Reads cached landmarks for 3D efficacy compositing.
 */
function tick() {
   if (!running) return;
   requestAnimationFrame(tick);
   if (!faceLandmarker || !video || video.readyState < 2) return;
   if (video.currentTime === lastVideoTime) return;
   const now = performance.now();
   if (now - lastInferAt < getFrameDelayMs()) return;
   lastInferAt = now;
   lastVideoTime = video.currentTime;
   try {
      const results = faceLandmarker.detectForVideo(video, now);
      const landmarks = (results.faceLandmarks && results.faceLandmarks[0]) || null;

      if (window.gstmxx) window.gstmxx.lastLandmarks3d = landmarks;

      gstmxx.events.dispatchEvent(new CustomEvent('landmarks3d', {
         detail: { landmarks, results }
      }));
   } catch (err) {
      console.error(t('console_mediapipe_tick_error'), err);
   }
}

window.addEventListener('ghostatiReady', init, { once: true });
