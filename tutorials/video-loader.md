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

## Baseline acquisition

The first decoded frame is not automatically trusted. Browser interaction and
automatic CLI analysis deliberately use two different baseline modes.

Makeup tutorials often open with a finished-look teaser. The UI asks a person
to scrub the normal video player and press **Select base at…** on the frame
that must become the reference. **Analyse video** remains unavailable
until that deliberate choice has been made. The selected base is reserved as
the first evidence-story item and cannot be moved behind derived evidence. The
button becomes
**Replace base with…** after the person moves to another frame, so correcting
the choice never requires synchronising a numeric field with the player.

Internally and in the Playwright API this value is `baselineTime` with
`baselineSelectionMode: 'anchored'`. The visible JPEG, ImageEmbedder vector,
and face-api descriptor all come from that exact decoded timestamp. The
controller may inspect nearby frames for noise calibration, but it cannot move
the baseline. An unusable selected frame produces an actionable error instead
of silently selecting a later scene. After acquisition, the controller rewinds
and scans the complete requested range, so a teaser before the bare-face
baseline can still appear as evidence.

The CLI equivalent is `--baseline-time`, which also selects anchored mode.
When automation omits that option, the CLI uses automatic-search mode from the
analysis-range start. Automatic search still requires a continuous stable run
and chooses medoid vectors because no person has identified an authoritative
frame.

A sample is comparable when:

- FaceLandmarker returns one mesh;
- the face occupies a useful portion of the frame;
- roll and approximate yaw remain within broad bounds;
- exposure is neither nearly black nor heavily clipped;
- ImageEmbedder returns a float vector.

An anchored baseline requires the selected ImageEmbedder vector plus three
comparable neighbours and three face-api descriptors. Neighbours are sampled
within the following three seconds at no more than 0.25-second intervals.
Abrupt pose, appearance, or comparability changes skip that neighbour and are
recorded as `anchored-baseline-neighbour-skipped`; they never replace the
selected frame. The selected frame itself must be comparable and must return a
face-api descriptor.

Automatic search requires eight ImageEmbedder vectors and three face-api
descriptors. Its candidates are sampled at no more than 0.25-second
intervals even when the coarse scan uses a wider interval; this prevents a
two-second long-video cadence from stretching one baseline across many scene
changes. A candidate run is reset when an 8 × 8 RGB crop signature changes too
abruptly, when pose or scale jumps, when a non-comparable frame breaks the run,
or when the eventual face descriptors have excessive spread. Generic
ImageEmbedder distance is deliberately not the stability gate: calibration on
real tutorial footage showed that it can vary strongly between neighbouring
frames that still depict the same face. face-api
does not run for every failed candidate: it verifies the three sharpest frames
only after eight lightweight samples have formed a continuous run. Automatic
baselines are medoids: real observed vectors with the
smallest total distance to their peers. A medoid is preferred to a mean because
it remains a genuine model output and is robust to one unusual sample.

For an anchored baseline, the selected vectors remain the actual references.
Nearby vectors only estimate noise. Automatic descriptor spread must be at
most `0.3000`; an explicitly selected baseline can be accepted up to `0.5000`,
but the UI displays an elevated-variation warning above `0.3000`. The identity
decision threshold remains `0.6000`; the looser anchored calibration limit does
not change it.

For baseline visual drifts `d_i`, the adaptive trigger threshold is:

```text
median(d_i) + max(minimumDelta, MAD(d_i) × madMultiplier)
```

`MAD` is median absolute deviation. The defaults are hypotheses that must be
validated against real makeup videos; they are configuration, not scientific
constants.

The anchored frame is captured at the selected timestamp, keeping the visible
baseline and both numeric references aligned. In automatic mode the frame is
captured at the ImageEmbedder medoid timestamp. Either way, one native-resolution
JPEG is retained and all neighbouring baseline pixels are discarded.

