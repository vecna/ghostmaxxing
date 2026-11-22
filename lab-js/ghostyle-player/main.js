/** @module ghostyle-player/main */
import { initI18n, t } from '../i18n.js';
import { initUploadConsentFlow } from '../upload-consent.js';
import * as drawing from '../utils.js';
import { loadFaceMesh, openCamera, recordClip } from '../workshop/media.js';
import { copySnapshot } from '../workshop/snapshot.js';
import { createBrush } from './brush.js';
import { compileSource, ghostyleDefaults, loadCatalog, loadSource } from './catalog.js';
import { createSourceHighlight, downloadGhostyle, indentJavaScript } from './editor.js';
import { showParameterControls } from './parameters.js';
import { createPreview, loadLandmarks2d } from './preview.js';

const CATALOG = new URL('../../ghostyles.json', import.meta.url);
const CAPTURE_MS = 2000;
const SKETCH_ID = 'brush-sketch';

/**
 * Starts the Player with the catalog, source editor, geometry preview and brush.
 * @param {Console} [logger] Diagnostic logger.
 * @returns {void}
 */
export function initGhostylePlayer(logger = console) {
   initI18n();
   const byId = id => document.getElementById(id);
   const video = byId('video');
   const selector = byId('ghostyle-select');
   const editor = byId('ghostyle-source');
   const reload = byId('reload-source');
   const indent = byId('indent-source');
   const download = byId('download-source');
   const parameters = byId('player-parameters');
   const highlight = createSourceHighlight(editor, byId('source-highlight'));
   const status = byId('player-status');
   const editorStatus = byId('player-editor-status');
   const player = byId('player');
   const sourcePanel = byId('player-source-panel');
   const showCode = byId('toggle-source');
   const desktopEditor = matchMedia('(min-width: 851px) and (pointer: fine)');
   const brushToggle = byId('toggle-brush');
   const recordButton = byId('recordBtn');
   const copyButton = byId('copySnapshotBtn');
   const layers = {
      uv: byId('ghostyle-3d'),
      effect: byId('ghostyle-2d'),
      mesh: byId('landmarks-3d'),
      points: byId('landmarks-2d'),
      brush: byId('brush-layer'),
   };
   const brushActions = [byId('brush-undo'), byId('brush-clear'), byId('brush-bake')];
   const events = new EventTarget();
   const entries = new Map();
   let active = null;
   let detection = null;
   let meshPoints = null;
   let faceMesh = null;
   let detect2d = null;
   let stream = null;
   let recordingCanvas = null;
   let lastFrame = -1;
   let generation = 0;
   let sampleTimer;
   let animation;
   let noticeTimer;
   let selection = 0;

   const preview = createPreview(layers, () => faceMesh?.topology);
   const brush = createBrush(layers.brush, {
      settings: () => ({
         color: byId('brush-color').value,
         size: Number(byId('brush-size').value),
         opacity: Number(byId('brush-opacity').value),
      }),
      unavailable: () => notice(t('no_face_in_frame_status')),
      changed: count => { for (const action of brushActions) action.disabled = !count; },
   });

   window.gstmxx = {
      ...drawing,
      log: (message, source) => logger.info(source ? '[' + source + '] ' + message : message),
      events,
      getActiveEffect: () => active?.id ?? null,
      getLastResult: () => detection,
      get lastLandmarks3d() { return meshPoints; },
      get FaceLandmarker() { return faceMesh?.topology; },
   };

   /** Shows camera and clip feedback above the live picture. */
   function notice(message, persistent = false) {
      status.textContent = message;
      clearTimeout(noticeTimer);
      if (!persistent) noticeTimer = setTimeout(() => { status.textContent = ''; }, 3200);
   }

   /** Reports editor status and keeps errors visible even when the editor is closed. */
   function report(message, error = false) {
      editorStatus.textContent = message;
      editorStatus.toggleAttribute('data-error', error);
      if (error && sourcePanel.hidden) notice(message);
   }

   /** Opens or closes the scrolling source pane while keeping camera geometry aligned. */
   function setEditorVisible(open) {
      sourcePanel.hidden = !open;
      player.toggleAttribute('data-source-open', open);
      showCode.setAttribute('aria-expanded', String(open));
      const label = open ? 'player_hide_code' : 'player_show_code';
      showCode.dataset.i18n = label;
      showCode.textContent = t(label);
      if (open) highlight.update();
   }

   /** Switches the active callbacks and cleans up the previously selected module. */
   async function activate(entry, module, token) {
      const values = module
         ? (entry.parameters?.module === module ? entry.parameters.values : ghostyleDefaults(module))
         : null;
      if (module && module !== active?.module) await module.onInit?.();
      if (token !== selection) return false;
      const previous = active;
      if (previous?.module !== module) {
         try { previous?.module.onClear?.(layers.effect.getContext('2d')); } catch (error) { logger.warn(error); }
      }
      active = module ? { id: entry.id, module, values } : null;
      if (active) entry.parameters = { module, values };
      const current = active;
      showParameterControls(parameters, module?.params ?? [], values, (name, value) => {
         if (active !== current) return;
         current.values[name] = value;
         renderEffects();
      });
      player.dataset.activeGhostyle = active?.id ?? '';
      events.dispatchEvent(new CustomEvent('effectChanged', {
         detail: { activeEffect: active?.id ?? null, previous: previous?.id ?? null },
      }));
      renderEffects();
      return true;
   }

   /** Loads the named catalog entry with its original source or its existing in-memory draft. */
   async function selectGhostyle(id) {
      const token = ++selection;
      const entry = entries.get(id);
      editor.disabled = true;
      editor.value = '';
      highlight.update();
      reload.disabled = true;
      indent.disabled = true;
      download.disabled = true;
      if (!entry) {
         await activate(null, null, token);
         report('');
         return;
      }
      try {
         if (entry.source == null) entry.appliedSource = entry.source = await loadSource(entry.url);
         if (token !== selection) return;
         editor.value = entry.source;
         editor.scrollTop = 0;
         editor.scrollLeft = 0;
         highlight.update();
         editor.disabled = false;
         indent.disabled = false;
         download.disabled = false;
         if (entry.url || entry.module) {
            const module = entry.module ?? await import(entry.url);
            if (token !== selection) return;
            entry.module = module;
            if (await activate(entry, module, token) && !active.faulted) {
               const message = entry.error ?? (entry.source !== entry.appliedSource ? t('player_pending') : '');
               report(message, Boolean(entry.error));
            }
         } else {
            report(t('player_pending'));
         }
      } catch (error) {
         if (token === selection) report(error.message, true);
      } finally {
         if (token === selection) reload.disabled = editor.disabled;
      }
   }

   /** Compiles and applies the current draft. Invalid code leaves the previous effect active. */
   async function applySource() {
      const entry = entries.get(selector.value);
      if (!entry) return;
      const token = ++selection;
      const source = editor.value;
      reload.disabled = true;
      try {
         const module = await compileSource(source);
         if (token !== selection) return;
         if (await activate(entry, module, token)) {
            entry.module = module;
            entry.appliedSource = source;
            entry.error = null;
            if (!active.faulted) {
               if (entry.id === SKETCH_ID) brush.clear();
               report(editor.value === source ? t('player_applied') : t('player_pending'));
            }
         }
      } catch (error) {
         if (token !== selection) return;
         entry.error = error.message;
         report(error.message, true);
      } finally {
         if (token === selection) reload.disabled = false;
      }
   }

   /** Redraws the two Ghostyle layers and isolates failures from native brush and geometry. */
   function renderEffects() {
      if (!video.videoWidth) return;
      try {
         preview.render(video, active?.faulted ? null : active, detection, meshPoints);
      } catch (error) {
         logger.warn('Ghostyle draw failed', error);
         if (active) active.faulted = true;
         report(error.message, true);
         preview.render(video, null, null, null);
      }
   }

   /** Samples 2D and 3D layout data once per new camera frame. */
   async function sample() {
      const run = generation;
      if (video.readyState >= 2 && video.currentTime !== lastFrame && !document.hidden) {
         lastFrame = video.currentTime;
         try {
            meshPoints = faceMesh?.detector.detectForVideo(video, performance.now()).faceLandmarks[0] ?? null;
         } catch (error) {
            logger.warn('Ghostyle Player mesh tracking failed', error);
            meshPoints = null;
            faceMesh?.detector.close?.();
            faceMesh = null;
            notice(t('lab_mesh_error'));
         }
         try {
            const result = detect2d ? await detect2d(video) : null;
            if (run !== generation) return;
            detection = result;
         } catch (error) {
            logger.warn('Ghostyle Player landmark tracking failed', error);
            detection = null;
         }
         preview.annotate(video, detection, meshPoints);
         renderEffects();
      }
      if (run === generation) sampleTimer = setTimeout(sample, 90);
   }

   /** Paints the pointer stroke smoothly and supplies composed frames while recording. */
   function animate() {
      brush.draw(detection?.landmarks.positions);
      if (recordingCanvas && video.readyState >= 2) preview.capture(video, recordingCanvas);
      animation = requestAnimationFrame(animate);
   }

   /** Queues a two-second recording of the composited camera for copy and review. */
   async function record() {
      if (!stream || recordingCanvas || video.readyState < 2) return;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      let capture;
      recordButton.disabled = true;
      recordButton.dataset.recording = '';
      const ghostyleId = active?.id ?? null;
      try {
         preview.capture(video, canvas);
         capture = canvas.captureStream(24);
         recordingCanvas = canvas;
         const clip = { ...await recordClip(capture, { durationMs: CAPTURE_MS }), ghostyleId };
         events.dispatchEvent(new CustomEvent('clipRecorded', { detail: clip }));
         notice(t('lab_clip_ready'));
      } catch (error) {
         logger.warn('Ghostyle Player recording failed', error);
         notice(t('lab_clip_error'));
      } finally {
         capture?.getTracks().forEach(track => track.stop());
         recordingCanvas = null;
         recordButton.disabled = !stream;
         delete recordButton.dataset.recording;
      }
   }

   /** Copies the current camera preview with the selected Ghostyle name, if rendered. */
   async function copy() {
      if (!stream || video.readyState < 2) return;
      try {
         const name = active && !active.faulted ? entries.get(active.id)?.name : null;
         const detail = name ? t('player_snapshot_ghostyle', { name }) : '';
         const outcome = await copySnapshot(video, Object.values(layers), detail);
         if (outcome !== 'cancelled') notice(t('lab_snapshot_' + outcome));
      } catch (error) {
         logger.warn('Could not deliver Ghostyle Player snapshot', error);
         notice(t('lab_snapshot_error'));
      }
   }

   /** Turns the current native drawing into a named, editable Ghostyle draft. */
   function bake() {
      if (!desktopEditor.matches) {
         notice(t('player_desktop_code'));
         return;
      }
      const entry = { id: SKETCH_ID, name: t('player_sketch'), source: brush.toSource() };
      if (!entries.has(SKETCH_ID)) selector.add(new Option(entry.name, SKETCH_ID));
      entries.set(SKETCH_ID, entry);
      selector.value = SKETCH_ID;
      setEditorVisible(true);
      void selectGhostyle(SKETCH_ID);
   }

   /** Loads the named Ghostyles before opening the default preview. */
   async function startCatalog() {
      try {
         const catalog = await loadCatalog(CATALOG);
         for (const entry of catalog) {
            entries.set(entry.id, entry);
            selector.add(new Option(entry.name, entry.id));
         }
         selector.disabled = false;
         selector.value = entries.has('beauty-2d') ? 'beauty-2d' : catalog[0]?.id ?? '';
         await selectGhostyle(selector.value);
      } catch (error) {
         logger.warn('Could not load the Ghostyle catalog', error);
         report(error.message, true);
      }
   }

   /** Opens the webcam and starts the two independent landmark pipelines. */
   async function connect() {
      const run = ++generation;
      if (!detect2d) {
         loadLandmarks2d(globalThis.faceapi).then(detector => {
            if (run === generation) detect2d = detector;
         }).catch(error => {
            logger.warn('Ghostyle Player 2D tracking unavailable', error);
            if (run === generation) notice(t('player_tracking_error'));
         });
      }
      if (!faceMesh) {
         loadFaceMesh(logger).then(mesh => {
            if (run === generation) faceMesh = mesh;
            else mesh.detector.close?.();
         }).catch(error => {
            logger.warn('Ghostyle Player 3D tracking unavailable', error);
            if (run === generation) notice(t('lab_mesh_error'));
         });
      }
      try {
         const nextStream = await openCamera(video);
         if (run !== generation) {
            nextStream.getTracks().forEach(track => track.stop());
            return;
         }
         stream = nextStream;
         recordButton.disabled = false;
         copyButton.disabled = false;
         if (status.textContent === t('placeholder_loading_webcam')) notice('');
         lastFrame = -1;
         void sample();
         animate();
      } catch (error) {
         logger.warn('Could not open the Ghostyle Player camera', error);
         if (run === generation) notice(t('lab_camera_error'), true);
      }
   }

   showCode.addEventListener('click', () => {
      if (desktopEditor.matches) setEditorVisible(sourcePanel.hidden);
      else notice(t('player_desktop_code'));
   });
   desktopEditor.addEventListener('change', event => {
      if (!event.matches) setEditorVisible(false);
   });
   setEditorVisible(desktopEditor.matches);
   selector.addEventListener('change', () => void selectGhostyle(selector.value));
   editor.addEventListener('input', () => {
      const entry = entries.get(selector.value);
      if (!entry) return;
      entry.source = editor.value;
      entry.error = null;
      report(t('player_pending'));
   });
   reload.addEventListener('click', applySource);
   indent.addEventListener('click', () => {
      const source = editor.value;
      const formatted = indentJavaScript(source);
      if (formatted === source) return;
      editor.setRangeText(formatted, 0, source.length, 'preserve');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.focus({ preventScroll: true });
   });
   download.addEventListener('click', () => downloadGhostyle(editor.value, selector.value));
   brushToggle.addEventListener('click', () => {
      const enabled = brushToggle.getAttribute('aria-pressed') !== 'true';
      brushToggle.setAttribute('aria-pressed', String(enabled));
      layers.brush.toggleAttribute('data-painting', enabled);
      if (!enabled) brush.finish();
   });
   byId('brush-undo').addEventListener('click', brush.undo);
   byId('brush-clear').addEventListener('click', brush.clear);
   byId('brush-bake').addEventListener('click', bake);
   for (const button of document.querySelectorAll('[data-overlay]')) {
      const layer = button.dataset.overlay === '2d' ? layers.points : layers.mesh;
      button.addEventListener('click', () => {
         layer.hidden = !layer.hidden;
         button.setAttribute('aria-pressed', String(!layer.hidden));
         if (video.videoWidth) preview.annotate(video, detection, meshPoints);
      });
   }
   recordButton.addEventListener('click', record);
   copyButton.addEventListener('click', copy);
   const upload = byId('gm-screen-upload');
   byId('gm-nav-upload').addEventListener('click', () => upload.showModal());
   upload.querySelector('[data-close-panel]').addEventListener('click', () => upload.close());
   events.addEventListener('uploadQueueChanged', event => {
      const badge = byId('gm-upload-badge');
      badge.hidden = !event.detail.count;
      badge.textContent = event.detail.count;
   });
   initUploadConsentFlow({ events, channel: 'ghostyles', log: message => logger.info(message) });
   window.addEventListener('pagehide', () => {
      generation++;
      clearTimeout(sampleTimer);
      cancelAnimationFrame(animation);
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      recordButton.disabled = true;
      copyButton.disabled = true;
      detection = null;
      meshPoints = null;
   });
   window.addEventListener('pageshow', event => { if (event.persisted) void connect(); });
   void startCatalog();
   void connect();
}

initGhostylePlayer();
