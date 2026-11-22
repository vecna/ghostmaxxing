/** @module workshop/main */
import { createFaceArchive, FACE_ARCHIVE_KEY } from '../face-archive.js';
import { captureThumbnail } from '../face-thumbnails.js';
import { applyI18n, initI18n, setupLocaleSelect, t } from '../i18n.js';
import { initUploadConsentFlow } from '../upload-consent.js';
import { createFaceDetector, freezeFrame, loadFaceMesh, openCamera, recordClip } from './media.js';
import { paintLandmarks } from './overlays.js';
import { appendReading, classifyRecognition, recognitionView } from './recognition.js';
import { copySnapshot } from './snapshot.js';
import { createWorkshopUi, recognitionCaption } from './ui.js';

const SAMPLE_INTERVAL_MS = 120;
const RENDER_INTERVAL_MS = 80;

/**
 * Starts the workshop Lab, joining camera, archive, recognition and view.
 * @param {object} [dependencies] Optional local dependencies for deterministic fixtures.
 * @param {object} [dependencies.archive] Face archive.
 * @param {Performance} [dependencies.clock] Monotonic sampling clock.
 * @param {Console} [dependencies.logger] Diagnostic logging without biometric records.
 */
export function initWorkshop({
   archive = createFaceArchive(),
   clock = performance,
   logger = console,
} = {}) {
   initI18n();

   const video = document.getElementById('video');
   const placeholder = document.getElementById('placeholder');
   const saveButton = document.getElementById('saveBtn');
   const recordButton = document.getElementById('recordBtn');
   const copyButton = document.getElementById('copySnapshotBtn');
   const overlayButtons = [...document.querySelectorAll('[data-overlay]')];
   const canvases = {
      '2d': document.getElementById('landmarks-2d'),
      '3d': document.getElementById('landmarks-3d'),
   };
   const events = new EventTarget();
   const ui = createWorkshopUi(document, { save, record, copy, remove, overlay: setOverlay });

   let faces = [];
   let history = null;
   let stream = null;
   let detect = null;
   let pendingDetection = null;
   let last2d = null;
   let mesh = null;
   let meshLoading = null;
   let lastFrame = -1;
   let saving = false;
   let recording = false;
   let sampleTimer;
   let renderTimer;
   let sourceEpoch = 0;

   /** Renders the current result and scrolls the timeline at a fixed time scale. */
   function renderReading() {
      const now = clock.now();
      ui.renderRecognition(recognitionView(history, now), now, faces.length > 0);
   }

   /** Reads workshop references after a local or cross-tab archive change. */
   function refreshFaces() {
      faces = archive.read().faces;
      if (!faces.length) history = null;
      ui.renderFaces(faces);
      renderReading();
   }

   /** Adds one timestamped match decision to the workshop history. */
   function publishSample(detection, at) {
      history = appendReading(history, classifyRecognition({ descriptor: detection?.descriptor, faces }), at);
      renderReading();
   }

   /** Samples a new camera frame, scheduling another pass after current inference. */
   async function sample() {
      const epoch = sourceEpoch;
      const at = clock.now();
      if (video.readyState >= 2 && lastFrame !== video.currentTime && detect && !saving && !document.hidden) {
         lastFrame = video.currentTime;
         if (mesh && !canvases['3d'].hidden) {
            try {
               const { faceLandmarks } = mesh.detectForVideo(video, at);
               paintLandmarks(canvases['3d'], faceLandmarks[0], video, true);
            } catch (error) {
               logger.warn('Workshop mesh inference failed', error);
               setOverlay('3d', false);
               ui.notify(t('lab_mesh_error'));
            }
         }
         try {
            pendingDetection = detect(video);
            const detection = await pendingDetection;
            if (epoch !== sourceEpoch) return;
            last2d = detection?.landmarks?.positions;
            if (!canvases['2d'].hidden) paintLandmarks(canvases['2d'], last2d, video);
            publishSample(detection, clock.now());
         } catch (error) {
            logger.warn('Workshop face recognition failed', error);
         } finally {
            pendingDetection = null;
         }
      }
      if (epoch === sourceEpoch) sampleTimer = setTimeout(sample, SAMPLE_INTERVAL_MS);
   }

   /** Saves a frozen camera frame as one numbered Workshop reference. */
   async function save() {
      if (saving || !detect || video.readyState < 2) return;
      const epoch = sourceEpoch;
      saving = true;
      saveButton.disabled = true;
      try {
         const frame = freezeFrame(video);
         await pendingDetection?.catch(() => null);
         if (epoch !== sourceEpoch) return;
         const result = await detect(frame);
         if (epoch !== sourceEpoch) return;
         if (!result?.descriptor) {
            ui.notify(t('no_face_in_frame_status'));
            return;
         }
         const thumbnail = await captureThumbnail(frame, result.detection?.box).catch(() => null);
         const face = await archive.save({
            descriptor: result.descriptor,
            savedAt: new Date().toISOString(),
            thumbnail,
         });
         refreshFaces();
         ui.notify(t('lab_face_saved', { id: face.id }));
      } catch (error) {
         logger.warn('Could not save Workshop face', error);
         ui.notify(t('lab_face_storage_error'));
      } finally {
         saving = false;
         if (epoch === sourceEpoch) saveButton.disabled = !stream;
      }
   }

   /** Removes a confirmed face ID from the shared archive and refreshes the list. */
   async function remove(id) {
      try {
         await archive.remove(id);
         refreshFaces();
      } catch (error) {
         logger.warn('Could not remove Workshop face', error);
         ui.notify(t('lab_face_storage_error'));
      }
   }

   /** Applies one overlay checkbox independently, loading 3D on first use. */
   function setOverlay(layer, enabled) {
      const button = overlayButtons.find(item => item.dataset.overlay === layer);
      const canvas = canvases[layer];
      canvas.hidden = !enabled;
      button.setAttribute('aria-pressed', String(enabled));
      if (!enabled) {
         paintLandmarks(canvas, null, video);
         return;
      }
      if (layer === '2d') {
         paintLandmarks(canvas, last2d, video);
         return;
      }
      if (mesh || meshLoading) return;
      meshLoading = loadFaceMesh(logger).then(({ detector }) => {
         mesh = detector;
      }).catch(error => {
         logger.warn('Could not load Workshop 3D geometry', error);
         setOverlay('3d', false);
         ui.notify(t('lab_mesh_error'));
      }).finally(() => { meshLoading = null; });
   }

   /** Queues a completed local recording for copy and optional upload. */
   async function record() {
      if (!stream || recording) return;
      recording = true;
      recordButton.disabled = true;
      recordButton.dataset.recording = '';
      try {
         const clip = await recordClip(stream);
         events.dispatchEvent(new CustomEvent('clipRecorded', { detail: clip }));
         ui.notify(t('lab_clip_ready'));
      } catch (error) {
         logger.warn('Could not record Workshop clip', error);
         ui.notify(t('lab_clip_error'));
      } finally {
         recording = false;
         delete recordButton.dataset.recording;
         recordButton.disabled = !stream;
      }
   }

   /** Copies the live frame with the currently available recognition verdict. */
   async function copy() {
      if (!stream || video.readyState < 2) return;
      try {
         const { reading } = recognitionView(history, clock.now());
         const outcome = await copySnapshot(video, [canvases['3d'], canvases['2d']], recognitionCaption(reading));
         if (outcome !== 'cancelled') ui.notify(t('lab_snapshot_' + outcome));
      } catch (error) {
         logger.warn('Could not deliver Workshop snapshot', error);
         ui.notify(t('lab_snapshot_error'));
      }
   }

   /** Reconnects the camera and starts frame sampling once recognition is ready. */
   async function connect() {
      const epoch = ++sourceEpoch;
      placeholder.hidden = false;
      placeholder.textContent = t('placeholder_loading_webcam');
      const detection = detect ? Promise.resolve(detect) : createFaceDetector(globalThis.faceapi);
      const camera = openCamera(video).then(nextStream => {
         if (epoch !== sourceEpoch) {
            nextStream.getTracks().forEach(track => track.stop());
            return;
         }
         stream = nextStream;
         recordButton.disabled = false;
         copyButton.disabled = false;
      });
      const [cameraResult, detectorResult] = await Promise.allSettled([camera, detection]);
      if (epoch !== sourceEpoch) return;
      if (cameraResult.status === 'rejected') {
         logger.warn('Could not start Workshop camera', cameraResult.reason);
         placeholder.textContent = t('lab_camera_error');
         return;
      }
      if (detectorResult.status === 'rejected') {
         logger.warn('Could not load Workshop recognition', detectorResult.reason);
         placeholder.textContent = t('lab_model_error');
         return;
      }
      detect = detectorResult.value;
      placeholder.hidden = true;
      saveButton.disabled = false;
      lastFrame = -1;
      clearTimeout(sampleTimer);
      clearInterval(renderTimer);
      renderTimer = setInterval(renderReading, RENDER_INTERVAL_MS);
      void sample();
   }

   setupLocaleSelect(document.getElementById('localeSelect'), () => {
      applyI18n();
      refreshFaces();
   });
   events.addEventListener('uploadQueueChanged', event => {
      const badge = document.getElementById('gm-upload-badge');
      badge.hidden = !event.detail.count;
      badge.textContent = event.detail.count;
   });
   initUploadConsentFlow({ events, channel: 'makeup', showGhostyle: false, log: message => logger.info(message) });
   window.addEventListener('storage', event => {
      if (event.key === FACE_ARCHIVE_KEY || event.key === null) refreshFaces();
   });
   window.addEventListener('pagehide', () => {
      sourceEpoch++;
      clearTimeout(sampleTimer);
      clearInterval(renderTimer);
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      saveButton.disabled = true;
      recordButton.disabled = true;
      copyButton.disabled = true;
      last2d = null;
      history = null;
   });
   window.addEventListener('pageshow', event => { if (event.persisted) void connect(); });
   refreshFaces();
   void connect();
}

initWorkshop();
