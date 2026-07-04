/**
 * @module mediapipe-loop
 * @description
 * MediaPipe FaceLandmarker loop — add-on per ghostati.html
 *
 * Carica il modello MediaPipe (478 landmark 3D), esegue inferenza
 * sul tag <video> e dispatcha `Ghostati.events.landmarks3d` su ogni
 * frame nuovo. Plugin futuri si registrano ascoltando questo evento.
 *
 * Non modifica l'engine. Gira in parallelo a face-api senza interferire
 * (modelli e backend separati).
 */

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35";
import { MEDIAPIPE_WASM_URL, MEDIAPIPE_FACE_LANDMARKER_URL } from './config.js';

let faceLandmarker = null;
let lastVideoTime = -1;
let lastInferAt = 0;
let video = null;
let fpsSelect = null;
let running = false;

function getFrameDelayMs() {
   const v = fpsSelect && parseInt(fpsSelect.value, 10);
   return Number.isFinite(v) && v > 0 ? v : 120;
}

async function waitForVideoReady(v) {
   if (v.readyState >= 2) return;
   await new Promise(resolve => {
      v.addEventListener('loadeddata', resolve, { once: true });
   });
}

async function init() {
   const events = window.gstmxx && window.gstmxx.events;
   if (!events) {
      console.warn('[mediapipe-loop] Ghostati.events non trovato, skip init');
      return;
   }
   video = document.getElementById('video');
   if (!video) {
      console.warn('[mediapipe-loop] #video non trovato, skip init');
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
      // Esponi le costanti (FACE_LANDMARKS_TESSELATION, FACE_LANDMARKS_LEFT_EYE, ...) ai futuri plugin 3D
      window.gstmxx.FaceLandmarker = FaceLandmarker;
   } catch (err) {
      console.error('[mediapipe-loop] errore init:', err);
      if (window.gstmxx && window.gstmxx.log) {
         Ghostati.log('Errore caricamento MediaPipe: ' + err.message, 'mediapipe');
      }
      return;
   }

   await waitForVideoReady(video);
   if (window.gstmxx && window.gstmxx.log) {
      Ghostati.log('MediaPipe FaceLandmarker pronto (478 landmark 3D)', 'mediapipe');
   }
   events.dispatchEvent(new CustomEvent('mediapipeReady', { detail: {} }));

   running = true;
   tick();
}

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

      // Cache latest landmarks on state (via the Ghostmaxxing setter) so engine-3d
      // and plugins can read them without re-running inference.
      if (window.gstmxx) window.gstmxx.lastLandmarks3d = landmarks;

      Ghostati.events.dispatchEvent(new CustomEvent('landmarks3d', {
         detail: { landmarks, results }
      }));
   } catch (err) {
      console.error('[mediapipe-loop] errore tick:', err);
   }
}

window.addEventListener('ghostatiReady', init, { once: true });
