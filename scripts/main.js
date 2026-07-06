/** @module main */
import { distance, avgPoint, lerp, scaleFrom, point, drawClosedPath, drawOpenPath, drawLabel, roundRect, expandEyePolygon, drawEyeWing, drawCheekSweep, drawContourBand, clipLeftHalf, clipRightHalf, clipLeftHalfUV, clipRightHalfUV, setLog, updateLogDisplay } from './utils.js';
import { state } from './state.js';
import { loadDb, loadDb3d, persistDb, persistDb3d, renderDbStats, clearDb } from './db.js';
import { saveFace, compositeAndDetect } from './engine.js';
import { loadMobileNet, saveFace3d, compositeAndDetect3d } from './engine-3d.js';
import { startCamera, resizeCanvas, startEffectLoop, recordOneSecond } from './camera.js';
import { MODEL_URLS, DETECTOR_OPTIONS } from './config.js';
import { els, setStatus, clearOverlay } from './dom.js';
import { loadGhostyle, reloadPlugins } from './ghostyles-manager.js';
import { initPlugins3dLoader, getActiveEffect3d, activateEffect3d, deactivateEffect3d, toggleEffect3d, reloadPlugins3d } from './plugins3d-loader.js';
import { exportMakeup } from './export-makeup.js';
import { setOverlayMode, OVERLAY_MODE_STORAGE_KEY, OVERLAY_MODES } from './bbox-overlay.js';
import { openAnalyzePanel } from './analyze-panel.js';
import { captureThumbnail, deleteThumbnail, getThumbnail, saveThumbnail } from './face-thumbnails.js';

function overlayModeLabel(mode) {
   return OVERLAY_MODES[mode] || OVERLAY_MODES.bbox;
}

function readInitialOverlayMode() {
   try {
      const raw = localStorage.getItem(OVERLAY_MODE_STORAGE_KEY);
      return Object.keys(OVERLAY_MODES).includes(raw) ? raw : 'bbox';
   } catch {
      return 'bbox';
   }
}

function isLocalPluginDevHost() {
   const host = window.location.hostname;
   return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
}

// Mirror toggle logic (fallback, hidden in UI)
if (els.mirrorToggle) {
   els.mirrorToggle.addEventListener('click', () => {
      state.isMirrored = !state.isMirrored;
      els.video.style.transform = state.isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
      els.overlay.style.transform = state.isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
      els.mirrorToggle.classList.toggle('mirrored', state.isMirrored);
      els.mirrorToggle.textContent = state.isMirrored ? 'Webcam speculare: ON' : 'Mirror webcam';
   });
}

// Switch Camera logic
if (els.switchCameraBtn) {
   els.switchCameraBtn.addEventListener('click', async () => {
      state.currentFacingMode = state.currentFacingMode === 'user' ? 'environment' : 'user';
      setLog(`Cambio fotocamera... (${state.currentFacingMode})`);
      if (els.video.srcObject) {
         els.video.srcObject.getTracks().forEach(track => track.stop());
      }
      try {
         await startCamera(state, els);
      } catch (err) {
         handleError(err, 'Errore nel cambio fotocamera.');
      }
   });
}


