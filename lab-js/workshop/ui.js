/** @module workshop/ui */
import { APP_VERSION } from '../config.js';
import { getLocale, t } from '../i18n.js';
import { HISTORY_MS, MATCH_THRESHOLD } from './recognition.js';

const labels = {
   matched: 'lab_match_recognised',
   near: 'lab_match_near',
   far: 'lab_match_far',
   absent: 'no_face_in_frame_status',
   empty: 'save_your_face_status',
   waiting: 'measuring_status',
};

/**
 * Formats the current valid Lab reading for an exported still image.
 * @param {?object} reading Unexpired recognition sample from the timeline.
 * @returns {string} Localized caption, or empty when no comparison is available.
 */
export function recognitionCaption(reading) {
   if (!Number.isFinite(reading?.distance)) return '';
   const face = reading.id == null ? '' : ' · #' + reading.id;
   return t(labels[reading.status]) + face + ' · ' + t('lab_snapshot_measurement', {
      distance: reading.distance.toFixed(3),
      threshold: MATCH_THRESHOLD.toFixed(2),
   });
}

/**
 * Connects the Workshop's DOM to its actions and renders already-computed values.
 * @param {Document} doc Workshop document.
 * @param {object} actions Commands dispatched by the controls.
 * @returns {object} Draw and status operations for the browser entry point.
 */
export function createWorkshopUi(doc, actions) {
   const byId = id => doc.getElementById(id);
   const bar = byId('readout');
   const faceNumber = byId('gm-face');
   const number = byId('gm-num');
   const status = byId('gm-state');
   const timeline = byId('gm-history');
   const toast = byId('gm-toast');
   const historyEntries = byId('historyEntries');
   const historyDialog = byId('historyDrawer');
   const overlayButtons = [...doc.querySelectorAll('[data-overlay]')];
   const aboutButtons = [...doc.querySelectorAll('[data-about]')];
   const aboutPanels = [...doc.querySelectorAll('[data-about-panel]')];
   const segmentNodes = new Map();
   let toastTimer;

   byId('gm-thr').textContent = '/ ' + MATCH_THRESHOLD.toFixed(2);
   byId('gm-version').textContent = 'v' + APP_VERSION;
   byId('saveBtn').addEventListener('click', actions.save);
   byId('recordBtn').addEventListener('click', actions.record);
   byId('copySnapshotBtn').addEventListener('click', actions.copy);

   for (const button of doc.querySelectorAll('[data-open-panel]')) {
      const panel = byId(button.dataset.openPanel);
      button.addEventListener('click', () => panel.showModal());
   }
   for (const button of doc.querySelectorAll('[data-close-panel]')) {
      button.addEventListener('click', () => button.closest('dialog').close());
   }
   for (const button of aboutButtons) {
      button.addEventListener('click', () => {
         for (const item of aboutButtons) item.setAttribute('aria-pressed', String(item === button));
         for (const panel of aboutPanels) panel.hidden = panel.id !== button.getAttribute('aria-controls');
      });
   }
   for (const button of overlayButtons) {
      button.addEventListener('click', () => {
         actions.overlay(button.dataset.overlay, button.getAttribute('aria-pressed') !== 'true');
      });
   }

   /**
    * Writes the current reading and positions each elapsed-time interval. Segment
    * elements are reused as they scroll so their titles remain inspectable.
    * @param {module:workshop/recognition~RecognitionView} view Recognition view model.
    * @param {number} now Monotonic animation time in milliseconds.
    * @param {boolean} hasFaces Whether the archive has any references.
    */
   function renderRecognition({ reading, segments }, now, hasFaces) {
      const state = reading?.status ?? (hasFaces ? 'waiting' : 'empty');
      const who = reading?.id == null ? '—' : '#' + reading.id;
      const label = t(labels[state]) + (who === '—' ? '' : ' · ' + who);
      bar.dataset.status = state;
      bar.title = label;
      faceNumber.textContent = who;
      number.textContent = reading?.distance?.toFixed(3) ?? '—';
      if (status.textContent !== label) status.textContent = label;

      const visible = new Set();
      for (const segment of segments) {
         if (segment.status === 'empty') continue;
         const key = segment.startedAt;
         visible.add(key);
         let node = segmentNodes.get(key);
         if (!node) {
            node = doc.createElement('span');
            node.className = 'match-segment';
            node.dataset.status = segment.status;
            node.setAttribute('role', 'img');
            const id = doc.createElement('span');
            id.textContent = segment.id == null ? '' : '#' + segment.id;
            node.append(id);
            timeline.append(node);
            segmentNodes.set(key, node);
         }
         const name = t(labels[segment.status]) + (segment.id == null ? '' : ' · #' + segment.id);
         node.title = name;
         node.setAttribute('aria-label', name);
         node.style.left = ((segment.from - now + HISTORY_MS) / HISTORY_MS * 100) + '%';
         node.style.width = ((segment.to - segment.from) / HISTORY_MS * 100) + '%';
      }
      for (const [key, node] of segmentNodes) {
         if (visible.has(key)) continue;
         node.remove();
         segmentNodes.delete(key);
      }
   }

   /**
    * Lists local faces with the same numbers seen in the recognition bar.
    * @param {object[]} faces Numbered references from the shared archive.
    */
   function renderFaces(faces) {
      byId('dbCountBadge').textContent = faces.length;
      historyEntries.replaceChildren();
      if (!faces.length) {
         const empty = doc.createElement('p');
         empty.textContent = t('lab_faces_empty');
         historyEntries.append(empty);
         return;
      }
      const dateFormat = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });
      for (const face of faces.slice().reverse()) {
         const card = doc.createElement('article');
         card.className = 'workshop-face-card';
         const title = doc.createElement('strong');
         title.textContent = '#' + face.id;
         card.append(title);

         if (face.thumbnail) {
            const image = doc.createElement('img');
            image.src = face.thumbnail;
            image.alt = t('lab_saved_preview', { id: face.id });
            image.loading = 'lazy';
            card.append(image);
         }
         const date = Date.parse(face.savedAt);
         if (Number.isFinite(date)) {
            const time = doc.createElement('time');
            time.dateTime = face.savedAt;
            time.textContent = dateFormat.format(date);
            card.append(time);
         }
         const remove = doc.createElement('button');
         remove.type = 'button';
         remove.className = 'warn';
         remove.textContent = t('lab_remove_face');
         remove.setAttribute('aria-label', t('lab_delete_face', { id: face.id }));
         remove.addEventListener('click', () => {
            if (doc.defaultView.confirm(t('lab_delete_face', { id: face.id }))) actions.remove(face.id);
         });
         card.append(remove);
         historyEntries.append(card);
      }
   }

   /**
    * Shows a transient operation result, including errors while a panel is open.
    * @param {string} message Localized result.
    */
   function notify(message) {
      if (historyDialog.open) {
         const panelStatus = byId('gm-faces-status');
         panelStatus.textContent = message;
         return;
      }
      toast.replaceChildren(message);
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
   }

   timeline.addEventListener('click', event => {
      const segment = event.target.closest('.match-segment');
      if (segment) notify(segment.title);
   });
   historyDialog.addEventListener('close', () => { byId('gm-faces-status').textContent = ''; });

   return { renderRecognition, renderFaces, notify };
}
