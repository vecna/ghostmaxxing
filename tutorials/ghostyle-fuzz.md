# ghostyle-fuzz

`scripts-dev/ghostyle-fuzz.cjs` looks for Ghostyles by random trial.

1. `atlas` reads one video of one person turning their head. It keeps clean
   face-api fingerprints at as many head poses as the video shows (the
   **pose atlas**), picks the most frontal frame as **anchor** and measures
   the person's **skin swatch**.
2. `trial` draws random overlays from a **recipe** (say: three 5 × 2 cm bands
   at 80 % opacity, in colours that contrast with the skin), paints each one
   on every pose through the MediaPipe face mesh and measures how far face-api
   moves from the clean face. Thousands of trials can be appended to the same
   atlas.
3. `report` aggregates every trial into one HTML page to compare runs and pick
   the Ghostyles worth sharing.

Every number is face-api's, measured in this lab with its own vendored models.
An "escaped" imprint escaped *this* detector on *this* face; it is not a claim
of protection against any other system.

```
node scripts-dev/ghostyle-fuzz.cjs atlas  --video tests/fixtures/my-moving-face.mp4
node scripts-dev/ghostyle-fuzz.cjs trial  --atlas scratch/fuzz/my-moving-face/pose-atlas.json \
                                          --recipe scripts-dev/ghostyle-fuzz/recipes/three-bands.json --trials 50
node scripts-dev/ghostyle-fuzz.cjs report --atlas scratch/fuzz/my-moving-face/pose-atlas.json
```

`node scripts-dev/ghostyle-fuzz.cjs --help` lists every option.

---

## 1. Glossary

| Term | Meaning |
|---|---|
| **pose atlas** | What `atlas` learns once from one video: imprints, anchor, skin swatch, presence track. One `pose-atlas.json` per video. |
| **imprint** | One clean face-api fingerprint at one pose: descriptor, pose angles, mesh, frame. |
| **pose bin** | A yaw × pitch cell, 10° × 10° by default. At most one imprint per bin. |
| **presence track** | MediaPipe face presence along the whole video; it shows the gaps. |
| **anchor** | The most frontal imprint. Strokes are drawn on it. |
| **recipe** | The JSON that describes a Ghostyle family: shape, count, size, opacity, palette. |
| **skin swatch** | The person's median skin colour in CIELAB. |
| **palette pool** | The colours a palette is drawn from: xterm-256, indices 16–255. |
| **contrast palette** | The colours drawn for one trial, chosen for contrast with the skin. |
| **trial** | One random draw of a recipe, identified by `recipe + seed`. |
| **stroke** | One shape of a trial; for `shape: "line"`, a straight band. |
| **sweep** | One trial applied to every imprint and measured. |
| **evasion profile** | The result of a sweep: one row per imprint with its distances. |
| **materialise** | Write a trial's pictures and Ghostyle module to disk. |

---

## 2. How it runs

- **A harness page, not the lab.** Playwright opens
  `scripts-dev/ghostyle-fuzz/harness.html` in Chromium. It has no UI and no
  render loop; the CLI calls `window.fuzz.*` one step at a time. Models are
  the lab's: face-api from `lab-js/vendor/face-api.js` with the URLs and
  `DETECTOR_OPTIONS` of `lab-js/config.js`, MediaPipe FaceLandmarker from the
  vendored tasks-vision.
- **Frames from ffmpeg, not from a `<video>`.** The atlas extracts frames with
  ffmpeg: every codec ffmpeg reads works, whatever the browser can decode,
  and frame numbers are exact. The scan uses high-quality JPEGs; the frames
  kept as imprints are extracted again, losslessly, as PNG, and every number
  of an imprint is measured on that PNG.
- **The atlas stores the pixels.** A trial never opens the video: it loads
  the imprint PNGs and their meshes once, then paints and measures.
- **Painting is the lab's.** Strokes are baked into the canonical UV texture
  (`data/face_canonical_uv.json`: 478 points, 906 triangles, eye and mouth
  openings included) and warped onto each imprint's mesh by the lab's own
  `createUvRenderer` (`lab-js/ghostyle3d-uv-renderer.js`). The overlay
  follows the skin: a band straight on the frontal frame bends on a turned
  head, as makeup would.
