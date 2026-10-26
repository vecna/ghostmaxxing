# Validation — 2026-10-24

- Seven unit tests passed (including an asynchronous matcher with opaque templates).
- Seven real Chromium headless integration tests passed, using the actual
  downloaded/vendored models: face-api, MediaPipe, pico, SCRFD/ArcFace,
  YuNet/SFace, the probe-overlay/no-face control, and the file-upload / JSON-download UI workflow.
- The static 8-second repository face-descriptor.webm fixture was sampled at
  0, 1, 2 seconds in a separate smoke run. Four embedding pipelines extracted
  three reference templates and compared all three probe frames. Pico reported
  detection-only on all six analysed frames.
- The automated one-frame browser tests assert native embedding dimensions
  (128/1024/512/128), finite comparison scores, identical input-frame hashes
  and detection-only capability handling. These are functional tests, not
  biometric accuracy claims.
- A completely opaque probe overlay produced no-face rather than a fabricated
  zero similarity. Its input hash differs from the reference frame hash.
- SCRFD output selection is tested against collisions between score and bbox
  tensor element counts across feature pyramid levels.
- Visage was NOT tested: licensed SDK and a concrete adapter are required.
- H.264 MP4 could not be decoded by the installed Chromium headless build;
  VP8/WebM was successfully decoded.
- The existing repository check was also attempted: 365 tests passed; three
  clipboard/export tests timed out and one suite could not load native
  canvas.node (dependencies installed with scripts disabled). Those files
  are not modified by this experiment. The full repository suite is not green
  in this environment; no claim is made that it passed.

No new real-person dataset, demographic evaluation, held-out accuracy study,
false-match threshold calibration or commercial-SDK evaluation was performed.

A separate YuNet/SFace smoke run compared the repository face fixture against
a synthetic different-person portrait converted to WebM: both probe frames
were compared successfully (median cosine about 0.17). This single negative
control is not used to choose an identity threshold.

Repository baseline: `fd71a40de760e01707705aa7a26b1356ee320840`. The patch contains only the new
`experiments/face-bench` directory and does not include the earlier icon patch.