window.gstmxx = {
   log: (message, sourcePlugin) => setLog(message, sourcePlugin),
   clearVisibleLogs: () => {
      state.visibleLogStartIndex = state.logsArchive.length;
      updateLogDisplay();
   },
   /* queste le funzioni utili nei plugin */
   distance,
   avgPoint,
   lerp,
   scaleFrom,
   point,
   drawClosedPath,
   drawOpenPath,
   drawLabel,
   roundRect,
   expandEyePolygon,
   drawEyeWing,
   drawCheekSweep,
   drawContourBand,
   clipLeftHalf,
   clipRightHalf,
   clipLeftHalfUV,
   clipRightHalfUV,
   /* fine delle funzioni usate nei plugin, ora implementate in utils.js */
   events: state.gstmxxEvents,
   getDb: () => structuredClone(state.db),
   getDb3d: () => structuredClone(state.db3d),
   getActiveEffect: () => state.activeEffect,
   getLastResult: () => state.lastKnownEffectResult,
   getMatchThreshold: () => state.MATCH_THRESHOLD,
   getMatchThreshold3d: () => state.MATCH_THRESHOLD_3D,
   getActiveEffect3d: () => getActiveEffect3d(),
   activateEffect3d: (id) => activateEffect3d(id),
   deactivateEffect3d: () => deactivateEffect3d(),
   toggleEffect3d: (id) => toggleEffect3d(id),
   reloadPlugins3d: () => reloadPlugins3d(),
   reloadPlugins: async () => reloadPlugins({
      onFaceapiToggle: () => startEffectLoop(state, els)
   }),
   get lastLandmarks3d() { return state.lastLandmarks3d; },
   set lastLandmarks3d(v) { state.lastLandmarks3d = v; },
   compositeAndDetect: (liveResult) => compositeAndDetect(liveResult),
   compositeAndDetect3d: () => compositeAndDetect3d(),
   detectorOptions: DETECTOR_OPTIONS
};

// International alias (see redesign/ghostati-ghostmaxxing-naming-brief.txt)
window.gstmxx = window.gstmxx;

/**
 * Sets the busy flag for the whole UI, disabling/enabling controls during asynchronous operations.
 *
 * @param {boolean} isBusy - When true, UI controls are disabled to prevent concurrent actions.
 * @see init – called during startup to manage UI state while models load.
 * @see loadModels – UI is set busy while models are loading.
 * @see toggleEffect – disables controls while an effect is being applied.
 */
export function setBusy(isBusy) {
   state.isSystemBusy = isBusy;
   [els.copyMakeupBtn, els.saveBtn, els.analyzeBtn, els.overlayModeBtn, els.clearDbBtn, els.recordBtn, els.reloadPluginsBtn].forEach(btn => {
      if (btn) {
         if (btn === els.copyMakeupBtn && !state.lastCompositedCanvas) btn.disabled = true;
         else if (btn === els.recordBtn && state.isRecording) btn.disabled = true;
         else btn.disabled = isBusy;
      }
   });
   const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
   previewBtns.forEach(btn => btn.disabled = isBusy);
}

/**
 * Loads all required face-api.js models for facial detection, landmarks, recognition, and age/gender.
 * This is called during application startup to ensure the models are cached before any webcam processing.
 *
 * @see init – the main initialization routine that invokes `loadModels` before starting the camera.
 * @see setStatus – updates UI status while models are being loaded.
 */
async function loadModels() {
   setStatus('init', 'caricamento modelli');
   await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URLS.tiny),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URLS.landmarks),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URLS.recognition),
      faceapi.nets.ageGenderNet.loadFromUri(MODEL_URLS.ageGender),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URLS.expressions)
   ]);
}

/**
 * Centralized error handling for UI actions.
 * Logs the fallback message, the error details, updates the status UI, shows the placeholder, and records the full message in the log.
 *
 * @param {Error} err - The caught error object.
 * @param {string} fallbackMessage - User‑friendly message describing the context of the error.
 * @see init – uses handleError for camera initialization failures.
 * @see toggleEffect – uses handleError when scanning or applying effects fails.
 */