- **The code measured is the code shipped.** Each trial's Ghostyle source is
  generated first and imported by the harness as a module; the file written
  for a materialised trial is the same text plus a comment block.
  Checked by hand: the Ghostyle of a fuzz trial loaded in `lab.html` (through
  `lab-capture.cjs render --ghostyle`) paints the same pixels as the fuzzer.
- **Measuring is the lab's.** The composite (frame + overlay) goes through
  `faceapi.detectSingleFace(…, DETECTOR_OPTIONS).withFaceLandmarks().withFaceDescriptor()`,
  then, if nothing is found, the same call at score 0.1, as `compositeAndDetect()`
  does in `lab-js/engine.js`.

### Speed

face-api dominates. On swiftshader (no GPU, the default) one pass on a
480 × 864 frame takes about 2 s, so a trial costs about 2 s per imprint:
~30 s with the 14 imprints of `my-moving-face.mp4`, ~2 min with 60 imprints.
Levers, all inside the browser:

- `--gpu` runs Chromium on the machine's GPU;
- `--max-imprints` caps the atlas;
- early stopping (on by default, `--no-prune` to disable): once `--top`
  trials are complete, a new trial sweeps a stratified subset of
  `--prune-subset` imprints (default 12, spread over yaw) and is abandoned if
  its subset escape rate is below the current K-th best minus
  `--prune-margin` **and** its worst case is already below the K-th best.
  Pruned trials stay in the log, marked `pruned`. With an atlas smaller than
  the subset, nothing is pruned.
- Ctrl-C stops after the current trial and still materialises the top.

Each run starts with a **control**: the clean frames are described again and
compared with the atlas. In the same environment the drift is ~1e-6. A larger
drift (atlas built on swiftshader, trials on `--gpu`) shifts every distance by
up to that amount; the run warns above 0.05.

---

## 3. The pose atlas

### 3.1 Steps

1. **Scan.** Every `round(fps / --sample-fps)`-th frame (15 per second by
   default) goes through MediaPipe FaceLandmarker (IMAGE mode, transformation
   matrix on): presence, pose, sharpness, iris scale.
2. **Presence and gaps.** Runs of frames without a face become gaps. Gaps
   never abort the atlas: they are reported (warned above `--max-gap`) and
   drawn on the time axis of the report.
3. **Bins.** Each face frame goes into its yaw × pitch bin. If more bins are
   filled than `--max-imprints`, the ones farthest from frontal are dropped.
4. **Candidates.** Per bin, the `--candidates` sharpest frames (3 by
   default); for the anchor, the 6 most frontal frames (inside
   `--anchor-window` if given). All are extracted as PNG and measured again
   with MediaPipe, then face-api.
5. **Anchor.** The most frontal candidate that face-api recognises at score
   ≥ 0.5. No anchor, no atlas.
6. **Imprints.** Per bin, the sharpest candidate face-api recognises. The
   bin is the one of the PNG's own pose. A bin seen by MediaPipe where face-api
   recognises no candidate goes to `unrecognisedBins`: there is no clean
   descriptor to compare with, so the pose cannot be measured. Expect these
   beyond about ±40–50° of yaw, where the TinyFaceDetector gives up.
7. **Skin swatch** on the anchor (§5).
8. **Noise floor**: for each imprint, the clean distance to the imprint
   nearest in pose.

### 3.2 Why bins, and why 60

Consecutive frames are near-duplicates. Sampling by time would fill the atlas
with the poses held longest (usually frontal) and weight every score towards
them. One imprint per bin gives each pose one vote. A turn of ±50° yaw and
±30° pitch covers about 10 × 6 = 60 bins of 10°, hence the default cap. 10° is
about the pose change at which the face-api descriptor of the same person
drifts measurably (on `my-moving-face.mp4` the noise floor between
neighbouring bins is ~0.24, median); smaller bins mostly add near-duplicates
and cost sweep time.

### 3.3 Imprint fields

`pose-atlas.json` → `imprints[]`:

