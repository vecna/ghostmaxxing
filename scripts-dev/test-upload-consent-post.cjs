#!/usr/bin/env node

/**
 * Standalone consent-upload POST tester.
 *
 * Mirrors lab-js/upload-consent.js:
 * - formData.append('video', clip.blob, clip.filename)
 * - formData.set('kind', 'video')
 * - formData.set('consent_version', ...)
 * - formData.set('app_version', ...)
 * - optional ghostyle_id, user_note, metrics_json
 *
 * Uploaded content provenance (same app flow):
 * - In production, lab-js/camera.js creates clip.blob from MediaRecorder chunks
 *   and emits it in the clipRecorded event.
 * - This standalone script cannot access the browser's in-memory Blob, so it uses
 *   CLIP_PATH as a file-backed equivalent of clip.blob and CLIP_FILENAME as the
 *   multipart filename.
 *
 * Required environment variables:
 * - UPLOAD_ENDPOINT   Backend URL (example: http://localhost:3000/api/uploads)
 * - CLIP_PATH         Path to local video file used as clip.blob equivalent
 * - CONSENT_VERSION   Example: 2026-07-v1
 * - APP_VERSION       Example: 0.1.0
 *
 * Optional environment variables:
 * - CLIP_FILENAME     Multipart filename (default: basename(CLIP_PATH))
 * - CLIP_MIME_TYPE    MIME type for Blob (default: inferred by extension, fallback video/mp4)
 * - KIND              Default: video
 * - GHOSTYLE_ID
 * - USER_NOTE
 * - METRICS_JSON      Must be valid JSON string if provided
 *
 * Usage example:
 *   UPLOAD_ENDPOINT=http://localhost:3000/api/uploads \
 *   CLIP_PATH=./tmp/ghostati-recording-123.mp4 \
 *   CONSENT_VERSION=2026-07-v1 \
 *   APP_VERSION=0.1.0 \
 *   node scripts-dev/test-upload-consent-post.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name) {
  const value = process.env[name];
  return value == null || value === '' ? null : value;
}

function inferMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.mkv') return 'video/x-matroska';
  return 'video/mp4';
}

function validateMetricsJson(value) {
  if (!value) return null;
  try {
    JSON.parse(value);
    return value;
  } catch {
    throw new Error('METRICS_JSON must be valid JSON when provided.');
  }
}

function buildUploadFormData(clip, note, options) {
  const formData = new FormData();
  formData.append('video', clip.blob, clip.filename);
  formData.set('kind', options.kind);
  formData.set('consent_version', options.consentVersion);
  formData.set('app_version', options.appVersion);
  if (options.ghostyleId) formData.set('ghostyle_id', options.ghostyleId);
  if (note) formData.set('user_note', note);
  if (clip.metricsJson) formData.set('metrics_json', clip.metricsJson);
  return formData;
}

async function postUpload(clip, note, options) {
  const response = await fetch(options.uploadEndpoint, {
    method: 'POST',
    body: buildUploadFormData(clip, note, options)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    const message = body.message || `${response.status} ${response.statusText}`;
    const err = new Error(message);
    err.status = response.status;
    err.responseBody = body;
    throw err;
  }

  return { response, body };
}

async function main() {
  const uploadEndpoint = requiredEnv('UPLOAD_ENDPOINT');
  const clipPathInput = requiredEnv('CLIP_PATH');
  const clipPath = path.resolve(process.cwd(), clipPathInput);
  const consentVersion = requiredEnv('CONSENT_VERSION');
  const appVersion = requiredEnv('APP_VERSION');

  const clipFilename = optionalEnv('CLIP_FILENAME') || path.basename(clipPath);
  const clipMimeType = optionalEnv('CLIP_MIME_TYPE') || inferMimeType(clipPath);
  const kind = optionalEnv('KIND') || 'video';
  const ghostyleId = optionalEnv('GHOSTYLE_ID');
  const userNote = optionalEnv('USER_NOTE');
  const metricsJson = validateMetricsJson(optionalEnv('METRICS_JSON'));

  if (!fs.existsSync(clipPath)) {
    throw new Error(`CLIP_PATH does not exist: ${clipPath}`);
  }

  const fileBuffer = fs.readFileSync(clipPath);
  const clipBlob = new Blob([fileBuffer], { type: clipMimeType });

  const clip = {
    blob: clipBlob,
    filename: clipFilename,
    metricsJson
  };

  const options = {
    uploadEndpoint,
    consentVersion,
    appVersion,
    kind,
    ghostyleId
  };

  console.log('Posting upload with payload:');
  console.log(`- endpoint: ${uploadEndpoint}`);
  console.log(`- video field filename: ${clipFilename}`);
  console.log(`- video field mimeType: ${clipMimeType}`);
  console.log(`- video field bytes: ${fileBuffer.length}`);
  console.log(`- kind: ${kind}`);
  console.log(`- consent_version: ${consentVersion}`);
  console.log(`- app_version: ${appVersion}`);
  if (ghostyleId) console.log(`- ghostyle_id: ${ghostyleId}`);
  if (userNote) console.log(`- user_note: ${userNote}`);
  if (metricsJson) console.log('- metrics_json: provided');

  const { response, body } = await postUpload(clip, userNote, options);

  console.log('Upload accepted.');
  console.log(`- status: ${response.status}`);
  console.log(`- uploadId: ${body.uploadId || '(missing)'}`);
  console.log(`- deleteToken: ${body.deleteToken || '(missing)'}`);
  console.log('Response body:');
  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error('Upload failed.');
  console.error(`- message: ${err.message}`);
  if (typeof err.status === 'number') {
    console.error(`- status: ${err.status}`);
  }
  if (err.responseBody) {
    console.error('- response body:');
    console.error(JSON.stringify(err.responseBody, null, 2));
  }
  process.exit(1);
});