function handleError(err, fallbackMessage) {
   console.log('Errore:', fallbackMessage);
   console.error(err);
   setStatus('error', 'errore');
   els.placeholder.style.display = 'grid';
   const detail = err && err.message ? ` (${err.message})` : '';
   setLog(fallbackMessage + detail);
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified payload helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the `overall` field of a matchStateChanged payload.
 * @param {object|null} faceapiSection
 * @param {object|null} mediapipeSection
 * @returns {'matched'|'eluded'|'partial-elusion'|'unknown'}
 */
function computeOverall(faceapiSection, mediapipeSection) {
   if (!faceapiSection && !mediapipeSection) return 'unknown';
   const f = faceapiSection?.detectionState;
   const m = mediapipeSection?.detectionState;
   if (!f || !m) return 'unknown';
   if (f === m) return f; // both 'matched' or both 'eluded'
   return 'partial-elusion';
}

/**
 * Build the `faceapi` section for a save action.
 * After saving, the best match IS the saved face (dist ≈ 0), so we report
 * detectionState: 'matched' unconditionally.
 * @param {{ id, result }} saved2d
 * @returns {object}
 */
function buildFaceapiSaveSection(saved2d) {
   return {
      detectionState: 'matched',
      distance: 0,
      matchedId: saved2d.id,
      liveMinDist: 0,
      liveMinId: saved2d.id,
      obfMinDist: null,
      obfMinId: null,
   };
}

/**
 * Build the `mediapipe` section for a save action.
 * @param {{ id, liveInfo3d }} saved3d
 * @param {number} id
 * @returns {object}
 */
function buildMediapipeSaveSection(saved3d, id) {
   return {
      detectionState: 'matched',
      similarity: 1.0, // just saved — perfect self-match
      matchedId: id,
      liveMaxSim: saved3d.liveInfo3d?.liveMaxSim ?? 1.0,
      liveMaxId: id,
      obfMaxSim: null,
      obfMaxId: null,
   };
}

let historyInitialized = false;

function collectCurrentFaceIds() {
   const ids = new Set();
   for (const face of (state.db?.faces || [])) ids.add(face.id);
   for (const face of (state.db3d?.faces || [])) ids.add(face.id);
   return Array.from(ids).sort((a, b) => b - a);
}

function has2dRecord(id) {
   return (state.db?.faces || []).some((face) => face.id === id);
}

function has3dRecord(id) {
   return (state.db3d?.faces || []).some((face) => face.id === id);
}

function getSavedAtForHistory(id) {
   const record2d = (state.db?.faces || []).find((face) => face.id === id);
   if (record2d?.savedAt) return record2d.savedAt;

   const record3d = (state.db3d?.faces || []).find((face) => face.id === id);
   return record3d?.savedAt || null;
}

function formatHistoryTime(savedAt) {
   if (!savedAt) return '--:--';
   const date = new Date(savedAt);
   if (Number.isNaN(date.getTime())) return '--:--';

   const hours = String(date.getHours()).padStart(2, '0');
   const minutes = String(date.getMinutes()).padStart(2, '0');
   return `${hours}:${minutes}`;
}

function createHistoryStatus(label, present) {
   const status = document.createElement('div');
   status.className = 'history-status';

   const dot = document.createElement('span');
   dot.className = `history-dot ${present ? 'present' : 'missing'}`;
   status.appendChild(dot);

   const text = document.createElement('span');
   text.textContent = label;
   status.appendChild(text);

   return status;
}

function removeFaceById(id) {
   state.db.faces = state.db.faces.filter((face) => face.id !== id);
   state.db3d.faces = state.db3d.faces.filter((face) => face.id !== id);

   deleteThumbnail(id);
   persistDb3d();
   persistDb();
   renderDbStats(state, els);
}

function createHistoryCard(id) {
   const card = document.createElement('article');
   card.className = 'history-card';
   card.dataset.id = String(id);
   const savedAt = getSavedAtForHistory(id);

   const dataUrl = getThumbnail(id);
   if (dataUrl) {
      const thumb = document.createElement('img');
      thumb.className = 'history-thumb';
      thumb.alt = `Face thumbnail ID ${id}`;
      thumb.src = dataUrl;
      card.appendChild(thumb);
   } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'history-placeholder';
      placeholder.textContent = 'no preview';
      card.appendChild(placeholder);
   }

   const idRow = document.createElement('div');
   idRow.className = 'history-id-row';

   const idLabel = document.createElement('div');
   idLabel.className = 'history-id';
   idLabel.textContent = `ID ${id}`;
   idRow.appendChild(idLabel);

   const timeLabel = document.createElement('div');
   timeLabel.className = 'history-time';
   timeLabel.textContent = formatHistoryTime(savedAt);
   if (savedAt) timeLabel.title = savedAt;
   idRow.appendChild(timeLabel);

   card.appendChild(idRow);

   const statusRow = document.createElement('div');
   statusRow.className = 'history-status-row';
   statusRow.appendChild(createHistoryStatus('2D', has2dRecord(id)));
   statusRow.appendChild(createHistoryStatus('3D', has3dRecord(id)));
   card.appendChild(statusRow);

   const actions = document.createElement('div');
   actions.className = 'history-actions';

   const deleteBtn = document.createElement('button');
   deleteBtn.type = 'button';
   deleteBtn.className = 'history-delete';
   deleteBtn.title = `Cancella ID ${id}`;
   const deleteIconMarkup = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
   let confirmTimeoutId = null;

   function resetDeleteButton() {
      if (confirmTimeoutId) {
         clearTimeout(confirmTimeoutId);
         confirmTimeoutId = null;
      }
      deleteBtn.classList.remove('confirm-pending');
      deleteBtn.innerHTML = deleteIconMarkup;
      deleteBtn.title = `Cancella ID ${id}`;
      deleteBtn.setAttribute('aria-label', `Cancella ID ${id}`);
   }

   deleteBtn.innerHTML = deleteIconMarkup;
   deleteBtn.setAttribute('aria-label', `Cancella ID ${id}`);
   deleteBtn.addEventListener('click', () => {
      if (!deleteBtn.classList.contains('confirm-pending')) {
         deleteBtn.classList.add('confirm-pending');
         deleteBtn.textContent = 'OK';
         deleteBtn.title = `Conferma cancellazione ID ${id}`;
         deleteBtn.setAttribute('aria-label', `Conferma cancellazione ID ${id}`);
         confirmTimeoutId = setTimeout(resetDeleteButton, 2000);
         return;
      }

      resetDeleteButton();
      removeFaceById(id);
   });

   actions.appendChild(deleteBtn);
   card.appendChild(actions);

   return card;
}