| Field | Unit | Comes from | Meaning |
|---|---|---|---|
| `id` | int | atlas | Index, in time order. |
| `t` | s | `frame / fps` (ffprobe average frame rate) | Media time. X axis of the evasion profile. |
| `frame` | int | ffmpeg frame number (`n` of the select filter) | Exact source frame, to find it in another tool. |
| `yaw` | deg | MediaPipe facial transformation matrix, Euler Z·Y·X | Left/right turn. 0 = facing the camera, **positive = nose towards the image's right**. |
| `pitch` | deg | same | Nod. **Positive = chin up.** |
| `roll` | deg | same | In-plane tilt. **Positive = clockwise on screen.** Not binned: face-api aligns roll itself. |
| `bin` | [int, int] | `floor(yaw / bin)`, `floor(pitch / bin)` | Pose bin key. |
| `width`, `height` | px | the PNG | Frame size. |
| `score` | 0–1 | face-api TinyFaceDetector (inputSize 416) | Detector confidence on the clean frame. |
| `box` | px | face-api detection | Face box `{x, y, width, height}`. |
| `sharpness` | float | variance of the Laplacian on a 160-px-wide grey crop of the face oval | Why this frame won its bin. Higher = sharper. |
| `irisPx` | px | MediaPipe iris contours 469–472, 474–477 | Iris diameter: per eye, the larger of the horizontal and vertical spans (the vertical one is not shortened by a turn), averaged over both eyes. |
| `pxPerCm` | px/cm | `irisPx / 1.17` | Metric scale: the visible iris is ~11.7 mm across in adults, with little spread. |
| `ipdCm` | cm | distance between iris centres 468 and 473 | Cross-check of the scale; the atlas warns outside 5.5–7.5 cm. |
| `noise` | L2 | §3.1 step 8 | Clean drift to the nearest pose. Distances inside the noise say nothing. |
| `framePath` | path | atlas | `frames/imprint-NNNN.png`, lossless, native resolution. |
| `descriptor` | float[128] | face-api FaceRecognitionNet on the full frame | The clean fingerprint. Compared by Euclidean (L2) distance. |
| `landmarks68` | px | face-api landmark net | Kept for a future 2D (`onDraw`) export. |
| `mesh` | [x, y, z] × 478 | MediaPipe FaceLandmarker | x, y as fractions of width and height, z relative depth on the x scale (smaller = closer to the camera). Used to paint this frame. Includes the iris points 468–477. |
| `cues` | — | image geometry | Nose offset, nose height, eye-axis angle: used once per atlas to check the signs of yaw, pitch and roll (`poseSignCheck`, Pearson r, must be positive). |

Atlas-level fields: `source` (file, size, fps, duration, SHA-256 of the
first MiB), `config` (options, harness backend), `anchorId`, `skinSwatch`,
`presence` (`samples`, `gaps`, `presentShare`), `noiseFloor` (median, p90),
`poseSignCheck`, `unrecognisedBins`.

The atlas directory also holds `anchor.png` and `skin-mask.jpg` (the pixels
that entered the skin median, tinted green).

---

## 4. Recipes and strokes

### 4.1 Recipe

`scripts-dev/ghostyle-fuzz/recipes/three-bands.json`:

```json
{
  "name": "three-bands",
  "shape": "line",
  "count": 3,
  "lengthCm": 5,
  "widthCm": 2,
  "opacity": 0.8,
  "palette": { "pool": "xterm256", "size": 4, "contrast": "luminance", "quantile": 0.75, "minPairDeltaE": 20 }
}
```

`opacity` takes 0–1, or 1–100 read as a percentage. Unknown keys are an
error, so a typo cannot fall back silently to a default. Only `shape: "line"`
and `pool: "xterm256"` exist for now. The recipe id in logs and folder names
is `<name>-<hash of the normalised recipe>`.

Four optional keys (1.1.0), each also a `trial` option. They enter the
normalised recipe only when they differ from the default, so a recipe without
them keeps the id and the trials it had before:

