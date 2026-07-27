import { state } from './state.js';
import { loadDb, loadDb3d, renderDbStats } from './db.js';
import { detectFaceInCam, saveFace, seekFaceInDb } from './engine.js';
import { cosineSimilarity, getFaceEmbedding, loadMobileNet, saveFace3d } from './engine-3d.js';
import { MODEL_URLS, DETECTOR_OPTIONS } from './config.js';
import { els, setStatus, clearOverlay } from './dom.js';
import { resizeCanvas } from './camera.js';
import { distance, setLog } from './utils.js';
import { applyI18n, initI18n, setupLocaleSelect, t } from './i18n.js';
import { captureThumbnail, saveThumbnail } from './face-thumbnails.js';

const fileInput = document.getElementById('videoFile');
const seekInput = document.getElementById('videoSeek');
const currentTimeLabel = document.getElementById('currentTimeLabel');
const durationLabel = document.getElementById('durationLabel');
const recordFaceBtn = document.getElementById('recordFaceBtn');
const seekFaceBtn = document.getElementById('seekFaceBtn');
const loaderLog = document.getElementById('loaderLog');

let objectUrl = null;
let entryCounter = 0;
let modelsReady = false;
let actionInFlight = false;
let currentStatus = { kind: 'init', key: 'loader_loading_models_status' };

/**
 * Runtime bridge used by diagnostic overlays, tests, and loader-adjacent tools.
 *
 * @type {object}
 */
window.gstmxx = {
   /**
    * Writes a message into the shared loader log.
    *
    * @param {string} message Message to display.
    * @param {string} sourcePlugin Source label for the log entry.
    * @returns {void}
    */
   log: (message, sourcePlugin) => setLog(message, sourcePlugin),
   events: state.gstmxxEvents,
   /**
    * Returns a defensive copy of the 2D face archive.
    *
    * @returns {object} Cloned 2D face database state.
    */
   getDb: () => structuredClone(state.db),
   /**
    * Returns a defensive copy of the 3D face archive.
    *
    * @returns {object} Cloned 3D face database state.
    */
   getDb3d: () => structuredClone(state.db3d),
   /**
    * Returns the active 2D effect tracked by shared state.
    *
    * @returns {*} Active effect metadata, or null when no effect is active.
    */
   getActiveEffect: () => state.activeEffect,
   /**
    * Returns the last known 2D detection result.
    *
    * @returns {*} Last face-api detection result, or null when unavailable.
    */
   getLastResult: () => state.lastKnownEffectResult,
   /**
    * Returns the active 2D match threshold.
    *
    * @returns {number} 2D descriptor distance threshold.
    */
   getMatchThreshold: () => state.MATCH_THRESHOLD,
   /**
    * Returns the active 3D match threshold.
    *
    * @returns {number} 3D embedding similarity threshold.
    */
   getMatchThreshold3d: () => state.MATCH_THRESHOLD_3D,
   /**
    * Reports that the standalone loader has no active 3D Ghostyle effect.
    *
    * @returns {null} Always null in the MP4 loader.
    */
   getActiveEffect3d: () => null,
   detectorOptions: DETECTOR_OPTIONS,
   get lastLandmarks3d() { return state.lastLandmarks3d; },
   set lastLandmarks3d(v) { state.lastLandmarks3d = v; },
};

/**
 * Updates the loader status label from a translation key and remembers the
 * active status so it can be refreshed after a locale change.
 *
 * @param {string} kind Status class hint passed to the shared status widget.
 * @param {string} key Translation key for the status text.
 * @returns {void}
 */
function setLoaderStatus(kind, key) {
   currentStatus = { kind, key };
   setStatus(kind, t(key));
}

/**
 * Formats a floating-point video timestamp as `mm:ss.mmm`.
 *
 * @param {number} seconds Video time in seconds.
 * @returns {string} Zero-padded display time.
 */
function formatVideoTime(seconds) {
   if (!Number.isFinite(seconds)) return '00:00.000';
   const minutes = Math.floor(seconds / 60);
   const rest = seconds - minutes * 60;
   return `${String(minutes).padStart(2, '0')}:${rest.toFixed(3).padStart(6, '0')}`;
}

/**
 * Reads the current video playhead, duration, percentage, and display label.
 *
 * @returns {{current: number, duration: number, percent: number, label: string}} Current timeline position.
 */
