/**
 * @module upload-consent
 * @description
 * Browser-managed clip upload and receipt ownership flow. The recorder emits a
 * Blob; this module keeps that clip local until explicit consent, sends the
 * backend multipart payload, and stores the returned delete-token receipt in
 * localStorage so the user can revoke later from the upload panel.
 */
import { APP_VERSION, RECORDING_CONFIG, UPLOAD_CONSENT_VERSION } from './config.js';
import { t } from './i18n.js';
import { state } from './state.js';
import { setLog } from './utils.js';

export const RECEIPTS_STORAGE_KEY = 'ghostmaxxing-upload-receipts-v1';
const RECEIPT_HASH_PREFIX = '#receipt=';

function $(selector, root = document) {
   return root.querySelector(selector);
}

function text(value) {
   return value == null || value === '' ? 'n/a' : String(value);
}

function formatBytes(bytes) {
   if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
   if (bytes < 1024) return `${bytes} B`;
   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
   return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function randomToken(length = 16) {
   const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
   const cryptoApi = globalThis.crypto;
   const bytes = new Uint8Array(length);
   if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
      cryptoApi.getRandomValues(bytes);
   } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
   }
   return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export function createReceiptCode() {
   return `GSTMXX-${randomToken(16).match(/.{1,4}/g).join('-')}`;
}

export function loadUploadReceipts() {
   try {
      const raw = localStorage.getItem(RECEIPTS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
   } catch {
      return [];
   }
}

export function persistUploadReceipts(receipts) {
   localStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify(receipts));
}

export function publicUrlForReceipt(uploadId, kind = 'video') {
   const path = kind === 'clipboard'
      ? `/clipboard/${uploadId}.png`
      : `/videos/${uploadId}.mp4`;
   return new URL(path, window.location.origin).href;
}

export function privateReceiptUrl(uploadId, deleteToken) {
   const payload = encodeURIComponent(`${uploadId}.${deleteToken}`);
   return `${window.location.origin}${window.location.pathname}${RECEIPT_HASH_PREFIX}${payload}`;
}

function parseReceiptHash() {
   if (!window.location.hash.startsWith(RECEIPT_HASH_PREFIX)) return null;
   const payload = decodeURIComponent(window.location.hash.slice(RECEIPT_HASH_PREFIX.length));
   const splitAt = payload.indexOf('.');
   if (splitAt < 1) return null;
   const uploadId = payload.slice(0, splitAt);
   const deleteToken = payload.slice(splitAt + 1);
   if (!uploadId || !deleteToken) return null;
   return { uploadId, deleteToken };
}

function compactMatchMetrics(detail) {
   if (!detail || typeof detail !== 'object') return null;
   const faceapi = detail.faceapi || null;
   const mediapipe = detail.mediapipe || null;
   return {
      source: detail.source || null,
      overall: detail.overall || null,
      ghostylePresent: !!detail.ghostylePresent,
      faceapi: faceapi ? {
         detectionState: faceapi.detectionState || null,
         liveMinDist: faceapi.liveMinDist ?? faceapi.distance ?? null,
         obfMinDist: faceapi.obfMinDist ?? null,
         matchedId: faceapi.matchedId ?? faceapi.liveMinId ?? faceapi.obfMinId ?? null
      } : null,
      mediapipe: mediapipe ? {
         detectionState: mediapipe.detectionState || null,
         liveMaxSim: mediapipe.liveMaxSim ?? null,
         obfMaxSim: mediapipe.obfMaxSim ?? null,
         matchedId: mediapipe.matchedId ?? mediapipe.liveMaxId ?? mediapipe.obfMaxId ?? null
      } : null
   };
}

function buildUploadFormData(clip, note) {
   const formData = new FormData();
   formData.append('video', clip.blob, clip.filename);
   formData.set('kind', 'video');
   formData.set('consent_version', UPLOAD_CONSENT_VERSION);
   formData.set('app_version', APP_VERSION);
   if (clip.ghostyleId) formData.set('ghostyle_id', clip.ghostyleId);
   if (note) formData.set('user_note', note);
   if (clip.metrics) formData.set('metrics_json', JSON.stringify(clip.metrics));
   return formData;
}

async function postUpload(clip, note) {
   const response = await fetch(RECORDING_CONFIG.uploadEndpoint, {
      method: 'POST',
      body: buildUploadFormData(clip, note)
   });
   const body = await response.json().catch(() => ({}));
   if (!response.ok || !body.ok) {
      const message = body.message || `${response.status} ${response.statusText}`;
      const err = new Error(message);
      err.status = response.status;
      throw err;
   }
   return body;
}

async function deleteUpload(receipt) {
   const response = await fetch(`${RECORDING_CONFIG.uploadEndpoint}/${encodeURIComponent(receipt.uploadId)}`, {
      method: 'DELETE',
      headers: { 'X-Delete-Token': receipt.deleteToken }
   });
   const body = await response.json().catch(() => ({}));
   if (!response.ok) {
      const err = new Error(body.message || `${response.status} ${response.statusText}`);
      err.status = response.status;
      throw err;
   }
   return body;
}

