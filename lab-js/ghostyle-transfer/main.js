/** @module ghostyle-transfer/main */
import { createFaceArchive, FACE_ARCHIVE_KEY } from '../face-archive.js';
import { isFaceDescriptor } from '../face-descriptor.js';
import { captureThumbnail } from '../face-thumbnails.js';
import { createUvRenderer } from '../ghostyle3d-uv-renderer.js';
import { compileSource } from '../ghostyle-player/catalog.js';
import { downloadGhostyle } from '../ghostyle-player/editor.js';
import { initI18n, t } from '../i18n.js';
import { createFaceDetector, loadFaceMesh } from '../workshop/media.js';
import { classifyRecognition } from '../workshop/recognition.js';
import { buildTransferSource, extractPolygons } from './polygons.js';
import { compareFaces } from './uv-diff.js';

const MAX_IMAGE_EDGE = 1600;
const atlasUrl = new URL('../../data/face_canonical_uv.json', import.meta.url);

/**
 * Shares an in-flight resource load among inputs while allowing a failed
 * load to be retried when the user selects another file.
 * @param {function(): Promise<*>} load Resource loader.
 * @returns {function(): Promise<*>} Cached resource getter.
 */
function lazy(load) {
   let pending;
   return () => pending ??= load().catch(error => {
      pending = undefined;
      throw error;
   });
}

/**
 * Decodes a local photo into the same pixel coordinate system for display,
 * both model calls and Lab thumbnails. Bounding large images limits canvas
 * and model memory on phones without reducing the canonical output size.
 * @param {File} file User-selected image.
 * @returns {Promise<HTMLCanvasElement>} Still frame.
 */
async function readFrame(file) {
   const url = URL.createObjectURL(file);
   const image = new Image();
   try {
      image.src = url;
      await image.decode();
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas;
   } finally {
      URL.revokeObjectURL(url);
   }
}

/**
 * Copies a source into a display canvas with matching geometry, keeping
 * MediaPipe's normalized landmarks aligned with the Ghostyle renderer.
 * @param {HTMLCanvasElement} canvas Display canvas.
 * @param {?HTMLCanvasElement} frame Frame to display or null to clear it.
 * @returns {?CanvasRenderingContext2D} Context for optional overlay drawing.
 */
function drawFrame(canvas, frame) {
   canvas.hidden = !frame;
   if (!frame) {
      canvas.width = canvas.height = 0;
      return null;
   }
   canvas.width = frame.width;
   canvas.height = frame.height;
   const ctx = canvas.getContext('2d');
   ctx.drawImage(frame, 0, 0);
   return ctx;
}

/**
 * Initializes the still-photo workflow. Mesh geometry drives the transfer.
 * Face-api uses Lab's descriptor and archive for optional reference matching,
 * so a missing descriptor on a painted face cannot block UV extraction.
 * @returns {void}
 */