Baseline failure is a visible product state, not only a header status or log
record. The run controls retain a `role="alert"` explanation that translates
stable failure codes into an action. In particular,
`selected-frame-neighbours-insufficient` states how many of the four required
comparable local frames were found. This distinguishes “the selected frame is
unusable” from “the selected frame may be usable, but the following three
seconds change too rapidly to estimate local noise”. Makeup already being
present is not itself a baseline error: stability and detector availability
are the requirements. `selected-frame-descriptors-insufficient` separately
reports a usable MediaPipe calibration for which fewer than three nearby
frames returned face-api descriptors. The NDJSON record keeps
accepted/required embedding and descriptor counts for later diagnosis.

## Control ownership, seeking, and pausing

The controls have three explicit responsibilities. **Source** shows the full
local filename, decoded dimensions, duration, file size, and current seek
position. **Analysis plan** owns baseline selection and sampling cadence.
**Run** owns the mutually exclusive Analyse/Resume/Restart and Pause actions,
plus sample progress. The visible filename matters when several locally
downloaded tutorials have similar content; it is not inferred from a video ID.

Pause replaces the primary run action instead of leaving a disabled Pause and
another active action side by side. Report actions are grouped by intent:
Undo/Redo are edit history, while report/log downloads are exports.

While analysis runs, the controller owns `video.currentTime`. Native video
interaction, file replacement, the precise source slider, baseline selection,
sampling cadence, and report timestamp links are therefore inert and visually
muted. The player remains visible because watching decoded checkpoints is
useful; a notice explains why its controls are unavailable. The pause button
remains active.

The native player bar and the custom source slider have different jobs. The
native controls provide familiar playback. The custom slider provides a
millisecond-labelled position for baseline selection and later evidence review.
It does not claim to show encoded frame numbers: HTML video does not expose a
stable random-access frame index, and the source may use variable frame rate.
The separate analysis bar therefore reports the truthful unit available to the
analyser: processed scan samples, for example `42 / 601 samples · 7%`.

Pausing sets a cancellation flag and finishes the current sample. The
controller stores `lastScanMediaTime`, seeks the visible player to that
checkpoint, and leaves both the source slider and sample-progress bar there.
The primary action becomes **Resume analysis**. Resume preserves the baseline,
observations, events, and journal, then continues at one sampling interval
after the checkpoint. A pause during initial baseline calibration restarts that
small bounded calibration window because no image-vector queue is retained.

Sampling cadence is part of a scan's identity. Changing **Sample every** while
a run is paused changes the primary action to **Restart with new sampling**.
That action starts a fresh scan, rebuilds the baseline at the selected source
timestamp, and recalculates the total as
`ceil((rangeEnd - rangeStart) / interval) + 1`. A true resume deliberately keeps
the original interval, total, journal, and next checkpoint; mixing two cadences
inside one progress denominator would make both the count and technical log
ambiguous.

Replacing the selected baseline while paused follows the same rule. The action
becomes **Restart with new baseline**, or **Restart with new settings** when the
baseline and cadence both changed. A resume cannot reuse old observations with
a new reference because every stored descriptor distance and visual drift was
computed from the previous baseline.

Every baseline or evidence-card timestamp is a seek button when analysis is
idle. Clicking it pauses ordinary playback and moves the source player to the
recorded frame. These links become inert and muted while the controller owns
media time.

## Timeline semantics

The report timeline has three independent lanes:

1. **MediaPipe coverage** — high means a comparable mesh, middle means a mesh
   exists but its crop is unusable, and low means no mesh. This is context, not
   evidence by itself.
2. **ImageEmbedder drift** — frequent `1 - cosine` samples and an adaptive
   dashed threshold. It is generic aligned-crop change, not identity distance.
3. **face-api L2** — sparse numeric verification points and the fixed 0.6
   dashed threshold. An × above the threshold label at the right is
   categorical: face-api returned no 2D face, so no descriptor and no numeric
   distance exist.

Missing values create gaps; they are never converted into zeros or invented
L2 values. Numeric face-api points use a data-aware vertical range instead of
being clamped at `1.0`. ImageEmbedder and face-api values are not overlaid or
normalised into one synthetic score. The dashed ImageEmbedder line is labelled
with the session's four-decimal adaptive trigger; the dashed face-api line is
labelled with the four-decimal identity threshold. The browser canvas and the
exported SVG use the same labels, so a screenshot remains interpretable when
removed from the surrounding page.

