# Consent And Ownership

**Project:** Ghostmaxxing  
**Audience:** maintainers implementing or reviewing the upload flow  
**Status:** Ghostmaxxing 1.3.0 client contract for browser-managed recording, consent, receipts, and revocation

## 1. Purpose

The upload flow is not a generic file picker. The browser records a short clip,
keeps the resulting video `Blob` local, asks for explicit consent, and only then
posts the clip to the backend moderation queue.

The ownership object is the receipt. A receipt gives the user:

- the upload id assigned by the backend;
- the future public URL candidate, if moderation approves publication;
- the private delete token needed to revoke the upload;
- a copyable private receipt URL that can restore the receipt on this browser.

Workshop Lab records one second of the camera stream. Ghostyle Player records two seconds of the composited camera and visible layers. The browser chooses the supported recording format.

## 2. Browser Sequence

```text
Record button
  -> MediaRecorder captures the Lab camera stream or the Player canvas stream
  -> MediaRecorder stops after the tool’s recording duration
  -> chunks become a video Blob
  -> the tool dispatches "clipRecorded" on its local EventTarget
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
channel          makeup for Lab, ghostyles for Player
ghostyle_id      optional active Ghostyle id
user_note        optional moderator note
metrics_json     optional compact local match metrics
```

`consent_version` is a hard gate. The backend rejects uploads that omit it. The
client constant must therefore move in lockstep with any consent-copy revision.

## 5. Consent Copy

Consent must describe the real behavior:

- the displayed clip is sent to the Ghostmaxxing server;
- the server stores it in a pending moderation queue;
- a human moderator may approve or reject it;
- approved uploads may become reachable on the web, in feeds, and over
  ActivityPub;
- the private receipt token can ask the origin server to delete the upload;
- remote copies, caches, screenshots, or federated copies may outlive origin
  deletion.

Describe the Lab clip as camera footage and the Player clip as a composite.

## 6. Receipt Model

The backend returns the upload ID and delete token. The client builds and stores a local receipt with those values, tool-specific links and consent metadata. Its ownership fields include:

```json
{
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

`ghostyle_id` records the active design when Ghostyle Player captures a composite. The recorded pixels reflect the visible layers at capture time. Workshop Lab submits camera footage without a Ghostyle ID. Consent is recorded separately in both flows. The backend routes approved makeup uploads to `@video` and Ghostyles uploads to `@ghostyles`, including Player clips without a design ID. The moderation view can filter by channel. Older clients without `channel` still route by the presence of `ghostyle_id`.

## 9. Implementation Entry Points

- `lab-js/workshop/media.js`: records a supplied stream and returns the local clip.
- `lab-js/workshop/main.js` and `lab-js/ghostyle-player/main.js`: select the capture stream and emit `clipRecorded`.
- `lab-js/upload-consent.js`: owns local clip queue, consent gate, upload,
  receipt storage, private receipt import, and revocation.
- `lab.html` and `ghostyle-player.html`: recording and upload review. Private receipt URLs identify the frontend that created them.
- `styles/workshop.css` and `styles/ghostyle-player.css`: tool layouts for clip submission.

## 10. Test Checklist

The client should keep tests around these contracts:

- recording emits a local clip and does not upload automatically;
- submit is disabled until consent is checked;
- upload sends `video`, `kind`, `consent_version`, `app_version`, optional
  `ghostyle_id`, channel, and note;
- successful upload creates a durable receipt;
- private receipt hash imports a missing receipt;
- revoke calls `DELETE /api/uploads/:id` with `X-Delete-Token`;
- `410` revocation marks a receipt deleted rather than erasing it.