| Key | `trial` option | Effect |
|---|---|---|
| `color` | `--color <css>` | One colour on every stroke (CSS name, `#rgb`, `#rrggbb`, `rgb(r,g,b)`, stored as `#rrggbb`). No palette is drawn. |
| `overlap: false` | `--no-overlap` | Strokes must not overlap. A stroke that overlaps an earlier one (or falls entirely outside the oval) is redrawn; after 1000 failures the trial stops with an error. |
| `zones` | `--zones a,b` | Stroke centres only in these bands of the anchor face: `forehead` (above the brow line), `eyes` (down to halfway between eye line and nose base), `nose-cheeks` (down to the mouth), `mouth-chin`. |
| `pairedSeeds: true` | `--paired` | The palette is drawn from its own random stream, so a seed gives the same strokes on every face (§4.2). |

`color` and `pairedSeeds` exclude each other (no palette, nothing to pair);
an option that contradicts the recipe file is an error, not an override.
`recipes/` holds a set of variants built around these keys: shape at equal
area (`one-long-band`, `six-thin-lines`, `ten-hairlines`, `two-patches`),
controls on the three-bands geometry (`-opaque`, `-any-colour`, `-perceptual`,
`-white`, `-black`, `-no-overlap`) and placement (`nose-bands`, `eye-bands`,
`no-eyes-bands`, `forehead-cheeks-lines`).

### 4.2 Seeds

- No `--seed`: a random 32-bit master seed is drawn and printed.
- Trial *k* of a run uses seed `master + k`.
- `--seed X --trials 1` repeats exactly the trial of seed X (same atlas, same
  recipe). The report prints that command for every trial.
- The RNG is mulberry32. Order of draws (part of the reproducibility
  contract): the palette first, then, per stroke, centre, angle, colour.
- **The same seed is not the same design on another face** with a default
  recipe: the palette draw rejects colour sets until they are far enough apart
  (§5.3), the number of rejections depends on the skin swatch, and every
  rejection consumes random numbers, so the stroke draws that follow start
  from a different point. On three videos of one person only 13–35 % of the
  seeds drew the same strokes. With `--paired` (palette from a second stream
  seeded `seed ^ 0x9E3779B9`) or `--color` (no palette draw) the strokes depend
  on the seed alone; `compare` then lines the faces up seed by seed.

### 4.3 Drawing a trial

1. Draw the contrast palette (§5).
2. Per stroke:
   - centre: a uniform mesh point in 0–467 (iris points excluded);
   - angle: uniform in [0°, 180°);
   - a `lengthCm × widthCm` rectangle around the centre on the anchor frame,
     sized with the anchor's `pxPerCm`;
   - colour: uniform among the palette colours.
3. Each rectangle is clipped to the face oval (convex hull of the MediaPipe
   oval). Outside the oval there is no mesh to carry it. `clippedShare` logs
   the part lost.
4. Strokes may cross eyes, brows, lips and each other; paint order is draw
   order, at the recipe opacity.
5. **Bake to UV.** The outline is sampled every 2 mm; each point is located
   in an anchor-mesh triangle and moved to UV with its barycentric
   coordinates. Where triangles overlap on screen (nose wings) the one closest
   to the camera wins; a point in no triangle is snapped to the nearest one
   (`snappedShare`).

Logged per stroke: `centreIndex`, `angleDeg`, `colour`, `anchorPolygonPx`,
`uvPolygon`, `clippedShare`, `snappedShare`, and `regions`: the share of the
stroke's area on eyes, brows, lips and nose. Per trial: `coverage`, the
share of the face oval under at least one stroke.

---

## 5. Colour

### 5.1 Skin swatch

- **Region.** On the anchor: the face oval **above the nose base**, minus
  eyes, brows and lips, each grown by 2.5 mm. The lower face is left out
  because beard, stubble and the shadow under the mouth are not skin colour:
  on `my-moving-face.mp4` the beard alone moved the median L\* from 68.6 to
  61.2. Check `skin-mask.jpg`.
- **Colour space.** sRGB → linear RGB → XYZ (D65) → CIELAB. L\* is perceived
  lightness, and distances in CIELAB are close to perceived differences;
  averaging in RGB mixes lightness and hue unevenly.
- **Median, not mean.** Skin pixels include specular highlights (forehead,
  nose tip) and shadows. Both are outliers in L\*, and a mean follows them; a
  per-channel median ignores up to half of the pixels being outliers.
