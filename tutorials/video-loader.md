# Seekable Video Loader architecture

## Purpose and product boundary

The Video Loader analyses an existing, seekable local video. It is not a live
camera application and it must never request `getUserMedia()`. Its output is an
evidence-oriented account of how face-model signals changed over media time:

- a visual timeline below the video;
- a baseline frame and selected high-resolution evidence frames;
- an editorial report intended for a person to read and revise;
- a separate, versioned technical log intended for software to replay;
- optional short clips derived later from the original source and logged media
  timestamps.

`realtime.html` has a different purpose: it gives immediate feedback to a
person applying makeup in front of a webcam. Realtime latency, gaps, and camera
state are different from deterministic processing of a seekable file. The two
applications may share pure mathematics or model adapters, but they must not
share UI state, scheduling state, or assumptions about whether old frames can
be recovered.

The future Ghostyle Studio is a third application. It consumes one or more
selected frames to reconstruct, edit, and export a Ghostyle. It does not run
the long-video scan.

## Files and responsibilities

| File | Responsibility |
|---|---|
| `loader.html` | Accessible video, analysis controls, timeline, and report shell. |
| `styles/loader.css` | Video Loader layout only. No Realtime selectors. |
| `lab-js/loader.js` | UI rendering, downloads, editing, and public Playwright API. |
| `lab-js/video-loader/controller.js` | Model lifecycle, seeking, sampling, baseline acquisition, and verification. |
| `lab-js/video-loader/analysis.js` | Pure metrics, robust baselines, and trigger policy. |
| `lab-js/video-loader/session.js` | Versioned session, report projection, technical journal, undo/redo. |
| `scripts-dev/video-loader.cjs` | Specialized Playwright CLI and optional clip post-processing. |

Every JavaScript and CommonJS function added for this application uses English
JSDoc. Inline comments explain reasons and constraints rather than restating
syntax. This tutorial records architectural decisions that would be too broad
for local source comments.

## Why the source remains a normal video

Chromium can decode MP4 and WebM files assigned to an ordinary
`HTMLVideoElement`. Playwright can populate the page's real file input with
`page.setInputFiles()`. There is therefore no reason to convert a long video to
Y4M or present it as a fake webcam.

The source is represented by a Blob URL in the browser. The Blob URL is local
to the page and is revoked when another file is selected. The analysis session
stores only source metadata and a bounded provenance fingerprint; it does not
copy the source into the output directory.

The CLI fingerprint is `sampled-sha256`: SHA-256 over the file size, first MiB,
and last MiB. This is intentionally bounded for multi-gigabyte recordings. It
is a provenance guard, not a cryptographic claim over every source byte.

## Browser automation contract

The UI and Playwright use the same file input and the same browser API. The
stable entry point is `window.gstmxxVideoLoader`:

```js
window.gstmxxVideoLoader.isModelsReady();
window.gstmxxVideoLoader.isSourceLoaded();
window.gstmxxVideoLoader.isAnalysisRunning();
window.gstmxxVideoLoader.setSourceMetadata({ fingerprint });
await window.gstmxxVideoLoader.analyze({
  start: 0,
  end: 120,
  baselineTime: 18,
  sampleIntervalSeconds: 0.5,
});
window.gstmxxVideoLoader.cancel();
window.gstmxxVideoLoader.getSession();
window.gstmxxVideoLoader.exportBundle();
```

The page also dispatches `gstmxx-video-loader:*` events for model readiness,
source readiness, samples, baseline readiness, confirmed events, completion,
and errors. Automation should prefer this contract over button text or screen
coordinates.

## Model provenance

The repository vendors the following browser assets:

- `@vladmandic/face-api` as a classic global `faceapi` bundle;
- MediaPipe Tasks Vision `0.10.35`;
- FaceLandmarker `float16/1` with 478 landmarks;
- ImageEmbedder MobileNetV3 Small `float32/1`.

Both MediaPipe tasks explicitly use the CPU delegate. The sampled offline
workflow does not need continuous GPU throughput, and the CPU path remains
reliable in headless Playwright, software-rendered documentation captures, and
machines without a usable WebGL delegate. The chosen delegate is recorded with
the session model provenance.

The face-api bundle currently comes from a floating package URL in the vendor
refresh documentation. A future vendor refresh should pin the package version
or record a digest. Reports record model labels so results are not silently
presented as timeless or implementation-independent.

The vendored FaceMatcher default is `0.6` and accepts a match when the L2
distance is strictly below that threshold. The Video Loader therefore uses
`0.6` as its default identity-distance threshold. The threshold and the
baseline spread are recorded in each report and technical log.

## Three distinct model signals

### FaceLandmarker: frequent presence and geometry

FaceLandmarker is the light, frequent sensor. For every sampled media timestamp
it answers whether a mesh is present and supplies geometry for crop alignment.
It is not used as an identity matcher.