function renderHistoryEntries() {
   if (!els.historyEntries) return;

   // TODO: optimize with diff against current visible IDs to avoid full rebuilds.
   els.historyEntries.innerHTML = '';
   const ids = collectCurrentFaceIds();

   if (!ids.length) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'Nessun volto salvato.';
      els.historyEntries.appendChild(empty);
      return;
   }

   for (const id of ids) {
      els.historyEntries.appendChild(createHistoryCard(id));
   }
}

function openHistoryDrawer() {
   if (!els.historyDrawer) return;
   if (els.settingsDrawer) els.settingsDrawer.classList.add('hidden');
   if (!historyInitialized) {
      historyInitialized = true;
      renderHistoryEntries();
   }
   els.historyDrawer.classList.remove('hidden');
}

function closeHistoryDrawer() {
   if (!els.historyDrawer) return;
   els.historyDrawer.classList.add('hidden');
}

function toggleHistoryDrawer() {
   if (!els.historyDrawer) return;
   if (els.historyDrawer.classList.contains('hidden')) {
      openHistoryDrawer();
      return;
   }
   closeHistoryDrawer();
}

async function tryCaptureThumbnailOnSave() {
   const detection = state.lastKnownEffectResult?.detection?.box
      ? { box: state.lastKnownEffectResult.detection.box }
      : await faceapi.detectSingleFace(els.video, DETECTOR_OPTIONS);

   if (!detection?.box) return null;
   return captureThumbnail(els.video, detection.box);
}

/**
 * Initializes the application: loads the database, renders statistics, sets up the canvas,
 * registers UI event listeners, loads models, ghostyle plugins, and starts the webcam.
 * This is the entry point called at the end of the script.
 *
 * @see loadModels – called within init to load face-api.js models before webcam activation.
 * @see init(); – the function is invoked at the bottom of the script to start the app.
 */