- Stored: `lab` (the median), `lRange` (10th–90th percentile of L\*, how uneven
  the light is), `pixels`, `region`, and `hexForDisplay` (median sRGB, only
  for drawing the chip).

### 5.2 Contrast

- **"Black and white" contrast, made measurable.** Turning a picture grey
  keeps lightness, so contrast in grey is `ΔL* = |L*colour − L*skin|`. This is
  `contrast: "luminance"`, the default.
- `contrast: "perceptual"` uses CIEDE2000 instead, which also counts hue and
  chroma.
- **A hypothesis, not a fact.** face-api receives RGB, not grey; the idea that
  luminance edges matter most comes from how early convolution filters
  respond. Each trial logs ΔL\* and ΔE00 of its colours, and report view 5
  plots them against the scores.

### 5.3 Drawing the palette

1. Pool: xterm-256 indices 16–255 (6 × 6 × 6 cube + 24 greys). Indices 0–15
   are left out: terminals render them each their own way, so they are not a
   standard.
2. Keep the colours whose contrast is at or above the `quantile` of the pool
   (0.75: the top quarter, ~60 colours).
3. Draw `size` of them; reject the draw if two are closer than
   `minPairDeltaE` (ΔE00). Without this, on light skin the top-ΔL\* colours are
   all near-black and four colours would be one.
4. After 200 rejected draws, lower `minPairDeltaE` by 5; the value used is
   logged (`usedMinPairDeltaE`).

The skin decides the direction: light skin (L\* ≈ 70) gets mostly dark
colours, dark skin (L\* ≈ 30) mostly light ones, mid skin (L\* ≈ 50) both,
with a lower maximum ΔL\*.

---

## 6. Distances and scores

### 6.1 Per imprint

| Column | Definition | Reading |
|---|---|---|
| `dPair` | ‖overlay(i) − clean(i)‖ | How far the overlay moved this very frame. |
| `dAtlas` | minⱼ ‖overlay(i) − clean(j)‖ over every imprint | The reference identity is the video itself, all its clean poses. Always ≤ `dPair`: the strict reading. |
| `nearestId` | the j of `dAtlas` | Which clean pose it still resembles most. |
| `noise` | §3.1 step 8 | Clean drift, for scale. |
| `detection` | `ok` / `weak` / `lost` | `weak`: found only at score 0.1 (it still has a descriptor and a distance). `lost`: not found at all, the strongest result. |

Threshold **0.6** (dlib's LFW default, as in `realtime.js` and the video
loader). An imprint **escapes** when it is `lost` or its `dAtlas` ≥ 0.6.

### 6.2 Per trial

| Score | Definition | Question it answers |
|---|---|---|
| `escapeRate` | share of imprints that escape | How much of the head turn is covered? |
| `lostRate` | share of imprints where no face was found at all | How much of that is the detector giving up? |
| `descriptorEscape` | share of imprints where a face was found but `dAtlas` ≥ 0.6 | How much is the identity actually moving? (`escapeRate = lostRate + descriptorEscape`) |
| `descriptorEscapeDetected` | the same count over the detected imprints only | Given that face-api sees a face, how often is it not this one? |
| `worstCase` | smallest `dAtlas` (`allLost` when every imprint lost the face) | Is there any recognisable frame? A camera needs only one. |
| `medianMargin` | median of `dAtlas − 0.6` (null when most imprints are lost) | How comfortably? |

Neither score ranks alone. `--top` keeps the **Pareto front** (trials no other
trial beats on both) first, then the best by `escapeRate`.

The split matters because the two mechanisms behave differently: a lost face
depends on image quality (blur, scale, pose) at least as much as on the
overlay, and the trivial way to get it is a stroke across the eyes; a moved
descriptor is the rarer, more interesting result. `report` prints both per
recipe, together with the mean face coverage, and the leaderboard has a
column for each.

### 6.3 Several atlases: `compare`

```
node scripts-dev/ghostyle-fuzz.cjs compare --atlas scratch/fuzz/a/pose-atlas.json --atlas scratch/fuzz/b/pose-atlas.json [--output compare.txt]
```