The Video Loader uses MediaPipe in `IMAGE` mode rather than `VIDEO` mode. A
seekable analysis may revisit timestamps during refinement. `VIDEO` mode
requires monotonically increasing timestamps, while `IMAGE` mode describes the
actual contract: independent decoded frames selected from a file.

### ImageEmbedder: aligned visual drift

ImageEmbedder is a generic image-similarity model, not a facial-recognition
model. It can react to makeup, texture, expression, light, occlusion, and crop
errors. Its output must be treated as a trigger signal, never proof of identity
or protection.

Before embedding, the 478-point mesh is used to:

1. find the face extent;
2. find the outer eye landmarks;
3. remove roll;
4. normalise face scale;
5. exclude most background;
6. draw a 224 × 224 aligned crop.

The small crop canvas is produced only at the configured sample cadence. The
application does not copy every decoded video frame to a canvas.

For embedding `e_t` and baseline embedding `e_0`, the displayed signal is:

```text
similarity(t) = cosine(e_t, e_0)
visualDrift(t) = 1 - similarity(t)
```

Smaller drift means more similar visual features. This numeric scale is not
the face-api L2 scale and is displayed in a separate timeline lane.

### face-api: sparse identity verification

face-api performs detection, 68-point alignment, and a 128-dimensional face
descriptor. It runs only for:

- baseline acquisition;
- a MediaPipe face returning after an absence;
- sustained ImageEmbedder drift;
- a sudden ImageEmbedder drift jump;
- a bounded heartbeat that prevents gradual changes from escaping checks.

Only one face-api pass is awaited at a time. The controller stores no pending
bitmap queue. A cooldown prevents several trigger reasons on adjacent samples
from producing an uncontrolled burst of work.

An `async` function does not automatically make TensorFlow computation run on
another CPU thread. The current implementation serialises expensive work and
yields between samples; this is sufficient for an offline, paused, seekable
video. A Web Worker should only be introduced after measuring actual UI stalls
and verifying the vendored backend in a worker environment.

## Baseline acquisition

The first decoded frame is not automatically trusted. The scan advances until
it collects enough comparable aligned face crops and face-api descriptors.

Makeup tutorials often open with a finished-look teaser. The UI and CLI expose
`baselineTime`, the timestamp from which baseline search begins. After a stable
baseline is acquired, the controller rewinds and scans the complete requested
range, so a teaser before the bare-face baseline can still appear as evidence.
In the UI, a person can scrub the normal video player to the start of the
bare-face section and press **Use current video time** instead of transcribing a
timestamp. The CLI equivalent is `--baseline-time`.

A sample is comparable when:

- FaceLandmarker returns one mesh;
- the face occupies a useful portion of the frame;
- roll and approximate yaw remain within broad bounds;
- exposure is neither nearly black nor heavily clipped;
- ImageEmbedder returns a float vector.

The default baseline requires eight ImageEmbedder vectors and three face-api
descriptors. Baseline candidates are sampled at no more than 0.25-second
intervals even when the coarse scan uses a wider interval; this prevents a
two-second long-video cadence from stretching one baseline across many scene
changes. A candidate run is reset when an 8 × 8 RGB crop signature changes too
abruptly, when pose or scale jumps, when a non-comparable frame breaks the run,
or when the eventual face descriptors have excessive spread. Generic
ImageEmbedder distance is deliberately not the stability gate: calibration on
real tutorial footage showed that it can vary strongly between neighbouring
frames that still depict the same face. face-api
does not run for every failed candidate: it verifies the three sharpest frames
only after eight lightweight samples have formed a continuous run. Both
baselines are medoids: real observed vectors with the
smallest total distance to their peers. A medoid is preferred to a mean because
it remains a genuine model output and is robust to one unusual sample.

For baseline visual drifts `d_i`, the adaptive trigger threshold is:

```text
median(d_i) + max(minimumDelta, MAD(d_i) × madMultiplier)
```

`MAD` is median absolute deviation. The defaults are hypotheses that must be
validated against real makeup videos; they are configuration, not scientific
constants.

The frame attached to the baseline is captured at the ImageEmbedder medoid's
timestamp, rather than simply choosing the sharpest candidate. This keeps the
visible baseline and its numeric visual representative aligned, and avoids
systematically preferring unusually high-contrast hand or product edges. It is
retained at native source resolution. All other baseline pixels are discarded.

## Sampling and memory policy

The scan seeks through media time at a configurable interval. The default is
0.5 seconds, with UI choices from 0.25 to 2 seconds. This is a coarse analysis,
not a frame-perfect decoder.

For every sample, the session stores only:

- media timestamp;
- face presence;
- comparison eligibility;
- visual drift and its active threshold;
- compact geometry metrics;
- compact quality metrics.