function currentPosition() {
   const current = els.video.currentTime || 0;
   const duration = Number.isFinite(els.video.duration) ? els.video.duration : 0;
   const percent = duration > 0 ? (current / duration) * 100 : 0;
   return {
      current,
      duration,
      percent,
      label: `${formatVideoTime(current)} / ${formatVideoTime(duration)} (${percent.toFixed(2)}%)`,
   };
}

/**
 * Enables or disables face actions based on model, video, and lock state.
 *
 * @param {boolean} enabled Whether the caller wants actions to be available.
 * @returns {void}
 */
function setActionButtonsEnabled(enabled) {
   const ready = enabled && modelsReady && els.video.readyState >= 2 && !actionInFlight;
   recordFaceBtn.disabled = !ready;
   seekFaceBtn.disabled = !ready;
}

/**
 * Synchronizes timeline labels and the seek input with the video element.
 *
 * @returns {void}
 */
function updateTimelineFromVideo() {
   const position = currentPosition();
   currentTimeLabel.textContent = formatVideoTime(position.current);
   durationLabel.textContent = formatVideoTime(position.duration);
   if (!seekInput.matches(':active')) seekInput.value = String(position.current);
}

/**
 * Resizes all diagnostic overlay canvases to match the active video surface.
 *
 * @returns {void}
 */
function syncCanvasSize() {
   resizeCanvas();
   for (const canvas of [document.getElementById('mesh3dOverlay'), document.getElementById('bboxOverlay')]) {
      if (!canvas) continue;
      canvas.width = els.overlay.width;
      canvas.height = els.overlay.height;
   }
}

/**
 * Captures the current video frame plus diagnostic overlays into a canvas.
 *
 * @returns {HTMLCanvasElement} Snapshot canvas used in activity-log entries.
 */
function snapshotCanvas() {
   const canvas = document.createElement('canvas');
   const width = els.video.videoWidth || els.overlay.width || 1280;
   const height = els.video.videoHeight || els.overlay.height || 720;
   canvas.width = width;
   canvas.height = height;
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = '#050505';
   ctx.fillRect(0, 0, width, height);
   try {
      ctx.drawImage(els.video, 0, 0, width, height);
      if (els.overlay.width && els.overlay.height) ctx.drawImage(els.overlay, 0, 0, width, height);
      const bbox = document.getElementById('bboxOverlay');
      if (bbox?.width && bbox?.height) ctx.drawImage(bbox, 0, 0, width, height);
   } catch (err) {
      ctx.fillStyle = '#ffe7a8';
      ctx.font = '700 24px system-ui, sans-serif';
      ctx.fillText(err.message || String(err), 24, 48);
   }
   return canvas;
}

/**
 * Captures and persists the same saved-face preview used by lab.html's history
 * drawer. The loader already has the successful face-api result, so reuse its
 * box instead of running a second detection pass.
 *
 * @param {number} id Saved face id shared by the 2D and 3D stores.
 * @param {*} result face-api detection result returned by saveFace().
 * @returns {Promise<boolean>} Whether a thumbnail was saved.
 */
async function saveFacePreview(id, result) {
   const box = result?.detection?.box;
   if (!box) return false;

   try {
      const dataUrl = await captureThumbnail(els.video, box);
      if (!dataUrl) return false;
      saveThumbnail(id, dataUrl);
      return true;
   } catch (err) {
      setLog(t('thumbnail_capture_failed_log', { message: err.message || String(err) }), 'thumbnails');
      return false;
   }
}

/**
 * Appends a compact metadata chip to an activity-log container.
 *
 * @param {HTMLElement} parent Element that receives the chip.
 * @param {string} label Chip label.
 * @param {*} value Chip value rendered as text.
 * @returns {void}
 */
function appendChip(parent, label, value) {
   const chip = document.createElement('span');
   chip.className = 'loader-chip';
   chip.textContent = `${label}: ${value}`;
   parent.appendChild(chip);
}

/**
 * Prepends a diagnostic activity entry with snapshot, summary chips, and JSON details.
 *
 * @param {string} kind Human-readable action name.
 * @param {HTMLCanvasElement} snapshot Canvas snapshot for the entry.
 * @param {{position: object, metrics: Object.<string, *>}} summary Position and headline metrics.
 * @param {*} details Structured details rendered in the entry body.
 * @returns {void}
 */