## Person-requested frame checks

After a baseline exists, **Analyse frame at…** compares the source position
currently shown by the player. This differs from automatic event confirmation:
a person asked a question about one exact frame, so no second divergence vote
is required and the card is labelled **Manual frame check**. It never claims
to be a repeated automatic transition.

The explicit check runs MediaPipe and face-api immediately. MediaPipe still
controls whether the frame is considered comparable; face-api is also run when
it is not, because a direct request should return the available diagnostic
distance rather than silently do nothing. The interpretation is one of:

- `below-threshold`: comparable frame and face-api L2 below `0.6000`;
- `above-threshold`: comparable frame and L2 at or above `0.6000`;
- `no-2d-face`: comparable MediaPipe crop but no face-api descriptor;
- `not-comparable`: MediaPipe geometry or exposure rejected the crop, so any
  face-api value is diagnostic context only.

The exact native-resolution frame becomes an editable story card with source
timestamp, caption, ordering, rejection, download, and recommended clip
window. A `phase: "manual"` sample, a sparse `face-api-result`, and a
`manual-frame-checked` journal record make the decision reprocessable without
placing JPEG bytes in the log. Manual cards increment `manualChecks`, not
`confirmedEvents`, and automatic observations never merge into them.

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

The computational baseline is pinned as the first story card. Confirmed
events enter after it in source-time order; an early finished-look teaser no
longer displaces the reference merely because its source timestamp is smaller.
Events remain reorderable among themselves, but no event can cross the
baseline boundary. Candidates remain only in the technical log until a second
divergent observation confirms them.

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
- compact face-api and ImageEmbedder-drift evidence;
- event classification and whether human review is required;
- references to separately written image files.

An empty human caption receives a conservative fallback chosen from the event
classification. Identity-distance text names the threshold crossing;
detector-divergence text states that MediaPipe retained a comparable mesh while
face-api returned no 2D face and explicitly asks for pose/occlusion review.
The fallback is fixed explanatory copy, not another model inference, and an
edited caption always replaces it.

CLI output also includes `timeline.svg`, referenced by `report.html` and by the
`artifacts.timeline` field in `report.json`. It is regenerated from the
technical records rather than captured from the browser canvas, so it remains
scalable and preserves categorical × markers for missing face-api detections.

It deliberately excludes raw embeddings, raw image data URLs, and diagnostic
errors unrelated to the story.

### Technical log

`analysis.ndjson` is newline-delimited JSON with a versioned header, sample
records, journal records, evidence-event records, and a footer. It excludes
image bytes but keeps exact media timestamps and recommended clip windows.

Schema version 4 records whether a baseline was an exact selected frame or an
automatic medoid, its selected timestamp, skipped anchored neighbours,
`lastScanMediaTime`, and `analysis-resumed` journal entries. These fields let a
later processor distinguish deliberate human reference selection from
automatic search and reconstruct pause boundaries without video pixels. It
also records person-requested frame checks, their four-way interpretation,
compact model results, and native-frame metadata without image bytes.

The technical log is downloaded separately from the report. This separation
allows a user to share the report without accidentally sharing detailed model
telemetry, while retaining a machine-readable research artifact locally.

The CLI writes both artifacts even when analysis fails after the source has
loaded. A failed run is precisely when the reset reasons, last successful
sample, and model diagnostics are most valuable.

The log can be replayed even when the UI layout changes. Its source fingerprint
lets tooling warn if a different video is supplied later.

`replay-log` is intentionally a derivation operation, not another analysis. It
reads `analysis.ndjson` and writes `report.replayed.json` plus `timeline.svg` in
the chosen output directory. It does not write a second NDJSON file, seek the
video, or run any model. The replayed JSON includes diagnostic candidates as
well as confirmed events, so it demonstrates that archived telemetry remains
processable but does not replace the original editorial report.

## Three distinct model signals

### FaceLandmarker: frequent presence and geometry

FaceLandmarker is the light, frequent sensor. For every sampled media timestamp
it answers whether a mesh is present and supplies geometry for crop alignment.
It is not used as an identity matcher.