It does not store raw landmarks, model embeddings, source pixels, canvases,
`ImageBitmap` objects, or a ring buffer. Because a local source is seekable,
the video itself is the recoverable frame store.

Native-resolution JPEG pixels are retained only for:

- the selected baseline;
- confirmed divergence events.

If a later pass needs neighbouring frames, it should seek to neighbouring
timestamps rather than cache the original scan.

## Trigger state and event confirmation

A lightweight sample becomes eligible for face-api verification when at least
one trigger reason exists:

- `identity-heartbeat`;
- `mediapipe-face-returned`;
- `visual-drift-sustained`;
- `visual-drift-jump`.

Sustained drift currently means at least two above-threshold samples in a
three-sample window. A lost MediaPipe face is logged immediately but does not
invoke face-api when no crop exists. The return transition does invoke it.

A face-api observation is divergent when either:

- MediaPipe has a face but face-api returns no detection; or
- face-api returns a descriptor with L2 distance greater than or equal to 0.6.

One divergent result creates a candidate. Two divergent observations within a
three-second media window confirm the event. This confirmation rule rejects
isolated decode glitches without requiring a pixel queue.

Confirmation does not by itself claim that makeup defeated recognition. Every
confirmed event receives one of these classifications:

- `identity-distance`: at least two descriptors meet or exceed the configured
  L2 threshold. This is the strongest current identity-change signal;
- `detector-divergence`: at least two frames contain a MediaPipe mesh while
  face-api returns no face. This requires human review because a hand,
  applicator, pose, or partial occlusion can cause it;
- `mixed-divergence`: two divergent checks exist, but they do not form either
  homogeneous case above. This also requires review.

The report says “detector divergence — review” rather than calling that event a
successful transformation. A person may still promote it after inspecting the
frame or an extracted source clip.

Confirmation starts a bounded evidence-refinement pass. FaceLandmarker revisits
the event interval plus one second on either side at 0.2-second steps and keeps
only timestamps and quality metrics. It does not retain those frame pixels.
The three sharpest comparable timestamps are then checked by face-api, in
order, until one preserves the event's classification: a distance crossing for
`identity-distance`, or a missing face-api detection while MediaPipe still has
a mesh for `detector-divergence`. The controller then re-seeks exactly that
timestamp and captures one native-resolution JPEG. If no refined timestamp
preserves the signal, it falls back to the sharpest original divergent
observation rather than substituting a prettier but contradictory image.

Candidate events remain in the technical log even when they never reach the
report. Refinement checks and the final selection reason are journal records,
so a later tool can reconstruct why that image was chosen.

## Timeline semantics

The report timeline has three independent lanes:

1. **MediaPipe face** — a binary presence trace.
2. **Visual drift** — frequent `1 - cosine` samples and an adaptive dashed threshold.
3. **face-api L2** — sparse verification points and the fixed 0.6 dashed threshold.

Missing values create gaps; they are never converted into zeros. ImageEmbedder
and face-api values are not overlaid or normalised into one synthetic score.

## Session, report, and technical log

The mutable browser session owns all observations and editorial decisions.
The report and technical log are projections with different audiences.

### Editorial report

The report contains:

- source and model provenance;
- configuration;
- baseline metrics;
- confirmed, non-rejected events;
- captions and promotion state;
- compact face-api and visual-drift evidence;
- event classification and whether human review is required;
- references to separately written image files.

It deliberately excludes raw embeddings, raw image data URLs, and diagnostic
errors unrelated to the story.

### Technical log

`analysis.ndjson` is newline-delimited JSON with a versioned header, sample
records, journal records, evidence-event records, and a footer. It excludes
image bytes but keeps exact media timestamps and recommended clip windows.

The technical log is downloaded separately from the report. This separation
allows a user to share the report without accidentally sharing detailed model
telemetry, while retaining a machine-readable research artifact locally.

The CLI writes both artifacts even when analysis fails after the source has
loaded. A failed run is precisely when the reset reasons, last successful
sample, and model diagnostics are most valuable.

The log can be replayed even when the UI layout changes. Its source fingerprint
lets tooling warn if a different video is supplied later.

## Reversible editorial choices

Automatic observations are append-only. User choices are reversible commands:

- promote an event into the story;
- reject an event;
- edit its caption.
- move an evidence frame earlier or later in the story.

Each command records before/after state. Undo and redo change editorial state;
they do not delete automatic observations or rewrite the technical history.

### Source chronology is not story chronology

Makeup videos often open with the finished look, cut back to a bare face, and
then show the transformation. Media timestamps therefore cannot define
“before” and “after”. The Video Loader preserves two independent orders:

- source time is immutable evidence and remains attached to every frame,
  observation, log record, and clip window;
- story order is a human-editable sequence used by the browser report and the
  portable HTML export.