function appendEntry(kind, snapshot, summary, details) {
   entryCounter += 1;
   const entry = document.createElement('article');
   entry.className = 'loader-entry';

   entry.appendChild(snapshot);

   const body = document.createElement('div');
   body.className = 'loader-entry__body';

   const title = document.createElement('h3');
   title.textContent = `#${entryCounter} ${kind}`;
   body.appendChild(title);

   const meta = document.createElement('div');
   meta.className = 'loader-entry__meta';
   appendChip(meta, t('loader_chip_pressed'), new Date().toLocaleString());
   appendChip(meta, t('loader_chip_video'), summary.position.label);
   body.appendChild(meta);

   const metrics = document.createElement('div');
   metrics.className = 'loader-entry__metrics';
   for (const [label, value] of Object.entries(summary.metrics)) appendChip(metrics, label, value);
   body.appendChild(metrics);

   const pre = document.createElement('pre');
   pre.textContent = JSON.stringify(details, null, 2);
   body.appendChild(pre);

   entry.appendChild(body);
   loaderLog.prepend(entry);
}

/**
 * Extracts stable 2D and 3D face-detection details for logging.
 *
 * @param {*} result face-api detection result.
 * @returns {object} Serializable face summary.
 */
function summarizeFace(result) {
   const landmarks = result?.landmarks;
   const box = result?.detection?.box;
   return {
      detectionScore: result?.detection?.score ?? null,
      descriptorLength: result?.descriptor?.length ?? 0,
      landmarks2d: landmarks?.positions?.length ?? landmarks?.getPositions?.()?.length ?? 0,
      age: Number.isFinite(result?.age) ? Math.round(result.age) : null,
      gender: result?.gender || null,
      genderProbability: Number.isFinite(result?.genderProbability) ? result.genderProbability : null,
      box: box ? {
         x: Math.round(box.x),
         y: Math.round(box.y),
         width: Math.round(box.width),
         height: Math.round(box.height),
      } : null,
      landmarks3d: Array.isArray(state.lastLandmarks3d) ? state.lastLandmarks3d.length : 0,
   };
}

/**
 * Computes sorted descriptor distances between a live 2D result and saved faces.
 *
 * @param {*} result face-api detection result containing a descriptor.
 * @returns {Array<object>} Distances sorted from nearest to farthest.
 */
function get2dDistances(result) {
   const descriptor = result?.descriptor;
   return (state.db?.faces || []).map((face) => {
      const faceDistance = distance(descriptor, face.descriptor);
      return {
         id: face.id,
         distance: faceDistance,
         threshold: state.MATCH_THRESHOLD,
         match: faceDistance <= state.MATCH_THRESHOLD,
      };
   }).sort((a, b) => a.distance - b.distance);
}

/**
 * Computes sorted cosine-similarity matches for a live 3D embedding.
 *
 * @param {Float32Array|number[]|null} embedding Live MediaPipe embedding.
 * @returns {Array<object>} Matches sorted from highest to lowest similarity.
 */
function get3dDistances(embedding) {
   if (!embedding) return [];
   return (state.db3d?.faces || []).map((face) => {
      const similarity = cosineSimilarity(embedding, face.descriptor3d);
      return {
         id: face.id,
         similarity,
         distance: 1 - similarity,
         threshold: state.MATCH_THRESHOLD_3D,
         match: similarity >= state.MATCH_THRESHOLD_3D,
      };
   }).sort((a, b) => b.similarity - a.similarity);
}

/**
 * Collapses 2D and 3D detection states into the shared overall match state.
 *
 * @param {?object} faceapiSection 2D match section.
 * @param {?object} mediapipeSection 3D match section.
 * @returns {string} Overall state used by the readout event bus.
 */
function buildOverall(faceapiSection, mediapipeSection) {
   const f = faceapiSection?.detectionState;
   const m = mediapipeSection?.detectionState;
   if (!f || !m) return 'unknown';
   return f === m ? f : 'partial-elusion';
}

/**
 * Runs a face action while preventing concurrent Record/Seek operations.
 *
 * @param {Function} fn Action callback to execute under the lock.
 * @returns {Promise<void>}
 */
async function withActionLock(fn) {
   if (actionInFlight) return;
   actionInFlight = true;
   setActionButtonsEnabled(false);
   try {
      await fn();
   } catch (err) {
      setLoaderStatus('error', 'loader_status_action_failed');
      appendEntry(t('loader_action_error'), snapshotCanvas(), {
         position: currentPosition(),
         metrics: { error: err.message || String(err) },
      }, { error: err.stack || err.message || String(err) });
   } finally {
      actionInFlight = false;
      setActionButtonsEnabled(true);
   }
}