A missing mesh is coverage information, not evidence that makeup affected a
recogniser. Hands, brushes, pose, framing, motion, and ordinary cuts can all
remove the mesh temporarily. The technical log and coverage lane retain these
gaps so a person can understand what the analyser did while unattended, but a
gap cannot create an evidence event or invoke face-api.

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
descriptor. It first runs on the bounded baseline candidates. During the later
scan it runs only when MediaPipe returns a geometrically and photometrically
comparable crop and one of these reasons exists:

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

### Multi-person sources: current limitation

The current pipeline is intentionally single-subject but does not yet enforce
that contract. FaceLandmarker is configured with `numFaces: 1` and the scan
reads `faceLandmarks[0]`. The vendored face-api call is
`detectSingleFace(...)`: despite the underlying detector finding candidates,
that API returns only the candidate with the highest detection score, or
`null`, rather than an array. The two models select independently from the
full source frame. With two visible people, MediaPipe's chosen mesh and
face-api's highest-score detection may therefore refer to different people.
No bounding-box association, subject identifier, or cross-sample track
currently distinguishes them, so an apparent descriptor transition in a
multi-person interval is not trustworthy.

The safest first multi-person policy is to configure the frequent detector to
report more than one mesh, store only compact face counts and boxes, and mark
every multi-face sample as non-comparable. Such samples would remain technical
coverage context and could not confirm an event. A later subject-lock design
could let a person choose the baseline subject and associate candidates by
box continuity across samples and cuts. Descriptor distance must not be the
only association rule because that is the very signal the Video Loader is
trying to measure. This decision is deliberately left out of the current
implementation rather than silently guessing a subject.

## Trigger state and event confirmation

A lightweight sample becomes eligible for face-api verification when at least
one trigger reason exists:

- `identity-heartbeat`;
- `mediapipe-face-returned`;
- `visual-drift-sustained`;
- `visual-drift-jump`.

Sustained drift currently means at least two above-threshold samples in a
three-sample window. A lost MediaPipe face is logged immediately but does not
invoke face-api when no crop exists. A return transition invokes face-api only
after the returned crop is comparable; a mesh with excessive pose, unusable
exposure, or invalid geometry remains diagnostic coverage rather than report
evidence.

A face-api observation is divergent when either:

- MediaPipe has a comparable face crop but face-api returns no detection; or
- face-api returns a descriptor with L2 distance greater than or equal to 0.6.

One divergent result creates a candidate. Two divergent observations within a
three-second media window confirm the event. This confirmation rule rejects
isolated decode glitches without requiring a pixel queue.

Confirmation does not by itself claim that makeup defeated recognition. Every
confirmed event receives one of these classifications:

- `identity-distance`: at least two descriptors meet or exceed the configured
  L2 threshold. This is the strongest current identity-change signal;
- `detector-divergence`: at least two comparable frames contain a MediaPipe
  mesh while face-api returns no face. This requires human review because a hand,
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

## Support-image condition catalogue

The analysis UI must distinguish a useful identity signal from a frame that
cannot support any conclusion. These are not interchangeable warning styles:
each condition has a different meaning, and the future photographic support
manual must show a real source-frame example beside the explanation.

The baseline is always rendered as an ordinary story entry with
`<article class="loader-event loader-event--reference" data-event-id="baseline">`.
Its searchable heading is:

```text
Baseline · distance reference · <timestamp>
```

The card shows the source-resolution reference image and names all three
numbers needed to interpret later entries:

```text
ImageEmbedder trigger <value>
face-api baseline spread <value>
face-api decision threshold <value>
```

The first value controls lightweight verification requests, the second reports
how internally consistent the accepted baseline descriptors were, and the
third controls the later identity-distance decision. The baseline card is
pinned first because every later distance derives from it.

Confirmed entries use the following searchable headings. A future support page
can use these strings to pair actual Video Loader cards with explanatory copy:

| Searchable heading | Condition that created it | What the support photograph must make clear |
|---|---|---|
| `Identity-distance transition · <timestamp>` | At least two comparable checks return numeric face-api L2 distances at or above the active threshold, `0.6000` by default. | MediaPipe still supplies a usable face crop and face-api still detects a face; the signal concerns descriptor distance, not detector failure. |
| `Detector divergence — review · <timestamp>` | At least two comparable MediaPipe frames exist while face-api returns no 2D face. | The whole face must still be sufficiently visible for MediaPipe comparison. A hand, applicator, pose, or partial occlusion can still explain the divergence, so this is review evidence rather than an automatic makeup-success claim. |
| `Mixed transition — review · <timestamp>` | The confirmation window contains divergent checks of different kinds and does not satisfy either homogeneous rule above. | The photograph and nearby source clip must be reviewed because one summary number cannot explain the interval. |

Every event card also contains one of these metric messages:

```text
face-api: <numeric L2 distance>
face-api: no face
ImageEmbedder drift: <numeric 1 − cosine value>
ImageEmbedder drift: n/a
Trigger: identity-heartbeat, mediapipe-face-returned,
         visual-drift-sustained, visual-drift-jump
```

The trigger line explains why face-api was scheduled; it is not the result of
that check. In particular, an ImageEmbedder value above its adaptive trigger
does not itself establish an identity change.

The portable HTML report provides classification-specific fallback prose when
a person has not written a caption. These strings are deliberately explicit
and must all be illustrated in the support manual:

```text
Repeated comparable frames returned face-api descriptor distances at or above <threshold>.

MediaPipe retained a comparable face mesh while face-api returned no 2D face
in repeated checks. Review pose and occlusion before attributing this to makeup.

Different model checks diverged in this interval. Review the selected frame
and source clip before interpreting the result.
```

MediaPipe absence is intentionally not an event card. The coverage lane records
three diagnostic states instead:

| Coverage state | Stored condition | Interpretation |
|---|---|---|
| `high usable` | `facePresent: true`, `comparable: true` | One mesh exists and its aligned crop is suitable for ImageEmbedder and possible face-api verification. |
| `middle mesh only` | `facePresent: true`, `comparable: false` | A mesh exists, but the crop is too small, too rolled, too yawed, too dark, too bright, or too clipped. No model-divergence conclusion is allowed. |
| `low absent` | `facePresent: false`, `comparable: false` | FaceLandmarker returned no mesh. This can be an edit, occlusion, profile, or absent face; it is context only and never evidence of successful makeup. |

The current comparability limits are a face width of at least `0.12` of the
video width, absolute roll no greater than `25` degrees, normalised yaw offset
no greater than `0.42`, crop luma from `0.12` through `0.92`, and clipped-pixel
ratio no greater than `0.18`. These values belong in the support explanation
because “not comparable” otherwise looks like an unexplained rejection.
Sharpness ranks candidate photographs but does not make a frame comparable or
non-comparable on its own.

Baseline search failures remain technical-log diagnostics rather than story
cards. The exact `baseline-candidate-reset.reason` values are:

- `appearance-or-pose-discontinuity`: the candidate run crossed a cut or made
  too large a colour, roll, yaw, or scale step;
- `face-descriptor-spread`: the candidate descriptors were not internally
  consistent enough to establish one reference;
- `face-api-baseline-incomplete`: too few of the sharpest candidates produced
  face-api descriptors;
- `non-comparable-frame`: an unusable frame interrupted the stable run.

Anchored calibration does not reset away from the selected timestamp. It uses
`anchored-baseline-neighbour-skipped` with reason
`appearance-or-pose-discontinuity` or `non-comparable-frame`, and
`anchored-baseline-face-sample-incomplete` when the selected descriptor exists
but too few neighbouring descriptors were returned. These are calibration
diagnostics, not evidence events.

The first photographic support pass should use the local tutorial whose source
ID is `hpAi9PM0uAM`. It should collect actual frames for every condition that
the analysis genuinely produces, and then use another fixture for missing
conditions rather than staging a misleading example. A useful capture set is:

1. the chosen baseline card;
2. one clear, comparable below-threshold match;
3. one numeric identity-distance transition at or above `0.6000`;
4. one detector-divergence review frame where the MediaPipe crop remains
   comparable;