async function init() {
   state.db = loadDb();
   state.db3d = loadDb3d();
   renderDbStats(state, els);
   resizeCanvas(els);

   if (els.toggleHistoryBtn) {
      els.toggleHistoryBtn.addEventListener('click', toggleHistoryDrawer);
   }
   if (els.closeHistoryBtn) {
      els.closeHistoryBtn.addEventListener('click', closeHistoryDrawer);
   }
   if (els.toggleSettingsBtn && els.historyDrawer && els.settingsDrawer) {
      els.toggleSettingsBtn.addEventListener('click', () => {
         if (!els.settingsDrawer.classList.contains('hidden')) {
            closeHistoryDrawer();
         }
      });
   }
   if (els.closeSettingsBtn && els.historyDrawer) {
      els.closeSettingsBtn.addEventListener('click', closeHistoryDrawer);
   }

   if (els.reloadPluginsBtn) {
      if (isLocalPluginDevHost()) {
         els.reloadPluginsBtn.style.display = '';
         els.reloadPluginsBtn.addEventListener('click', async () => {
            setLog('Ricarica plugin in corso...', 'loader');
            try {
               const loaded = await reloadPlugins({
                  onFaceapiToggle: () => startEffectLoop(state, els)
               });
               setLog(`Reload completato: ${loaded} plugin caricati.`, 'loader');
            } catch (err) {
               setLog(`Errore durante reload plugins: ${err.message || err}`, 'loader');
            }
         });
      } else {
         els.reloadPluginsBtn.style.display = 'none';
      }
   }

   state.gstmxxEvents.addEventListener('dbChanged', renderHistoryEntries);

   const initialOverlayMode = readInitialOverlayMode();
   setOverlayMode(initialOverlayMode);
   if (els.overlayModeBtn) {
      els.overlayModeBtn.textContent = overlayModeLabel(initialOverlayMode);
      els.overlayModeBtn.addEventListener('click', () => {
         const currentMode = els.overlayModeBtn.dataset.overlayMode || initialOverlayMode;
         const keys = Object.keys(OVERLAY_MODES);
         const currentIndex = keys.indexOf(currentMode);
         const nextMode = keys[(currentIndex + 1) % keys.length];
         els.overlayModeBtn.dataset.overlayMode = setOverlayMode(nextMode);
         els.overlayModeBtn.textContent = overlayModeLabel(els.overlayModeBtn.dataset.overlayMode);
      });
      els.overlayModeBtn.dataset.overlayMode = initialOverlayMode;
   }

   window.addEventListener('resize', function () {
      resizeCanvas(els);
   });

   if (els.logBox) {
      els.logBox.addEventListener('click', () => {
         state.isLogExpanded = !state.isLogExpanded;
         updateLogDisplay();
      });
   }

   els.copyMakeupBtn.addEventListener('click', exportMakeup);

   if (els.recordBtn) {
      els.recordBtn.addEventListener('click', recordOneSecond);
   }

   els.saveBtn.addEventListener('click', async () => {
      setBusy(true);
      try {
         let thumbnailDataUrl = null;
         try {
            thumbnailDataUrl = await tryCaptureThumbnailOnSave();
         } catch (thumbErr) {
            setLog(`Thumbnail capture failed: ${thumbErr.message || thumbErr}`, 'thumbnails');
         }

         // 1. 2D engine: detect + save; returns { id, result } or null
         const saved2d = await saveFace();
         if (!saved2d) return;
         const { id } = saved2d;

         if (thumbnailDataUrl) saveThumbnail(id, thumbnailDataUrl);

         // 2. 3D engine: extract ImageEmbedder embedding + save under the same ID
         const saved3d = await saveFace3d(id);

         // Keep listeners synced with potential 3D-only status changes on the card.
         state.gstmxxEvents.dispatchEvent(new CustomEvent('dbChanged', {
            detail: {
               count: state.db.faces.length,
               nextId: state.db.nextId,
            }
         }));

         // 3. Build unified payload
         const faceapiSection = buildFaceapiSaveSection(saved2d);
         const mediapipeSection = saved3d
            ? buildMediapipeSaveSection(saved3d, id)
            : null;

         state.gstmxxEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
            detail: {
               source: 'save',
               ghostylePresent: false,
               faceapi: faceapiSection,
               mediapipe: mediapipeSection,
               overall: computeOverall(faceapiSection, mediapipeSection),
            }
         }));
      }
      catch (err) { handleError(err, 'Errore durante il salvataggio del volto.'); }
      finally {
         setBusy(false);
         if (state.activeEffect) startEffectLoop(state, els);
      }
   });

   els.analyzeBtn.addEventListener('click', async () => {
      setBusy(true);
      try {
         await openAnalyzePanel();
      }
      catch (err) { handleError(err, 'Errore durante l\'analisi del trucco.'); }
      finally {
         setBusy(false);
      }
   });

   els.clearDbBtn.addEventListener('click', () => {
      const svgIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
      if (els.clearDbBtn.textContent === 'Conferma?') {
         clearDb(state, els);
         els.clearDbBtn.innerHTML = svgIcon;
      } else {
         els.clearDbBtn.textContent = 'Conferma?';
         setTimeout(() => {
            if (els.clearDbBtn.textContent === 'Conferma?') {
               els.clearDbBtn.innerHTML = svgIcon;
            }
         }, 4000);
      }
   });

   setBusy(true);
   setLog('Caricamento sistema di riconoscimento facciale (face-api.js)...')
   try {
      await loadModels();
   } catch (err) {
      setLog('Errore durante il caricamento: ' + err.message);
      return;
   }

   setLog('Caricamento ImageEmbedder per il motore di riconoscimento 3D...');
   try {
      await loadMobileNet();
   } catch (err) {
      setLog('ImageEmbedder non disponibile: ' + err.message + ' — solo face-api attivo.');
   }

   setLog('Caricamento plugin di makeup in corso...')
   try {
      initPlugins3dLoader({
         getFaceLandmarker: () => (window.gstmxx && window.gstmxx.FaceLandmarker) || null
      });

      /* Unified manifest: all plugins are loaded through ghostyles-manager. */
      const relurl = window.location.pathname.split('/').slice(0, -1).join('/')
      const ghostListUrl = relurl + '/ghostyles.json'
      const ghostylistRes = await fetch(ghostListUrl);
      if (ghostylistRes.ok) {
         const list = await ghostylistRes.json();
         for (const item of list) {
            let effectiveUrl = relurl + '/' + item.url;
            await loadGhostyle(effectiveUrl, item.id || item.name, {
               onFaceapiToggle: () => startEffectLoop(state, els)
            });
         }
      }
      else
         throw new Error(`HTTP ${ghostylistRes.status}`);
   } catch (err) {
      setLog('Errore durante la lettura di ghostyles.json: ' + err.message);
   }

   setLog('Inizializzazione completata. Avvio webcam in corso...');
   try {
      await startCamera(state, els);
   } catch (err) {
      handleError(err, 'Impossibile inizializzare webcam: verifica i permessi camera per ' + window.location.origin);
      return;
   }

   /*
   // DEBUG: intercetta tutti gli errori non catturati nei listener
   window.addEventListener('unhandledrejection', e => {
      console.error('[unhandledrejection]', e.reason);
   });

   // DEBUG: log di tutti gli eventi del bus
   const _origDispatch = state.gstmxxEvents.dispatchEvent.bind(state.gstmxxEvents);
   state.gstmxxEvents.dispatchEvent = function (event) {
      if (!(event.type === "landmarks3d" ||
         event.type === "detection" ||
         event.type === "matchStateChanged"))
         console.debug(`[event:${event.type}]`, event.detail);
      return _origDispatch(event);
   };
   */

   setLog('Tutto pronto! Inizia scansionando il tuo volto o attivando una guida makeup.');
   setBusy(false);
   state.gstmxxEvents.dispatchEvent(new CustomEvent('ready', { detail: {} }));

   // Questo evento segnala ai file con i loop, che l'ambiente è pronto, e troveranno
   // state, els, e window.gstmxx pronti.
   window.dispatchEvent(new CustomEvent('ghostatiReady'));
}

if (typeof process === 'undefined' || !process.env.VITEST) {
   init();
}