function initTransfer() {
   initI18n();
   const byId = id => document.getElementById(id);
   const slots = {};
   for (const role of ['clean', 'painted', 'target']) {
      slots[role] = {
         input: byId(role + '-file'),
         image: byId(role + '-image'),
         message: byId(role + '-message'),
         match: byId(role + '-match'),
         current: null,
      };
   }
   const archive = createFaceArchive();
   const meshModel = lazy(() => loadFaceMesh(console, { runningMode: 'IMAGE', numFaces: 2 }));
   const faceModel = lazy(() => createFaceDetector(window.faceapi));
   const loadAtlas = lazy(async () => {
      const response = await fetch(atlasUrl);
      if (!response.ok) throw new Error('Could not load face UV atlas (HTTP ' + response.status + ')');
      return response.json();
   });
   const preview = byId('transfer-preview');
   const sensitivity = byId('transfer-sensitivity');
   const sensitivityValue = byId('transfer-sensitivity-value');
   const download = byId('download-transfer');
   const save = byId('save-transfer-face');
   const saveStatus = byId('transfer-save-status');
   const removeTarget = byId('clear-transfer-target');
   const status = byId('transfer-status');
   let renderer;
   let diff;
   let result;
   let generation = 0;
   let redraw = 0;
   let saving = false;

   /**
    * Updates an accessible status region and marks failures for visual scanning.
    * @param {HTMLElement} element Status region.
    * @param {?string} key Translation key, or null to clear.
    * @param {object} [params] Substitution values.
    * @param {boolean} [error=false] Whether the status reports a failure.
    */
   function report(element, key, params = {}, error = false) {
      element.textContent = key ? t(key, params) : '';
      element.toggleAttribute('data-error', error);
   }

   /** Reflects fresh archive contents in both readings, including edits made from Lab. */
   function refreshMatches() {
      const { faces } = archive.read();
      for (const role of ['clean', 'painted']) {
         const { current, match } = slots[role];
         if (!current?.recognitionDone) {
            match.textContent = '';
            continue;
         }
         if (!current.recognition?.descriptor) {
            report(match, 'transfer_reference_unavailable');
            continue;
         }
         const reading = classifyRecognition({ descriptor: current.recognition.descriptor, faces });
         report(match, 'transfer_reference_' + reading.status, {
            id: reading.id,
            distance: reading.distance?.toFixed(2),
         });
      }
      const clean = slots.clean.current;
      save.disabled = saving || !clean?.mesh || !isFaceDescriptor(clean?.recognition?.descriptor);
   }

   /** Applies the current exported module to the selected preview face. */
   function renderPreview() {
      const clean = slots.clean.current;
      const target = slots.target.current;
      const selected = target?.frame ? target : clean;
      const frame = selected?.frame ?? null;
      const ctx = drawFrame(preview, frame);
      if (ctx && result && selected.mesh) renderer.render(result.module, ctx, selected.mesh, {});
   }

   /** Clears stale downloads as soon as the photo pair or threshold changes. */
   function invalidateResult() {
      generation += 1;
      cancelAnimationFrame(redraw);
      result = null;
      download.disabled = true;
      renderPreview();
      return generation;
   }

   /**
    * Retraces the cached UV samples and imports the exact source offered for
    * download. A revision check keeps a late import from replacing a newer
    * input or slider value.
    */
   function schedulePolygons() {
      const revision = invalidateResult();
      if (!diff) return;
      report(status, 'transfer_extracting');
      redraw = requestAnimationFrame(async () => {
         try {
            const polygons = extractPolygons(diff, Number(sensitivity.value));
            if (!polygons.length) {
               report(status, 'transfer_no_pattern');
               return;
            }
            const source = buildTransferSource(polygons);
            const module = await compileSource(source);
            if (revision !== generation) return;
            result = { source, module };
            renderPreview();
            report(status, polygons.length === 1 ? 'transfer_one_polygon' : 'transfer_polygons', { count: polygons.length });
            download.disabled = false;
         } catch (error) {
            if (revision !== generation) return;
            result = null;
            console.warn('Could not build Ghostyle', error);
            report(status, 'transfer_extract_error', {}, true);
         }
      });
   }

   /**
    * Rebuilds the expensive UV comparison only when the source pair changes.
    * Matching in the reference archive is deliberately independent of this step.
    */
   async function comparePair() {
      diff = null;
      sensitivity.disabled = true;
      const revision = invalidateResult();
      const clean = slots.clean.current;
      const painted = slots.painted.current;
      if (!clean || !painted) {
         report(status, 'transfer_start');
         return;
      }
      if (!clean.mesh || !painted.mesh) {
         report(status, clean.error || painted.error ? 'transfer_check_photos' : 'transfer_reading_pair');
         return;
      }

      report(status, 'transfer_extracting');
      try {
         const atlas = await loadAtlas();
         if (revision !== generation) return;
         renderer ??= createUvRenderer({ atlas });
         const readPixels = ({ frame, mesh }) => ({
            pixels: frame.getContext('2d').getImageData(0, 0, frame.width, frame.height),
            mesh,
         });
         diff = compareFaces(readPixels(clean), readPixels(painted), atlas);
         if (!diff.coverage) {
            diff = null;
            report(status, 'transfer_no_coverage', {}, true);
            return;
         }
         sensitivity.disabled = false;
         schedulePolygons();
      } catch (error) {
         if (revision !== generation) return;
         console.warn('Could not compare the source photos', error);
         report(status, 'transfer_extract_error', {}, true);
      }
   }

   /**
    * Computes a Lab-compatible descriptor after the mesh has confirmed a
    * single face. It may finish after transfer or after the file is replaced.
    * @param {object} slot Photo controls and current selection.
    * @param {object} current Selection captured when recognition began.
    */
   async function recognize(slot, current) {
      try {
         const detect = await faceModel();
         if (slot.current === current) current.recognition = await detect(current.frame);
      } catch (error) {
         console.warn('Could not read a Lab face descriptor', error);
      }
      if (slot.current !== current) return;
      current.recognitionDone = true;
      refreshMatches();
   }

   /**
    * Replaces one photo and ignores stale decode or model results if another
    * file is selected before they finish. The target affects preview only.
    * @param {'clean'|'painted'|'target'} role Role of the selected photo.
    * @param {File|undefined} file Browser-selected file.
    */
   async function replacePhoto(role, file) {
      const slot = slots[role];
      const current = file ? {} : null;
      slot.current = current;
      report(slot.message, file ? 'transfer_reading_photo' : null);
      if (slot.image) drawFrame(slot.image, null);
      if (role === 'clean') report(saveStatus, null);
      if (role === 'target') {
         removeTarget.hidden = !file;
         renderPreview();
      } else {
         refreshMatches();
         void comparePair();
      }
      if (!file) return;

      try {
         const frame = await readFrame(file);
         if (slot.current !== current) return;
         current.frame = frame;
         if (slot.image) drawFrame(slot.image, frame);
         if (role === 'target') renderPreview();
      } catch (error) {
         if (slot.current !== current) return;
         console.warn('Could not decode the selected photo', error);
         current.error = true;
         slot.input.value = '';
         report(slot.message, 'transfer_bad_photo', {}, true);
      }

      if (current.frame) {
         try {
            const { detector } = await meshModel();
            if (slot.current !== current) return;
            const meshes = detector.detect(current.frame).faceLandmarks;
            current.mesh = meshes.length === 1 ? meshes[0] : null;
            current.error = !current.mesh;
            report(slot.message, current.mesh ? null : meshes.length ? 'transfer_many_faces' : 'transfer_no_face', {}, current.error);
         } catch (error) {
            if (slot.current !== current) return;
            console.warn('Could not detect face geometry', error);
            current.error = true;
            slot.input.value = '';
            report(slot.message, 'transfer_mesh_error', {}, true);
         }
      }

      if (role === 'target') {
         renderPreview();
      } else {
         void comparePair();
         if (current.mesh) void recognize(slot, current);
      }
   }

   /**
    * Stores the clean reference only after an explicit action. The shared Lab
    * archive assigns the ID and preserves the active Realtime calibration.
    */
   async function saveReference() {
      const current = slots.clean.current;
      const recognition = current?.recognition;
      if (saving || !current?.mesh || !isFaceDescriptor(recognition?.descriptor)) return;
      saving = true;
      refreshMatches();
      try {
         const thumbnail = await captureThumbnail(current.frame, recognition.detection?.box).catch(() => null);
         const face = await archive.save({
            descriptor: recognition.descriptor,
            savedAt: new Date().toISOString(),
            thumbnail,
         });
         if (slots.clean.current === current) report(saveStatus, 'lab_face_saved', { id: face.id });
      } catch (error) {
         console.warn('Could not save the Transfer reference', error);
         if (slots.clean.current === current) report(saveStatus, 'lab_face_storage_error', {}, true);
      } finally {
         saving = false;
         refreshMatches();
      }
   }

   for (const [role, { input }] of Object.entries(slots)) {
      input.addEventListener('change', () => replacePhoto(role, input.files[0]));
   }
   removeTarget.addEventListener('click', () => {
      slots.target.input.value = '';
      void replacePhoto('target');
   });
   sensitivity.addEventListener('input', () => {
      sensitivityValue.value = sensitivity.value;
      schedulePolygons();
   });
   download.addEventListener('click', () => {
      if (result) downloadGhostyle(result.source, 'ghostyle-transfer');
   });
   save.addEventListener('click', saveReference);
   window.addEventListener('storage', event => {
      if (event.key === FACE_ARCHIVE_KEY || event.key === null) refreshMatches();
   });
}

initTransfer();