5. one `middle mesh only` frame, preferably with a visible hand, applicator,
   pose, or exposure problem;
6. one `low absent` frame caused by a cut or genuinely missing/hidden face;
7. one mixed transition if the corpus naturally contains it;
8. one above-trigger ImageEmbedder drift that does not become a confirmed
   identity event.

That future page is informational documentation, not the reusable graphic
component itself. Extracting a shared threshold bar and updating
`visual-styleguide.html` remain a separate phase after Video Loader semantics
and the photographic vocabulary are stable.

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
  baselineSelectionMode: 'anchored',
  sampleIntervalSeconds: 0.5,
});
window.gstmxxVideoLoader.cancel();
await window.gstmxxVideoLoader.resume();
await window.gstmxxVideoLoader.analyzeFrame(83.417);
window.gstmxxVideoLoader.getSession();
window.gstmxxVideoLoader.exportBundle();
```

The page also dispatches `gstmxx-video-loader:*` events for model readiness,
source readiness, samples, baseline readiness, confirmed events, completion,
and errors. Automation should prefer this contract over button text or screen
coordinates.

## Event-to-function call map

The following trees describe the important call paths from their external
trigger. They are deliberately written like `pstree`: indentation means a
direct call, while `[...]` marks a conditional branch or a repeated sampling
loop. Browser events and the public Playwright API converge before analysis,
so interactive and automated runs exercise the same controller.

```text
<script type="module"> loads lab-js/loader.js
└─ init()
   ├─ initI18n()
   ├─ setupLocaleSelect()
   ├─ applyI18n()
   ├─ renderSession(null)
   │  └─ drawTimeline(null)
   ├─ syncControls()
   └─ controller.loadModels()
      ├─ faceapi.nets.*.loadFromUri()                 [three face-api models]
      ├─ import(MEDIAPIPE_TASKS_VISION_URL)
      ├─ FilesetResolver.forVisionTasks()
      ├─ FaceLandmarker.createFromOptions()
      ├─ ImageEmbedder.createFromOptions()
      └─ notify('models-ready')
         └─ controller subscriber in loader.js
            ├─ setStatus()
            ├─ syncControls()
            └─ dispatchLoaderEvent('models-ready')

<input type="file"> change
or Playwright page.setInputFiles('#videoFile', source)
└─ loadSelectedFile()
   └─ controller.loadFile()
      ├─ URL.createObjectURL()
      ├─ waitForMediaEvent(video, 'loadedmetadata')
      ├─ createAnalysisSession()
      ├─ appendJournal('source-loaded')
      ├─ triggerDetector.reset()
      └─ notify('source-loaded')
   ├─ syncVideoTimeline()
   │  └─ renderBaseSelection()
   ├─ renderSession()
   │  ├─ drawTimeline()
   │  └─ orderedStoryItems()
   ├─ syncControls()
   └─ dispatchLoaderEvent('source-loaded')

<video> timeupdate | seeked | loadedmetadata
or #videoSeek input
└─ syncVideoTimeline()
   └─ renderBaseSelection()

#selectBaseBtn click
└─ selectCurrentBase()
   ├─ selectedBaseTime = video.currentTime
   ├─ renderBaseSelection()
   └─ syncControls()                                  [enables Analyse]

#analyzeFrameBtn click
or window.gstmxxVideoLoader.analyzeFrame(mediaTime)
└─ analyzeCurrentFrame(mediaTime)
   └─ controller.analyzeFrame(mediaTime)
      ├─ seekVideo()
      ├─ faceLandmarker.detect()
      ├─ drawAlignedFaceCrop() + measureCropQuality()
      ├─ imageEmbedder.embed()                        [only if comparable]
      ├─ runFaceApi()                                 [explicit human request]
      ├─ euclideanDistance()                          [descriptor vs baseline]
      ├─ appendSample({ phase: 'manual' })
      ├─ appendJournal('face-api-result')
      ├─ captureSourceFrame()                         [exact native frame]
      ├─ recordManualFrameCheck()
      └─ notify('manual-frame-checked')
         ├─ renderSession()
         ├─ renderAnalysisMessage()
         └─ dispatchLoaderEvent('manual-frame-checked')

