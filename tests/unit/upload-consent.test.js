import { describe, expect, it, beforeEach } from 'vitest';
import {
  createReceiptCode,
  loadUploadReceipts,
  persistUploadReceipts,
  privateReceiptUrl,
  publicUrlForReceipt,
  RECEIPTS_STORAGE_KEY,
} from '../../scripts/upload-consent.js';

describe('upload-consent helpers', () => {
  beforeEach(() => {
    localStorage.removeItem(RECEIPTS_STORAGE_KEY);
    window.history.replaceState({}, '', '/lab.html');
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
});
