import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { state } from '../../lab-js/state.js';
import { setLog } from '../../lab-js/utils.js';
import {
  createReceiptCode,
  loadUploadReceipts,
  persistUploadReceipts,
  privateReceiptUrl,
  publicUrlForReceipt,
  RECEIPTS_STORAGE_KEY,
  initUploadConsentFlow
} from '../../lab-js/upload-consent.js';

vi.mock('../../lab-js/utils.js', async () => {
  const actual = await vi.importActual('../../lab-js/utils.js');
  return {
     ...actual,
     setLog: vi.fn()
  };
});

vi.mock('../../lab-js/i18n.js', () => ({
  t: vi.fn((key, params) => {
     if (params) {
        return `${key}_${JSON.stringify(params)}`;
     }
     return key;
  })
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('upload-consent flow and helpers', () => {
  let originalClipboard;
  let originalFetch;
  
  beforeEach(() => {
    localStorage.removeItem(RECEIPTS_STORAGE_KEY);
    window.history.replaceState({}, '', '/lab.html');
    window.location.hash = '';

    // Mock clipboard
    originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn(() => Promise.resolve())
      },
      writable: true,
      configurable: true
    });

    // Mock fetch
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();

    // Stub URL creators
    globalThis.URL.createObjectURL = vi.fn((blob) => 'blob:test-url');
    globalThis.URL.revokeObjectURL = vi.fn();

    // Setup DOM elements required by flow
    document.body.innerHTML = `
      <video id="gm-upload-preview"></video>
      <div id="gm-upload-empty"></div>
      <div id="gm-upload-current" hidden></div>
      <div id="gm-upload-clip-list"></div>
      <div id="gm-upload-clip-meta"></div>
      <input type="text" id="gm-upload-note" />
      <input type="checkbox" id="gm-upload-consent" />
      <button id="gm-upload-submit" disabled></button>
      <button id="gm-upload-discard"></button>
      <div id="gm-upload-status"></div>
      <div id="gm-receipt-log"></div>
    `;

    // Clear event listeners on state.gstmxxEvents by reinstantiating
    state.gstmxxEvents = new EventTarget();
  });

  afterEach(() => {
    navigator.clipboard = originalClipboard;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('creates human receipt codes without exposing the delete token', () => {
    expect(createReceiptCode()).toMatch(/^GSTMXX-[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
  });

  it('builds public and private receipt URLs from upload id and token', () => {
    expect(publicUrlForReceipt('upload-1')).toBe('http://localhost:3000/videos/upload-1.mp4');
    expect(publicUrlForReceipt('clip-1', 'clipboard')).toBe('http://localhost:3000/clipboard/clip-1.png');
    expect(privateReceiptUrl('upload-1', 'secret-token')).toBe('http://localhost:3000/lab.html#receipt=upload-1.secret-token');
  });

  it('persists receipt logs locally', () => {
    const receipts = [{ uploadId: 'u1', deleteToken: 't1', status: 'pending' }];

    persistUploadReceipts(receipts);

    expect(JSON.parse(localStorage.getItem(RECEIPTS_STORAGE_KEY))).toEqual(receipts);
    expect(loadUploadReceipts()).toEqual(receipts);
  });

  describe('initUploadConsentFlow', () => {
    it('does not initialize if required DOM elements are missing', () => {
      document.body.innerHTML = '';
      expect(() => initUploadConsentFlow()).not.toThrow();
    });

    it('imports receipt from location hash if valid', () => {
      window.location.hash = '#receipt=myupload123.mydeletetoken456';
      initUploadConsentFlow();

      const receipts = loadUploadReceipts();
      expect(receipts).toHaveLength(1);
      expect(receipts[0].uploadId).toBe('myupload123');
      expect(receipts[0].deleteToken).toBe('mydeletetoken456');
      expect(receipts[0].status).toBe('imported');

      const cards = document.querySelectorAll('.receipt-card');
      expect(cards).toHaveLength(1);
    });

    it('ignores invalid hash patterns during import', () => {
      window.location.hash = '#receipt=invalidpayload';
      initUploadConsentFlow();
      expect(loadUploadReceipts()).toHaveLength(0);
    });

    it('handles clipboard copy success and failure', async () => {
      window.location.hash = '#receipt=myupload123.mydeletetoken456';
      initUploadConsentFlow();

      const copyBtn = document.querySelector('.receipt-actions button');
      expect(copyBtn.textContent).toBe('receipt_copy_private_button');

      // Click copy - success case
      await copyBtn.click();
      await flushPromises();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('myupload123'));
      expect(document.getElementById('gm-upload-status').textContent).toBe('receipt_copied_status');

      // Click copy - failure case
      navigator.clipboard.writeText.mockRejectedValueOnce(new Error('Copy error'));
      await copyBtn.click();
      await flushPromises();
      expect(document.getElementById('gm-upload-status').textContent).toBe('receipt_copy_failed_status');
    });

    it('handles revoking / deleting uploads (success, 410, and generic failure)', async () => {
      window.location.hash = '#receipt=myupload123.mydeletetoken456';
      initUploadConsentFlow();

      const revokeBtn = document.querySelectorAll('.receipt-actions button')[1];
      expect(revokeBtn.textContent).toBe('receipt_revoke_button');

      // 1. Success delete
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true })
      });
      revokeBtn.click();
      await flushPromises();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/myupload123'),
        expect.objectContaining({
          method: 'DELETE',
          headers: { 'X-Delete-Token': 'mydeletetoken456' }
        })
      );
      expect(loadUploadReceipts()[0].status).toBe('deleted');
      expect(document.getElementById('gm-upload-status').textContent).toBe('receipt_revoke_done_status');

      // Re-enable and reset for failure testing
      const receipts = loadUploadReceipts();
      receipts[0].status = 'pending';
      persistUploadReceipts(receipts);
      initUploadConsentFlow();
      const newRevokeBtn = document.querySelectorAll('.receipt-actions button')[1];

      // 2. Failure with 410 status code (already deleted on server)
      globalThis.fetch.mockResolvedValueOnce({
        ok: false,
        status: 410,
        statusText: 'Gone',
        json: () => Promise.resolve({ ok: false, message: 'Expired' })
      });
      newRevokeBtn.click();
      await flushPromises();
      expect(loadUploadReceipts()[0].status).toBe('deleted');

      // Reset again
      const receipts2 = loadUploadReceipts();
      receipts2[0].status = 'pending';
      persistUploadReceipts(receipts2);
      initUploadConsentFlow();
      const finalRevokeBtn = document.querySelectorAll('.receipt-actions button')[1];

      // 3. Failure with other status code
      globalThis.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        json: () => Promise.resolve({ ok: false, message: 'Server crashed' })
      });
      finalRevokeBtn.click();
      await flushPromises();
      expect(loadUploadReceipts()[0].status).toBe('delete-failed');
    });

    it('processes recorded clips, updates consent status, and discards them', () => {
      initUploadConsentFlow();

      // Dispatch metrics first
      state.gstmxxEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
        detail: {
          source: 'faceapi',
          overall: 'unmatched',
          ghostylePresent: true,
          faceapi: {
             detectionState: 'ok',
             distance: 0.35,
             obfMinDist: 0.6,
             liveMinId: 1
          },
          mediapipe: {
             detectionState: 'ok',
             liveMaxSim: 0.92,
             obfMaxSim: 0.75,
             matchedId: 1
          }
        }
      }));

      // Dispatch clipRecorded
      const dummyBlob = new Blob(['dummy content'], { type: 'video/mp4' });
      state.gstmxxEvents.dispatchEvent(new CustomEvent('clipRecorded', {
        detail: {
          id: 'clip123',
          blob: dummyBlob,
          filename: 'test.mp4',
          size: 1000,
          recordedAt: Date.now(),
          ghostyleId: 'ghost-style-1'
        }
      }));

      // Check preview and metadata rendering
      const preview = document.getElementById('gm-upload-preview');
      expect(preview.src).toBe('blob:test-url');
      expect(document.getElementById('gm-upload-current').hidden).toBe(false);

      const metadataRows = document.querySelectorAll('.upload-meta-row');
      expect(metadataRows.length).toBeGreaterThan(0);

      // Consent checkbox control
      const consentInput = document.getElementById('gm-upload-consent');
      const submitBtn = document.getElementById('gm-upload-submit');
      expect(submitBtn.disabled).toBe(true);

      consentInput.checked = true;
      consentInput.dispatchEvent(new Event('change'));
      expect(submitBtn.disabled).toBe(false);

      // Discard button control
      const discardBtn = document.getElementById('gm-upload-discard');
      discardBtn.click();
      expect(document.getElementById('gm-upload-current').hidden).toBe(true);
      expect(document.getElementById('gm-upload-status').textContent).toBe('upload_clip_discarded_status');
    });

    it('submits a recorded clip successfully', async () => {
      initUploadConsentFlow();

      // Setup a clip
      const dummyBlob = new Blob(['dummy content'], { type: 'video/mp4' });
      state.gstmxxEvents.dispatchEvent(new CustomEvent('clipRecorded', {
        detail: {
          id: 'clip123',
          blob: dummyBlob,
          filename: 'test.mp4',
          size: 5000000, // 5MB to test formatBytes MB formatting
          recordedAt: Date.now(),
          ghostyleId: 'ghost-style-1'
        }
      }));

      const noteInput = document.getElementById('gm-upload-note');
      noteInput.value = 'My user note  ';

      const consentInput = document.getElementById('gm-upload-consent');
      consentInput.checked = true;
      consentInput.dispatchEvent(new Event('change'));

      const submitBtn = document.getElementById('gm-upload-submit');
      expect(submitBtn.disabled).toBe(false);

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, uploadId: 'up-999', deleteToken: 'del-999' })
      });

      submitBtn.click();
      await flushPromises();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData)
        })
      );

      const receipts = loadUploadReceipts();
      expect(receipts).toHaveLength(1);
      expect(receipts[0].uploadId).toBe('up-999');
      expect(receipts[0].userNote).toBe('My user note');
      expect(setLog).toHaveBeenCalled();
    });

    it('handles network error during clip submission', async () => {
      initUploadConsentFlow();

      const dummyBlob = new Blob(['dummy content'], { type: 'video/mp4' });
      state.gstmxxEvents.dispatchEvent(new CustomEvent('clipRecorded', {
        detail: {
          id: 'clip123',
          blob: dummyBlob,
          filename: 'test.mp4',
          size: 500, // <1024 B to test formatBytes B formatting
          recordedAt: Date.now()
        }
      }));

      const consentInput = document.getElementById('gm-upload-consent');
      consentInput.checked = true;
      consentInput.dispatchEvent(new Event('change'));

      const submitBtn = document.getElementById('gm-upload-submit');
      expect(submitBtn.disabled).toBe(false);

      globalThis.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ ok: false, message: 'Validation failed' })
      });

      submitBtn.click();
      await flushPromises();

      expect(document.getElementById('gm-upload-status').textContent).toBe(
        'video_upload_network_error_log_{"message":"Validation failed"}'
      );
    });

    it('handles localStorage errors gracefully during loadUploadReceipts', () => {
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = vi.fn(() => { throw new Error('storage error'); });
      
      const result = loadUploadReceipts();
      expect(result).toEqual([]);
      
      localStorage.getItem = originalGetItem;
    });

    it('handles missing clipboard API gracefully', async () => {
      // Temporarily remove clipboard
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        value: null,
        writable: true,
        configurable: true
      });

      window.location.hash = '#receipt=myupload123.mydeletetoken456';
      initUploadConsentFlow();

      const copyBtn = document.querySelector('.receipt-actions button');
      copyBtn.click();
      await flushPromises();

      expect(document.getElementById('gm-upload-status').textContent).toBe('receipt_copy_failed_status');

      // Restore clipboard
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        writable: true,
        configurable: true
      });
    });

    it('selects clip when clicking on the clip list button', () => {
      initUploadConsentFlow();

      const dummyBlob1 = new Blob(['1'], { type: 'video/mp4' });
      const dummyBlob2 = new Blob(['2'], { type: 'video/mp4' });

      // Add two clips
      state.gstmxxEvents.dispatchEvent(new CustomEvent('clipRecorded', {
        detail: { id: 'clip1', blob: dummyBlob1, filename: 'test1.mp4', size: 100, recordedAt: Date.now() }
      }));
      state.gstmxxEvents.dispatchEvent(new CustomEvent('clipRecorded', {
        detail: { id: 'clip2', blob: dummyBlob2, filename: 'test2.mp4', size: 200, recordedAt: Date.now() }
      }));

      // Clip list should have two buttons
      const chips = document.querySelectorAll('.upload-chip');
      expect(chips).toHaveLength(2);

      // Click second clip button (index 1 corresponds to clip1 because we unshift)
      chips[1].click();

      // Query the DOM again to check the newly rendered buttons
      const updatedChips = document.querySelectorAll('.upload-chip');
      expect(updatedChips[1].classList.contains('active')).toBe(true);
      expect(updatedChips[0].classList.contains('active')).toBe(false);
    });
  });
});