#startAnalysisBtn click
or window.gstmxxVideoLoader.analyze(options)
└─ startAnalysis(options)
   └─ controller.analyze(options)
      ├─ appendJournal('analysis-started')
      ├─ notify('analysis-started')
      ├─ [anchored baseline calibration after selectedBaseTime]
      │  ├─ seekVideo()
      │  │  └─ waitForMediaEvent(video, 'seeked')
      │  ├─ faceLandmarker.detect()
      │  ├─ drawAlignedFaceCrop()
      │  ├─ measureCropQuality()
      │  ├─ imageEmbedder.embed()
      │  │  └─ unpackEmbedding()
      │  ├─ appearanceDistance() + visualDrift()      [neighbour eligibility]
      │  ├─ [enough comparable local samples]
      │  │  ├─ runFaceApi()                           [selected + sharp neighbours]
      │  │  ├─ buildAnchoredFaceBaseline()            [selected descriptor]
      │  │  │  └─ median(euclideanDistance)
      │  │  ├─ buildAnchoredEmbeddingBaseline()       [selected embedding]
      │  │  │  ├─ median()
      │  │  │  └─ medianAbsoluteDeviation()
      │  │  ├─ captureSourceFrame()                   [selected native JPEG]
      │  │  ├─ finaliseBaseline()
      │  │  └─ notify('baseline-ready')
      │  ├─ appendSample()
      │  └─ notify('sample')
      ├─ [coarse scan loop, rewound to analysis start]
      │  ├─ seekVideo()
      │  ├─ faceLandmarker.detect()
      │  ├─ drawAlignedFaceCrop()
      │  ├─ measureCropQuality()
      │  ├─ imageEmbedder.embed()
      │  ├─ visualDrift()
      │  ├─ appendSample()
      │  ├─ triggerDetector.evaluate()
      │  ├─ [verification requested]
      │  │  ├─ runFaceApi()
      │  │  ├─ euclideanDistance()                    [descriptor vs baseline]
      │  │  ├─ appendJournal('face-api-result')
      │  │  └─ recordEvidenceObservation()
      │  │     └─ [event newly confirmed]
      │  │        ├─ refineEvidenceFrame()
      │  │        │  ├─ [neighbourhood loop]
      │  │        │  │  ├─ seekVideo()
      │  │        │  │  ├─ faceLandmarker.detect()
      │  │        │  │  ├─ drawAlignedFaceCrop()
      │  │        │  │  └─ measureCropQuality()
      │  │        │  ├─ runFaceApi()                  [at most three candidates]
      │  │        │  ├─ euclideanDistance()
      │  │        │  ├─ captureSourceFrame()          [one selected JPEG]
      │  │        │  └─ selectEventFrame()
      │  │        └─ notify('event-confirmed')
      │  └─ notify('sample')
      ├─ appendJournal('analysis-complete' | 'analysis-cancelled')
      └─ notify('analysis-complete' | 'analysis-cancelled')
         └─ controller subscriber in loader.js
            ├─ renderSession()
            │  ├─ drawTimeline()
            │  ├─ orderedStoryItems()
            │  ├─ createBaselineCard()
            │  └─ createEventCard()
            └─ dispatchLoaderEvent(update.type)

#cancelAnalysisBtn click | window.gstmxxVideoLoader.cancel()
└─ controller.cancel()                                [sets boundary flag]
   └─ analyze() finishes the current sample
      ├─ seekVideo(lastScanMediaTime)                  [visible checkpoint]
      ├─ appendJournal('analysis-cancelled')
      └─ notify('analysis-cancelled')

#startAnalysisBtn click while cancelled
or window.gstmxxVideoLoader.resume()
└─ startAnalysis({ resume: true })
   └─ controller.analyze({ resume: true })
      ├─ appendJournal('analysis-resumed')
      ├─ preserve baseline, samples, events, and journal
      └─ resume coarse scan at lastScanMediaTime + sample interval

