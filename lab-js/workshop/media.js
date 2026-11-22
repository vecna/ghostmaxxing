/** @module workshop/media */
import {
   DETECTOR_OPTIONS,
   MEDIAPIPE_FACE_LANDMARKER_URL,
   MEDIAPIPE_TASKS_VISION_URL,
   MEDIAPIPE_WASM_URL,
   MODEL_URLS,
} from '../config.js';

export const CLIP_DURATION_MS = 1000;

/**
 * Runs face-api on one live or frozen frame.
 * @callback WorkshopFaceDetector
 * @param {HTMLVideoElement|HTMLCanvasElement} frame Pixel source.
 * @returns {Promise<?object>} Detection and descriptor, or null for no face.
 */

/**
 * Loads the local 2D recognition models and returns the frame detector used by Lab.
 * @param {object} api The face-api runtime or a test double.
 * @returns {Promise<WorkshopFaceDetector>} Detector.
 */
export async function createFaceDetector(api) {
   await Promise.all([
      api.nets.tinyFaceDetector.loadFromUri(MODEL_URLS.tiny),
      api.nets.faceLandmark68Net.loadFromUri(MODEL_URLS.landmarks),
      api.nets.faceRecognitionNet.loadFromUri(MODEL_URLS.recognition),
   ]);
   return async frame => api.detectSingleFace(frame, DETECTOR_OPTIONS)
      .withFaceLandmarks().withFaceDescriptor();
}

/**
 * Opens and starts a silent camera feed so the workshop can record evidence locally.
 * @param {HTMLVideoElement} video Preview element.
 * @param {MediaDevices} [devices] Camera API or test double.
 * @returns {Promise<MediaStream>} The playing video stream.
 */
export async function openCamera(video, devices = navigator.mediaDevices) {
   const stream = await devices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
   });
   try {
      video.srcObject = stream;
      await video.play();
      return stream;
   } catch (error) {
      stream.getTracks().forEach(track => track.stop());
      throw error;
   }
}

/**
 * Freezes a source frame for saving its descriptor and preview together.
 * @param {HTMLVideoElement} video Current source.
 * @returns {HTMLCanvasElement} The captured frame in camera coordinates.
 */
export function freezeFrame(video) {
   const frame = document.createElement('canvas');
   frame.width = video.videoWidth;
   frame.height = video.videoHeight;
   frame.getContext('2d').drawImage(video, 0, 0);
   return frame;
}

/**
 * Loads 3D face geometry and the mesh topology used by the Ghostyle UV renderer.
 * @param {Console} [logger] Diagnostic logger.
 * @param {object} [settings] Frame source and number of faces to detect.
 * @param {'VIDEO'|'IMAGE'} [settings.runningMode='VIDEO'] Camera or still photographs.
 * @param {number} [settings.numFaces=1] Maximum detections, including ambiguous photos.
 * @returns {Promise<object>} Detector and topology.
 */
export async function loadFaceMesh(logger = console, { runningMode = 'VIDEO', numFaces = 1 } = {}) {
   const { FaceLandmarker, FilesetResolver } = await import(MEDIAPIPE_TASKS_VISION_URL);
   const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
   const options = {
      baseOptions: { modelAssetPath: MEDIAPIPE_FACE_LANDMARKER_URL, delegate: runningMode === 'IMAGE' ? 'CPU' : 'GPU' },
      runningMode,
      numFaces,
   };
   try {
      return { detector: await FaceLandmarker.createFromOptions(vision, options), topology: FaceLandmarker };
   } catch (error) {
      if (options.baseOptions.delegate === 'CPU') throw error;
      logger.warn('Could not start the 3D overlay on GPU, using CPU', error);
      options.baseOptions.delegate = 'CPU';
      return { detector: await FaceLandmarker.createFromOptions(vision, options), topology: FaceLandmarker };
   }
}

/**
 * Records a short camera or composited clip for local copy and consent.
 * @param {MediaStream} stream Playing video source.
 * @param {object} [options] Duration and recording API.
 * @param {number} [options.durationMs] How long to record, in milliseconds.
 * @param {Function} [options.Recorder] MediaRecorder constructor or test double.
 * @returns {Promise<object>} Clip metadata and encoded blob.
 */