The computational baseline is included as a reorderable story card, but moving
it never changes the descriptor used for distance calculations. Confirmed
events enter the story in source-time order by default; candidates remain only
in the technical log until a second divergent observation confirms them. The
person can then move the teaser after the reference, or construct another
sequence, without falsifying where either frame came from.

## CLI workflow

Analyse a video:

```sh
node scripts-dev/video-loader.cjs analyze \
  "tests/fixtures/10 Minute Makeup Tutorial For Beginners [PD-Cc5XpY5w].webm" \
  --output /tmp/beginner-analysis \
  --baseline-time 18 \
  --sample-interval 0.5
```

Limit an exploratory pass:

```sh
node scripts-dev/video-loader.cjs analyze tests/fixtures/my-moving-face.mp4 \
  --output /tmp/loader-smoke \
  --end 20 \
  --sample-interval 1
```

Generate clips during the same invocation:

```sh
node scripts-dev/video-loader.cjs analyze video.webm \
  --output /tmp/video-report \
  --clips \
  --clip-before 2 \
  --clip-after 3
```

Or reprocess a log later:

```sh
node scripts-dev/video-loader.cjs extract-clips \
  /tmp/video-report/analysis.ndjson \
  video.webm \
  --output /tmp/video-report/clips
```

`ffmpeg` is used only by `extract-clips`. The browser analysis path itself has
no ffmpeg or Y4M dependency.

## Clip extraction

Every evidence event records:

```json
{
  "anchorMediaTime": 83.417,
  "recommendedClip": {
    "start": 81.417,
    "end": 86.417
  }
}
```

The post-processor opens the original source, seeks by media time, and writes a
short H.264/AAC MP4. Re-encoding is intentional: WebM, MKV, and unusual source
codecs should produce a broadly usable report clip. The operation is optional
and does not alter report validity. Before extraction, the source byte size and
bounded sampled fingerprint must match the provenance stored in the log.

The clip extractor has been exercised by replaying real tutorial logs:
seven-second windows were generated from confirmed event records without
rerunning MediaPipe, ImageEmbedder, or face-api.

## Real-video test corpus

Large research videos under `tests/fixtures/` are local-only and git-ignored.
They include makeup tutorials and event recordings. Automated CI must continue
to use the small committed fixture; the large corpus is for manual calibration,
performance tests, and qualitative review.

Recommended progression:

1. `my-moving-face.mp4` for a short smoke test;
2. the 39 MiB romantic-vampire recording for a realistic makeup pass;
3. longer tutorials to test baseline search and gradual transformations;
4. the 1.8 GiB screencast only after bounded tests pass.

Tests must never overwrite, transcode, move, or copy these sources.

The 39 MiB MKV decoded successfully in Chromium during a bounded 30-second
pass. That run also demonstrated why the reference cannot be inferred from
chronology alone: the default search selected the stable finished-look title
card at six seconds. Later detector divergences included a product held in
front of the face and application in progress, so they were correctly marked
for review. A person should scrub past the intro and set the reference-search
time before a substantive analysis.

## Known limitations

- The coarse seek interval can miss a very brief transition. A later refinement
  pass already revisits confirmed-event neighbourhoods at a smaller interval,
  but it cannot recover an event that the coarse trigger never observed.
- Browser codec support determines whether a given MKV can be decoded.
- Generic ImageEmbedder drift has not yet been calibrated as a reliable makeup
  signal; it remains a trigger hypothesis.
- Lighting and expression can still affect the aligned crop.
- `baselineTime` is a search start, not semantic knowledge of “before”. In the
  tested beginner tutorial, `18` seconds begins while cream is already visible;
  the medoid correctly represents that window but cannot infer that an earlier
  bare-face moment is editorially preferable. The UI therefore exposes the
  timestamp instead of pretending the first stable face is always the desired
  before image.
- face-api work is serialised but currently runs in the page's execution
  context, not a dedicated worker.
- The current report exports single evidence frames and portable HTML/JSON.
  Paired cards, animated sequences, Fediverse publishing, and Ghostyle Studio
  are later phases built on the same event/session contract.

## Test strategy

Pure unit tests cover:

- Euclidean and cosine metrics;
- medoid selection and robust noise;
- trigger cooldown and sustained-vote logic;
- event merging and confirmation;
- technical-log exclusion of image bytes;
- editorial undo and redo.

Browser tests mock model runtimes to verify:

- the page never requests a camera;
- Playwright can use `setInputFiles()`;
- the public automation API becomes ready;
- source metadata, progress, report, and log stay separately addressable.

Manual real-video validation records duration, sampling interval, wall-clock
time, sample count, face-api count, confirmed events, false positives, and
missed visually obvious transitions. Threshold changes require evidence from
that calibration rather than adjustment by appearance alone.