editorial button click
├─ applyEditorialCommand()                            [caption/promote/reject/order]
├─ undoEditorialCommand() | redoEditorialCommand()   [Undo/Redo]
└─ renderSession()

Download report click | Download technical log click
└─ controller.exportBundle()
   ├─ buildReport()
   ├─ serializeTechnicalLog()
   └─ downloadText()                                  [chosen artifact only]

scripts-dev/video-loader.cjs analyze
└─ main()
   └─ analyze()
      ├─ sampledFingerprint()
      ├─ startServer()                                [unless --base-url]
      ├─ chromium.launch()
      ├─ page.setInputFiles('#videoFile', source)
      ├─ window.gstmxxVideoLoader.analyze(options)    [browser tree above]
      ├─ window.gstmxxVideoLoader.exportBundle()
      ├─ writeBundle()
      └─ extractClips()                               [only with --clips]
```

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

Rebuild diagnostic artifacts without the source video or model inference:

```sh
node scripts-dev/video-loader.cjs replay-log \
  /tmp/video-report/analysis.ndjson \
  --output /tmp/video-report/replayed
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

Large research videos under `tests/fixtures/` are local-only and git-ignored by
video extension rather than source ID or title. `my-moving-face.mp4` is an
explicit exception because it is the small committed browser fixture.
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
for review. A person should scrub past the intro and select an exact reference
frame before a substantive analysis.

The `hpAi9PM0uAM` fixture was also analysed with an explicitly selected
baseline at `00:06.000`. The exact 1920 × 1080 frame, ImageEmbedder vector, and
face-api descriptor remained at `6.000`; two unstable neighbours were skipped,
the accepted face-api spread was reported as `0.3919`, and the story order was
`baseline` followed by the confirmed event. This case is the regression target
for both “do not drift to 16 seconds” and “do not let a one-second teaser
automatically precede the baseline”.

The 17.361-second `ye3W-_tr4fw` fixture demonstrates two distinct baseline
failures. At exactly `00:00.000`, FaceLandmarker returns no mesh even though a
face is visible shortly afterwards, so the selected frame itself is reported
as non-comparable. At `00:03.000`, MediaPipe supplies enough comparable local
samples, but only two of the required three nearby frames return face-api
descriptors while pose, hands, and appearance change rapidly. The latter is
reported as `selected-frame-descriptors-insufficient`, not as a claim that
makeup was already present or that no face existed throughout the clip.

## Known limitations

- The coarse seek interval can miss a very brief transition. A later refinement
  pass already revisits confirmed-event neighbourhoods at a smaller interval,
  but it cannot recover an event that the coarse trigger never observed.
- Browser codec support determines whether a given MKV can be decoded.
- Generic ImageEmbedder drift has not yet been calibrated as a reliable makeup
  signal; it remains a trigger hypothesis.
- Lighting and expression can still affect the aligned crop.
- A selected baseline is exact but still cannot provide semantic knowledge of
  “before”. If a person chooses a frame where makeup is already visible, the
  models correctly use that frame and cannot infer that an earlier moment was
  editorially preferable.
- face-api work is serialised but currently runs in the page's execution
  context, not a dedicated worker.
- The current report exports single evidence frames and portable HTML/JSON.
  Paired cards, animated sequences, Fediverse publishing, and Ghostyle Studio
  are later phases built on the same event/session contract.

## Test strategy

Pure unit tests cover:

- Euclidean and cosine metrics;
- medoid selection and robust noise;
- anchored-reference calibration;
- trigger cooldown and sustained-vote logic;
- event merging and confirmation;
- technical-log exclusion of image bytes;
- editorial undo and redo.

Browser tests mock model runtimes to verify:

- the page never requests a camera;
- Playwright can use `setInputFiles()`;
- the public automation API becomes ready;
- source metadata, progress, report, and log stay separately addressable.
- cancellation preserves a visible checkpoint and resume does not rebuild the
  baseline.

Manual real-video validation records duration, sampling interval, wall-clock
time, sample count, face-api count, confirmed events, false positives, and
missed visually obvious transitions. Threshold changes require evidence from
that calibration rather than adjustment by appearance alone.