`report --summary-json <file>` also writes the per-recipe summary and the
list of materialised trials as JSON, for wrappers; the local web service
(`tutorials/localfuzzer-docker.md`) uses it.

`compare` prints three tables: the image-quality variables of each atlas (frame size,
imprints, pose range, px/cm on the anchor, Laplacian sharpness, clean
detection score, noise floor, skin L\*, unrecognised bins, presence, gaps);
the outcome split per recipe and atlas; and, per recipe, the seeds that drew
the same strokes on every atlas, with the escape of each design face by face,
ranked by the worst face. `escapeRate` itself is not comparable across atlases
of different size: more imprints means more clean poses a perturbed
descriptor can land near (`dAtlas` is a minimum over all of them), and a
wider pose range means more fragile side views.

---

## 7. Outputs

```
scratch/fuzz/<video-stem>/          (scratch/ is git-ignored)
  pose-atlas.json
  anchor.png
  skin-mask.jpg
  frames/imprint-0000.png …
  trials.ndjson                      append-only: one "run" line per run, one "trial" line per trial
  runs/<recipe-id>-<seed>/           materialised trials only
    anchor-overlay.jpg               the anchor frame with the overlay
    poses-overlay.jpg                every imprint with the overlay, labelled with its result
    ghostyle-fuzz-<seed>.js          the Ghostyle
    evasion-profile.csv              one row per imprint (§6.1)
    trial.json                       the trial line, recipe included
  report.html
```

### 7.1 The Ghostyle

A `paintUV` plugin with `textureSize = 1024` (the lab's default is 256) that
fills the trial's polygons in UV space at the recipe opacity. Its header
passes `npm run validate-plugin`; its comment block carries the atlas, the
recipe, the palette, the scores and the command that reproduces it. To try it
in the lab, copy it into `ghostyles/` and add an entry to `ghostyles.json`.
The lab measures UV Ghostyles with face-api as well: `plugins3d-loader.js`
paints them into the composite on `beforeEfficacyComposite`.

### 7.2 The report

`report` reads the atlas and `trials.ndjson` and writes one self-contained
page (no network). When a seed appears more than once for a recipe, the
latest complete sweep wins.

1. **Two criteria.** Every trial at (escapeRate, worstCase); the Pareto front
   highlighted.
2. **Leaderboard.** Sortable by escapeRate, worstCase, margin, lost,
   coverage; Pareto badge; tick boxes for view 6.
3. **Trial.** Anchor picture (materialised render, or the strokes drawn flat
   on the anchor), palette with ΔL\* and ΔE00, regions crossed, the command
   that repeats it, links to the files, and:
   - **evasion profile**: X = time, Y = distance, one tick per imprint,
     `dAtlas` and `dPair`, the noise band, the threshold, ▲ for lost faces;
     under the axis the presence strip with gaps hatched;
   - **pose map**: yaw × pitch bins coloured by `dAtlas` (red recognised,
     teal escaped, × lost, grey not measurable).
4. **Fuzz matrix.** Trials × imprints, coloured by `dAtlas`: bright rows are
   good trials, dark columns are poses no trial defeats.
5. **What matters.** One trial property (coverage, mean ΔL\*, ΔE00, area on
   eyes, brows, nose, lips, share clipped) against one score, with Pearson r.
6. **Compare.** `dAtlas` over time for up to four ticked trials.

---

## 8. Limits

- One person, one video, one detector. The atlas measures face-api against
  this person's own clean poses; nothing here generalises to other people or
  to other recognition systems.
- Poses face-api cannot recognise clean (`unrecognisedBins`) cannot be
  scored, so a wide head turn is only partly covered.
- Strokes exist only on the MediaPipe mesh: anything outside the face oval
  (ears, neck, hair) is clipped.
- The renderer is the lab's: it draws every triangle, including those turned
  away on a profile view, exactly as the lab does.
- The harness runs MediaPipe on the CPU delegate (on the GPU with `--gpu`);
  the lab uses the GPU delegate, whose landmarks can differ by a fraction of
  a pixel.
- `--gpu` and swiftshader can give slightly different descriptors: compare
  runs made on the same backend, and watch the control drift.
