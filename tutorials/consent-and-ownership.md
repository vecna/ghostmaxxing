# Consent And Ownership

**Project:** Ghostmaxxing  
**Audience:** maintainers implementing or reviewing the upload flow  
**Status:** July 2026 client contract for browser-managed recording, consent, receipts, and revocation

## 1. Purpose

The upload flow is not a generic file picker. The browser records a short clip,
keeps the resulting video `Blob` local, asks for explicit consent, and only then
posts the clip to the backend moderation queue.

The ownership object is the receipt. A receipt gives the user:

- the upload id assigned by the backend;
- the future public URL candidate, if moderation approves publication;
- the private delete token needed to revoke the upload;
- a copyable private receipt URL that can restore the receipt on this browser.

The MP4 is a real-world painted-face recording. If a Ghostyle is active in the
lab while the clip is recorded, the Ghostyle id is submitted as context only.
The current recorder does not bake AR overlays into the MP4.

## 2. Browser Sequence

```text
Record button
  -> MediaRecorder starts on the webcam MediaStream
  -> MediaRecorder stops after RECORDING_CONFIG.durationMs
  -> chunks become a video Blob
  -> camera.js dispatches gstmxxEvents "clipRecorded"
  -> upload-consent.js stores the Blob in the in-memory queue
  -> upload panel shows preview, metadata, note, and consent checkbox
  -> explicit consent enables "Submit to moderation"
  -> FormData POST /api/uploads
  -> backend returns { ok, uploadId, deleteToken }
  -> client writes a durable receipt log entry
```

`FileReader` is not part of the normal video path. The app uploads the binary
`Blob` directly with `FormData.append('video', blob, filename)`. `FileReader`
would only be useful if the UI needed a base64 data URL, which is unnecessary
and less efficient for video.

## 3. Local-First Boundary

Before consent, the video is only a browser object:

```js
const blob = new Blob(chunks, { type: mimeType });
const previewUrl = URL.createObjectURL(blob);
```

The preview URL is local to the page session. It is not a public URL and does
not send the clip over the network. The current implementation keeps pending
clips in memory; reloading the page drops unsubmitted clips. Durable storage is
reserved for receipts, because those are the long-lived ownership records.

## 4. Upload Payload

The backend accepts multipart uploads at:

```text
POST /api/uploads
```

The client sends:

```text
video            Blob, field name required by multer
kind             "video"
consent_version  "2026-07-v1"
app_version      current client version
ghostyle_id      optional active Ghostyle id
user_note        optional moderator note
metrics_json     optional compact local match metrics
```

`consent_version` is a hard gate. The backend rejects uploads that omit it. The
client constant must therefore move in lockstep with any consent-copy revision.

## 5. Consent Copy

Consent must describe the real behavior:

- a painted-face video clip is sent to the Ghostmaxxing server;
- the server stores it in a pending moderation queue;
- a human moderator may approve or reject it;
- approved uploads may become reachable on the web, in feeds, and over
  ActivityPub;
- the private receipt token can ask the origin server to delete the upload;
- remote copies, caches, screenshots, or federated copies may outlive origin
  deletion.

Do not say that the browser uploads an AR-composited result unless the recorder
is changed to capture a canvas stream.

## 6. Receipt Model

The backend response is:

```json
{
  "ok": true,
  "uploadId": "uuid",
  "deleteToken": "opaque-secret"
}
```

The client turns that into a receipt:

```json
{
  "receiptCode": "GSTMXX-XXXX-XXXX-XXXX-XXXX",
  "uploadId": "uuid",
  "deleteToken": "opaque-secret",
  "publicUrl": "https://host/videos/uuid.mp4",
  "privateUrl": "https://host/lab.html#receipt=uuid.deleteToken",
  "status": "pending",
  "consentVersion": "2026-07-v1",
  "createdAt": "ISO timestamp"
}
```

The human receipt code is for display and support. It is not the delete secret.
The backend-issued `deleteToken` is the actual revocation credential.

The private receipt URL uses the URL hash so the token is read by client-side
JavaScript and is not sent to the server as part of the normal HTTP request.
It is still sensitive: anyone with the private receipt URL can revoke that
upload.

## 7. Revocation

The client revokes an upload with:

```text
DELETE /api/uploads/:id
X-Delete-Token: <deleteToken>
```

Expected states:

- `200`: upload deleted from the origin server;
- `403`: token mismatch;
- `404`: unknown upload id;
- `410`: upload was already deleted or rejected;
- network or `5xx`: keep the receipt and show a retryable failure.

After a successful revocation, the receipt remains in the local log with a
deleted status. It should not disappear silently, because it is the user's
record that revocation was requested from this browser.

## 8. Why Ghostyle Metadata Exists

`ghostyle_id` is not consent. It is experiment context.

If a user records a clip while `smokey-eyes` or `brush` is active in the lab,
the backend can store that id so moderators and public feeds understand what
the session was testing. This helps later analysis group clips by technique.

For the current raw-camera recorder, `ghostyle_id` must be interpreted as:

```text
"This Ghostyle was active in the lab while the real painted-face clip was recorded."
```

It must not be interpreted as:

```text
"This MP4 contains the Ghostyle overlay."
```

## 9. Implementation Entry Points

- `lab-js/camera.js`: records the webcam stream and emits `clipRecorded`.
- `lab-js/upload-consent.js`: owns local clip queue, consent gate, upload,
  receipt storage, private receipt import, and revocation.
- `lab-js/lab-ui.js`: reflects the real upload queue count in the Online dock.
- `lab.html`: upload review and receipt-log markup.
- `styles/lab.css`: upload and receipt tool styling.

## 10. Test Checklist

The client should keep tests around these contracts:

- recording emits a local clip and does not upload automatically;
- submit is disabled until consent is checked;
- upload sends `video`, `kind`, `consent_version`, `app_version`, optional
  `ghostyle_id`, note, and metrics;
- successful upload creates a durable receipt;
- private receipt hash imports a missing receipt;
- revoke calls `DELETE /api/uploads/:id` with `X-Delete-Token`;
- `410` revocation marks a receipt deleted rather than erasing it.