export async function recordClip(stream, { durationMs = CLIP_DURATION_MS, Recorder = MediaRecorder } = {}) {
   const preferred = ['video/mp4;codecs=h264', 'video/mp4', 'video/webm;codecs=vp8']
      .find(type => Recorder.isTypeSupported(type));
   const recorder = new Recorder(stream, preferred ? { mimeType: preferred } : undefined);
   const chunks = await new Promise((resolve, reject) => {
      const buffered = [];
      let stop;
      recorder.ondataavailable = event => {
         if (event.data.size > 0) buffered.push(event.data);
      };
      recorder.onerror = event => {
         clearTimeout(stop);
         reject(event.error);
      };
      recorder.onstop = () => {
         clearTimeout(stop);
         resolve(buffered);
      };
      recorder.start();
      stop = setTimeout(() => {
         if (recorder.state === 'recording') recorder.stop();
      }, durationMs);
   });
   if (!chunks.length) throw new Error('No encoded frames in the recording');

   const mimeType = (recorder.mimeType || chunks[0].type).split(';')[0];
   const extension = mimeType === 'video/mp4' ? 'mp4' : 'webm';
   const blob = new Blob(chunks, { type: mimeType });
   return {
      id: crypto.randomUUID(),
      blob,
      filename: 'ghostmaxxing-' + Date.now() + '.' + extension,
      mimeType,
      extension,
      size: blob.size,
      durationMs,
      recordedAt: new Date().toISOString(),
   };
}

/**
 * Composites the camera frame and visible overlays in their on-screen order.
 * @param {HTMLVideoElement} video Source camera.
 * @param {HTMLCanvasElement} canvas Target that can also hold a footer below the frame.
 * @param {HTMLCanvasElement[]} layers Canvas layers ordered from back to front.
 * @returns {void}
 */
export function drawCameraLayers(video, canvas, layers) {
   const { videoWidth: width, videoHeight: height } = video;
   const context = canvas.getContext('2d');
   context.save();
   context.translate(width, 0);
   context.scale(-1, 1);
   context.drawImage(video, 0, 0, width, height);
   for (const layer of layers) {
      if (!layer.hidden && layer.width && layer.height) context.drawImage(layer, 0, 0, width, height);
   }
   context.restore();
}

/**
 * Delivers a local file through the clipboard, sharing or download. A PNG
 * promise can be passed directly so the clipboard write starts during the click.
 * @param {Blob|Promise<Blob>} blob File data, possibly still encoding.
 * @param {string} filename Suggested filename.
 * @param {string} mimeType Format to offer to the clipboard.
 * @param {string} [text] Plain-text alternative and share caption.
 * @param {Navigator} [browser] Browser APIs or test substitutes.
 * @returns {Promise<'copied'|'shared'|'downloaded'|'cancelled'>} Delivery outcome.
 */
export async function deliverMedia(blob, filename, mimeType, text, browser = navigator) {
   if (browser.clipboard?.write && globalThis.ClipboardItem
      && (ClipboardItem.supports?.(mimeType) ?? true)) {
      try {
         const formats = { [mimeType]: blob };
         if (text) formats['text/plain'] = new Blob([text], { type: 'text/plain' });
         await browser.clipboard.write([new ClipboardItem(formats)]);
         return 'copied';
      } catch {
         // Continue to file delivery where this browser supports it.
      }
   }

   const file = new File([await blob], filename, { type: mimeType });
   const share = { files: [file] };
   if (text) share.text = text;
   if (browser.share && browser.canShare?.({ files: [file] })) {
      try {
         await browser.share(share);
         return 'shared';
      } catch (error) {
         if (error.name === 'AbortError') return 'cancelled';
      }
   }

   const url = URL.createObjectURL(file);
   const link = Object.assign(document.createElement('a'), { href: url, download: filename });
   document.body.append(link);
   link.click();
   link.remove();
   setTimeout(() => URL.revokeObjectURL(url), 1000);
   return 'downloaded';
}