/**
 * Saves the face visible at the current video frame into the 2D and 3D archives.
 *
 * @returns {Promise<void>}
 */
async function recordFace() {
   await withActionLock(async () => {
      syncCanvasSize();
      const position = currentPosition();
      const saved2d = await saveFace();
      if (!saved2d) {
         appendEntry(t('loader_action_record_face'), snapshotCanvas(), {
            position,
            metrics: { result: t('loader_no_face_result') },
         }, { message: t('loader_no_2d_face_message') });
         return;
      }

      const previewSaved = await saveFacePreview(saved2d.id, saved2d.result);
      const saved3d = await saveFace3d(saved2d.id);
      const embedding = saved3d ? (state.db3d.faces.find((face) => face.id === saved2d.id)?.descriptor3d || null) : null;
      const features = summarizeFace(saved2d.result);

      const faceapiSection = {
         detectionState: 'matched',
         distance: 0,
         matchedId: saved2d.id,
         liveMinDist: 0,
         liveMinId: saved2d.id,
      };
      const mediapipeSection = saved3d ? {
         detectionState: 'matched',
         similarity: saved3d.liveInfo3d?.liveMaxSim ?? 1,
         matchedId: saved2d.id,
         liveMaxSim: saved3d.liveInfo3d?.liveMaxSim ?? 1,
         liveMaxId: saved2d.id,
      } : null;

      state.gstmxxEvents.dispatchEvent(new CustomEvent('detection', {
         detail: { result: saved2d.result, activeEffect: null }
      }));
      state.gstmxxEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
         detail: {
            source: 'save',
            ghostylePresent: false,
            faceapi: faceapiSection,
            mediapipe: mediapipeSection,
            overall: buildOverall(faceapiSection, mediapipeSection),
         }
      }));

      appendEntry(t('loader_action_record_face'), snapshotCanvas(), {
         position,
         metrics: {
            id: saved2d.id,
            '2D score': features.detectionScore?.toFixed(4) ?? 'n/a',
            '2D landmarks': features.landmarks2d,
            '3D vector': embedding ? embedding.length : 'unavailable',
            preview: previewSaved ? 'saved' : 'unavailable',
         },
      }, {
         action: 'record face',
         savedId: saved2d.id,
         previewSaved,
         video: position,
         faceapi: features,
         mediapipe: {
            saved: !!saved3d,
            embeddingLength: embedding ? embedding.length : 0,
            selfSimilarity: saved3d?.liveInfo3d?.liveMaxSim ?? null,
         },
      });
   });
}

/**
 * Searches the saved 2D and 3D face archives for the face in the current frame.
 *
 * @returns {Promise<void>}
 */
async function seekFace() {
   await withActionLock(async () => {
      syncCanvasSize();
      const position = currentPosition();
      const result = await detectFaceInCam(true);
      if (!result) {
         appendEntry(t('loader_action_seek_face'), snapshotCanvas(), {
            position,
            metrics: { result: t('loader_no_face_result') },
         }, { message: t('loader_no_2d_face_message') });
         return;
      }

      const liveInfo = seekFaceInDb(result);
      const embedding = await getFaceEmbedding(els.video).catch(() => null);
      const distances2d = get2dDistances(result);
      const distances3d = get3dDistances(embedding);
      const best3d = distances3d[0] || null;

      const faceapiSection = {
         detectionState: liveInfo.liveMinDist != null && liveInfo.liveMinDist <= state.MATCH_THRESHOLD ? 'matched' : 'eluded',
         distance: liveInfo.liveMinDist,
         matchedId: liveInfo.liveMinDist != null && liveInfo.liveMinDist <= state.MATCH_THRESHOLD ? liveInfo.liveMinId : null,
         liveMinDist: liveInfo.liveMinDist,
         liveMinId: liveInfo.liveMinId,
      };
      const mediapipeSection = best3d ? {
         detectionState: best3d.similarity >= state.MATCH_THRESHOLD_3D ? 'matched' : 'eluded',
         similarity: best3d.similarity,
         matchedId: best3d.similarity >= state.MATCH_THRESHOLD_3D ? best3d.id : null,
         liveMaxSim: best3d.similarity,
         liveMaxId: best3d.id,
      } : null;

      state.gstmxxEvents.dispatchEvent(new CustomEvent('detection', {
         detail: { result, activeEffect: null }
      }));
      state.gstmxxEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
         detail: {
            source: 'find',
            ghostylePresent: false,
            faceapi: faceapiSection,
            mediapipe: mediapipeSection,
            overall: buildOverall(faceapiSection, mediapipeSection),
         }
      }));

      appendEntry(t('loader_action_seek_face'), snapshotCanvas(), {
         position,
         metrics: {
            '2D closest': distances2d[0] ? `ID ${distances2d[0].id} / ${distances2d[0].distance.toFixed(4)}` : 'empty DB',
            '3D closest': best3d ? `ID ${best3d.id} / ${best3d.similarity.toFixed(4)}` : 'empty DB',
            'faces compared': Math.max(distances2d.length, distances3d.length),
         },
      }, {
         action: 'seek face',
         video: position,
         features: summarizeFace(result),
         faceapi: {
            threshold: state.MATCH_THRESHOLD,
            nearest: liveInfo,
            distances: distances2d,
         },
         mediapipe: {
            threshold: state.MATCH_THRESHOLD_3D,
            embeddingLength: embedding ? embedding.length : 0,
            distances: distances3d,
         },
      });
   });
}