function emitQueueChanged(count) {
   state.gstmxxEvents.dispatchEvent(new CustomEvent('uploadQueueChanged', { detail: { count } }));
}

function copyText(value) {
   if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(value);
   }
   return Promise.reject(new Error('Clipboard API unavailable'));
}

function addLabelRow(parent, label, value) {
   const row = document.createElement('div');
   row.className = 'upload-meta-row';
   const strong = document.createElement('strong');
   strong.textContent = label;
   const span = document.createElement('span');
   span.textContent = value;
   row.append(strong, span);
   parent.append(row);
}

export function initUploadConsentFlow() {
   const preview = $('#gm-upload-preview');
   const empty = $('#gm-upload-empty');
   const current = $('#gm-upload-current');
   const clipList = $('#gm-upload-clip-list');
   const clipMeta = $('#gm-upload-clip-meta');
   const noteInput = $('#gm-upload-note');
   const consentInput = $('#gm-upload-consent');
   const submitBtn = $('#gm-upload-submit');
   const discardBtn = $('#gm-upload-discard');
   const statusEl = $('#gm-upload-status');
   const receiptsEl = $('#gm-receipt-log');

   if (!preview || !current || !clipList || !receiptsEl) return;

   let clips = [];
   let selectedClipId = null;
   let receipts = loadUploadReceipts();
   let previewUrl = null;
   let lastMetrics = null;

   function selectedClip() {
      return clips.find((clip) => clip.id === selectedClipId) || null;
   }

   function setStatus(message, kind = '') {
      if (!statusEl) return;
      statusEl.textContent = message || '';
      statusEl.dataset.kind = kind;
   }

   function renderClipList() {
      clipList.replaceChildren();
      clips.forEach((clip) => {
         const button = document.createElement('button');
         button.type = 'button';
         button.className = 'upload-chip';
         button.classList.toggle('active', clip.id === selectedClipId);
         button.textContent = `${new Date(clip.recordedAt).toLocaleTimeString()} · ${formatBytes(clip.size)}`;
         button.addEventListener('click', () => {
            selectedClipId = clip.id;
            render();
         });
         clipList.append(button);
      });
   }

   function renderCurrentClip() {
      const clip = selectedClip();
      const hasClip = !!clip;
      if (empty) empty.hidden = hasClip;
      current.hidden = !hasClip;
      if (submitBtn) submitBtn.disabled = !hasClip || !consentInput?.checked;
      if (!clip) {
         if (previewUrl) URL.revokeObjectURL(previewUrl);
         previewUrl = null;
         preview.removeAttribute('src');
         return;
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(clip.blob);
      preview.src = previewUrl;

      clipMeta.replaceChildren();
      addLabelRow(clipMeta, t('upload_meta_recorded_label'), new Date(clip.recordedAt).toLocaleString());
      addLabelRow(clipMeta, t('upload_meta_size_label'), formatBytes(clip.size));
      addLabelRow(clipMeta, t('upload_meta_ghostyle_label'), text(clip.ghostyleId));
      const overall = clip.metrics?.overall || clip.metrics?.faceapi?.detectionState || null;
      addLabelRow(clipMeta, t('upload_meta_result_label'), text(overall));
   }

   function receiptStatusLabel(receipt) {
      if (receipt.status === 'deleted') return t('receipt_status_deleted');
      if (receipt.status === 'delete-failed') return t('receipt_status_delete_failed');
      if (receipt.status === 'imported') return t('receipt_status_imported');
      return t('receipt_status_pending');
   }

   function renderReceipts() {
      receiptsEl.replaceChildren();
      if (!receipts.length) {
         const p = document.createElement('p');
         p.className = 'upload-empty';
         p.textContent = t('receipt_log_empty');
         receiptsEl.append(p);
         return;
      }

      receipts.forEach((receipt) => {
         const article = document.createElement('article');
         article.className = 'receipt-card';

         const head = document.createElement('div');
         head.className = 'receipt-card__head';
         const title = document.createElement('h3');
         title.textContent = receipt.receiptCode || receipt.uploadId;
         const status = document.createElement('span');
         status.className = 'receipt-status';
         status.textContent = receiptStatusLabel(receipt);
         head.append(title, status);

         const meta = document.createElement('div');
         meta.className = 'upload-meta';
         addLabelRow(meta, t('receipt_upload_id_label'), receipt.uploadId);
         addLabelRow(meta, t('receipt_consent_label'), receipt.consentVersion || UPLOAD_CONSENT_VERSION);
         addLabelRow(meta, t('upload_meta_ghostyle_label'), text(receipt.ghostyleId));

         const actions = document.createElement('div');
         actions.className = 'receipt-actions';

         const publicLink = document.createElement('a');
         publicLink.className = 'secondary-btn';
         publicLink.href = receipt.publicUrl;
         publicLink.target = '_blank';
         publicLink.rel = 'noopener noreferrer';
         publicLink.textContent = t('receipt_open_public_button');

         const copy = document.createElement('button');
         copy.type = 'button';
         copy.className = 'secondary-btn';
         copy.textContent = t('receipt_copy_private_button');
         copy.addEventListener('click', async () => {
            try {
               await copyText(receipt.privateUrl);
               setStatus(t('receipt_copied_status'), 'ok');
            } catch (err) {
               setStatus(t('receipt_copy_failed_status'), 'error');
            }
         });

         const revoke = document.createElement('button');
         revoke.type = 'button';
         revoke.className = 'secondary-btn warn';
         revoke.disabled = receipt.status === 'deleted';
         revoke.textContent = t('receipt_revoke_button');
         revoke.addEventListener('click', async () => {
            revoke.disabled = true;
            setStatus(t('receipt_revoke_working_status'), 'working');
            try {
               await deleteUpload(receipt);
               receipt.status = 'deleted';
               receipt.deletedAt = new Date().toISOString();
               persistUploadReceipts(receipts);
               setStatus(t('receipt_revoke_done_status'), 'ok');
            } catch (err) {
               receipt.status = err.status === 410 ? 'deleted' : 'delete-failed';
               receipt.lastError = err.message;
               persistUploadReceipts(receipts);
               setStatus(t('receipt_revoke_failed_status', { message: err.message }), 'error');
            }
            renderReceipts();
         });

         actions.append(publicLink, copy, revoke);
         article.append(head, meta, actions);
         receiptsEl.append(article);
      });
   }

   function render() {
      renderClipList();
      renderCurrentClip();
      renderReceipts();
      emitQueueChanged(clips.length);
   }

   function importReceiptFromHash() {
      const imported = parseReceiptHash();
      if (!imported) return;
      if (receipts.some((receipt) => receipt.uploadId === imported.uploadId)) return;
      const receipt = {
         id: imported.uploadId,
         uploadId: imported.uploadId,
         deleteToken: imported.deleteToken,
         receiptCode: createReceiptCode(),
         kind: 'video',
         consentVersion: UPLOAD_CONSENT_VERSION,
         publicUrl: publicUrlForReceipt(imported.uploadId, 'video'),
         privateUrl: privateReceiptUrl(imported.uploadId, imported.deleteToken),
         status: 'imported',
         createdAt: new Date().toISOString()
      };
      receipts.unshift(receipt);
      persistUploadReceipts(receipts);
   }

   state.gstmxxEvents.addEventListener('matchStateChanged', (event) => {
      lastMetrics = compactMatchMetrics(event.detail);
   });

   state.gstmxxEvents.addEventListener('clipRecorded', (event) => {
      const clip = {
         ...event.detail,
         metrics: lastMetrics
      };
      clips.unshift(clip);
      selectedClipId = clip.id;
      if (consentInput) consentInput.checked = false;
      setStatus(t('upload_clip_ready_status'), 'ok');
      render();
   });

   consentInput?.addEventListener('change', renderCurrentClip);

   discardBtn?.addEventListener('click', () => {
      const clip = selectedClip();
      if (!clip) return;
      clips = clips.filter((item) => item.id !== clip.id);
      selectedClipId = clips[0]?.id || null;
      setStatus(t('upload_clip_discarded_status'), 'ok');
      render();
   });

   submitBtn?.addEventListener('click', async () => {
      const clip = selectedClip();
      if (!clip || !consentInput?.checked) return;
      const note = (noteInput?.value || '').trim();
      submitBtn.disabled = true;
      setStatus(t('video_uploading_log'), 'working');
      try {
         const body = await postUpload(clip, note);
         const receipt = {
            id: body.uploadId,
            uploadId: body.uploadId,
            deleteToken: body.deleteToken,
            receiptCode: createReceiptCode(),
            kind: 'video',
            consentVersion: UPLOAD_CONSENT_VERSION,
            ghostyleId: clip.ghostyleId || null,
            appVersion: APP_VERSION,
            userNote: note,
            publicUrl: publicUrlForReceipt(body.uploadId, 'video'),
            privateUrl: privateReceiptUrl(body.uploadId, body.deleteToken),
            status: 'pending',
            createdAt: new Date().toISOString()
         };
         receipts.unshift(receipt);
         persistUploadReceipts(receipts);
         clips = clips.filter((item) => item.id !== clip.id);
         selectedClipId = clips[0]?.id || null;
         if (noteInput) noteInput.value = '';
         if (consentInput) consentInput.checked = false;
         setLog(t('video_upload_done_log', { status: 201, filename: clip.filename }));
         setStatus(t('upload_receipt_created_status'), 'ok');
      } catch (err) {
         setStatus(t('video_upload_network_error_log', { message: err.message }), 'error');
      }
      render();
   });

   importReceiptFromHash();
   render();
}