/**
 * Loads face-api model weights and the MediaPipe 3D embedder required by the loader.
 *
 * @returns {Promise<void>}
 */
async function loadModels() {
   setLoaderStatus('init', 'loader_status_loading_faceapi');
   await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URLS.tiny),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URLS.landmarks),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URLS.recognition),
      faceapi.nets.ageGenderNet.loadFromUri(MODEL_URLS.ageGender),
   ]);

   setLoaderStatus('init', 'loader_status_loading_3d_embedder');
   await loadMobileNet();
}

/**
 * Wires file input, video timeline, seek, playback, and resize event handlers.
 *
 * @returns {void}
 */
function bindVideo() {
   fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      clearOverlay();
      els.video.srcObject = null;
      els.video.src = objectUrl;
      els.video.load();
      els.placeholder.style.display = 'none';
      setLog(t('loader_log_loaded_local_video', { name: file.name }), 'loader');
   });

   els.video.addEventListener('loadedmetadata', () => {
      seekInput.max = String(Number.isFinite(els.video.duration) ? els.video.duration : 0);
      seekInput.disabled = false;
      syncCanvasSize();
      updateTimelineFromVideo();
      setActionButtonsEnabled(true);
   });
   els.video.addEventListener('loadeddata', () => {
      syncCanvasSize();
      setActionButtonsEnabled(true);
   });
   els.video.addEventListener('timeupdate', updateTimelineFromVideo);
   els.video.addEventListener('seeked', () => {
      syncCanvasSize();
      updateTimelineFromVideo();
   });
   els.video.addEventListener('play', () => setActionButtonsEnabled(true));
   els.video.addEventListener('pause', () => setActionButtonsEnabled(true));

   seekInput.addEventListener('input', () => {
      els.video.currentTime = Number(seekInput.value) || 0;
      updateTimelineFromVideo();
   });

   window.addEventListener('resize', syncCanvasSize);
}

/**
 * Initializes localization, local databases, video bindings, models, and actions.
 *
 * @returns {Promise<void>}
 */
async function init() {
   initI18n();
   setupLocaleSelect(document.getElementById('localeSelect'), () => {
      applyI18n();
      setLoaderStatus(currentStatus.kind, currentStatus.key);
   });
   applyI18n();
   state.db = loadDb();
   state.db3d = loadDb3d();
   state.isMirrored = false;
   renderDbStats();
   bindVideo();

   recordFaceBtn.addEventListener('click', recordFace);
   seekFaceBtn.addEventListener('click', seekFace);

   try {
      await loadModels();
      modelsReady = true;
      setLoaderStatus('live', 'loader_status_ready');
      setLog(t('loader_ready_log'), 'loader');
      state.gstmxxEvents.dispatchEvent(new CustomEvent('ready', { detail: {} }));
      window.dispatchEvent(new CustomEvent('gstmxxReady'));
      setActionButtonsEnabled(true);
   } catch (err) {
      setLoaderStatus('error', 'loader_status_model_load_failed');
      setLog(t('loader_model_error_log', { message: err.message || err }), 'loader');
   }
}

init();
