# Realtime latent space visualizer: how it works and why

**Project:** Ghostmaxxing

**Audience:** people iterating on physical makeup, researchers inspecting
face-descriptor drift, and contributors who need to audit the method

**Status:** experimental

The Realtime Latent Space Visualizer (`realtime.html`) is a local browser
instrument for testing how a physical makeup step changes one face descriptor
relative to a session baseline. It uses the 2D face-api/dlib pipeline. It does
not use MediaPipe or the experimental 3D path.

The tool reports what one publicly available 2017 model did under the tested
conditions. It does not make a face invisible, establish protection from face
recognition, or predict the output of a deployed system. A face match is a
system output, not a truth. This page makes that output inspectable and gives
each consequential number a provenance.

Use the first part as an operating guide. The sections that follow account for
the pipeline, algorithms, thresholds, research context, privacy model, and
limits. Someone who has never opened the code should be able to run a session
and judge what its readings do and do not support.

**Code scope:** `realtime.html`, `styles/realtime.css`,
`lab-js/realtime/realtime.js`, and its `realtime-*.js` modules. The 2D and 3D
effect pipelines in `lab.html` use different models (MediaPipe FaceLandmarker
and MobileNetV3 ImageEmbedder) and are outside this document's scope.

## Run an experiment

### Choose a source

The camera is the default source. Open **Source → Open local video** to use a
recording instead. The file remains on the device and can be paused, sought,
and replayed with the browser's video controls.

Changing source invalidates the current baseline. Camera baselines can be
restored after reload. Local-video baselines last only for the current page
session because the temporary file URL does not survive a reload.

**Source → Brightness** changes only how the video looks on screen. The model
continues to read the original pixels, so this control cannot improve lighting
or change a measurement.

### Capture a baseline

1. Return to a neutral, frontal pose and keep the room light steady.
2. Press **Set baseline**.
3. Keep your face still and look at the centre target while the tool collects
   five accepted samples across at least two seconds. The target pulses when a
   clean sample is accepted. The diagnostic line counts excluded frames
   separately.

The strict baseline gate rejects a frame when detection confidence is low, the
face is too small or clipped, head roll or yaw is too large, or the face crop is
badly underexposed or overexposed. A detected face can therefore be excluded
from measurement. Descriptor extraction succeeded, but the frame was not
comparable enough to use. The capture message reports every failed check.

For a local video, sample spacing follows `video.currentTime`. A paused or
ended video cannot contribute the same decoded frame repeatedly.

The resulting medoid becomes the baseline. Its average spread is the session
noise floor. The accepted frames also produce a separate median 2D alignment
guide: jaw, upper detector arc, eye line, and nose centre. It appears briefly
when the baseline is set. Press **Show guide** on touch or mobile, or press
**Space** while no video or form control has focus, to show it for one second.
It then fades over 600 ms. The guide helps a person return to approximately the
same framing. It never enters descriptor-distance calculations.

### Measure a makeup step

1. Press **Start makeup step** before applying one change. The timeline marks
   the event and shades the application interval.
2. Apply the change. You may leave the frame. The timeline continues with a
   **No face** background and does not invent a distance line.
3. Return to the baseline pose, framing, and light, then press **Measure this
   step**.
4. Hold still while the tool collects eight comparable samples across at least
   three seconds.

The result is the medoid of that window, not the single frame visible when the
button was pressed. The tool shows its distance from the original baseline and
its temporal spread, updates the measured radial shape, and saves the sharpest
accepted frame as a step thumbnail. Repeat with **Start next step** for
cumulative changes.

With a local video, phase markers include media time. Starting or measuring a
step resumes a paused video so the collection window advances instead of
silently sampling one frozen frame.

### Understand exclusions

After baseline capture, the software permits appearance changes that may lower
detector confidence or darken the face crop. It still excludes frames whose 2D
pose, face-box size or position, or ambient luminance differs too much from the
baseline. Ambient light is estimated outside the face box so dark makeup is
less likely to be mistaken for a room-light change.

This is a nuisance gate, not full pose or lighting normalisation. It does not
measure pitch. It cannot know that makeup caused the remaining change, and it
cannot separate every shadow from every intervention.

Excluded descriptor readings do not stop the timeline. Their raw distance is
drawn over **Outside baseline guide** or **Lighting changed** backgrounds, but
it is not used for the noise floor, declared-step snapshots, automatic spike
captures, equalizer, or radial plot. Click a quality item in the timeline
legend to hide or restore that state without deleting it. Hiding a state also
collapses its vertical duration, so valid rows before and after it become
adjacent.

The distance header states **Valid distance** when the reading is admitted to
measurement. It states **No distance** with the cause when the visible number
is raw context only. The one-line status pill carries the same colour family as
the timeline state and reports the diagnostic values for pose, framing, or
light. Each state remains visible for at least 1.5 seconds so rapid changes do
not make the instruction unreadable. Hovering the pill exposes the complete
diagnostic when the visible line is truncated.

### Read the three panels

- **Distance:** the live Euclidean distance and a scrolling timeline. The noise
  floor is measured from this baseline. `0.60` is dlib's documented LFW
  operating point. The space between them is deliberately uncalibrated.
- **Source and experiment:** camera or local video, baseline progress, phase
  controls, status, capture controls, and local gallery actions. Brightness is
  a display setting only.
- **Descriptor delta:** the equalizer shows each of the 128 absolute coordinate
  deltas. The radial plot sorts those magnitudes and reduces them into 16
  equal-sized RMS bands. Its live valid outline can be compared with the filled
  shape from the latest measured step. On an excluded frame it freezes and
  says **Last valid frame** instead of displaying an uncontrolled reading.

Descriptor dimensions and ranked bands are not facial regions. A radial spoke
cannot identify which cheek, eyebrow, or makeup line caused a change. These
views show whether two 128-value patterns differ. They do not explain the face
semantically.

### Manage captures and local data

Manual, sustained-spike, and declared-step captures are saved as watermarked
JPEGs in browser IndexedDB. Their footer carries the Ghostmaxxing mark plus the
captured distance, match threshold, and resulting verdict. The capture's
timestamp remains in stored metadata and exported filenames. Camera baselines
and view settings use `localStorage`. The selected video is neither uploaded
nor persisted by the page.

**Source → Reset baseline** removes the persisted camera descriptor but does
not erase the gallery. Use **Delete all** or delete individual captures in the
viewer when those records are no longer needed.

A 128-value face descriptor is biometric data. Treat exported images and local
browser storage accordingly, even though this page does not transmit them.

### Interpret and report a result

Report the measured step distance together with the baseline noise floor and
the step's temporal spread. Compare steps within one session, capture a new
baseline after changing the source or setup, and repeat promising measurements.
A high value is evidence of movement in this specific dlib embedding under
these conditions. It is not evidence of evasion against a deployed system.

## Method, evidence, and limits

Every threshold in the sections below is tagged with its provenance:

| Tag | Meaning |
|---|---|
| **CITED** | Traceable to a published source, linked inline |
| **MEASURED** | Computed from the operator's own session, on their own hardware |
| **CHOSEN** | A design decision with stated reasoning but no external authority |
| **UNTUNED** | Chosen, and known to need empirical calibration |

If a number is not tagged CITED, it is not evidence of anything about face
recognition in general. It is a setting.

---

## Table of contents

- [Run an experiment](#run-an-experiment)
- [Method, evidence, and limits](#method-evidence-and-limits)

1. [The honest summary](#1-the-honest-summary)
2. [The pipeline](#2-the-pipeline)
3. [What a 128-dimensional face descriptor is](#3-what-a-128-dimensional-face-descriptor-is)
4. [Where 0.6 comes from](#4-where-06-comes-from)
5. [What LFW does and does not tell you](#5-what-lfw-does-and-does-not-tell-you)
6. [Demographic differentials](#6-demographic-differentials)
7. [The metrics vocabulary](#7-the-metrics-vocabulary)
8. [The table that is not in this tool, and why](#8-the-table-that-is-not-in-this-tool-and-why)
9. [Algorithms implemented here](#9-algorithms-implemented-here)
10. [Every threshold, and where it came from](#10-every-threshold-and-where-it-came-from)
11. [Adversarial makeup: the research](#11-adversarial-makeup-the-research)
12. [Transferability: the central caveat](#12-transferability-the-central-caveat)
13. [What this tool can and cannot tell you](#13-what-this-tool-can-and-cannot-tell-you)
14. [Privacy and data handling](#14-privacy-and-data-handling)
15. [Regulatory context](#15-regulatory-context)
16. [Vendored assets and provenance](#16-vendored-assets-and-provenance)
17. [Reading list](#17-reading-list)
18. [Glossary](#18-glossary)

---

## 1. The honest summary

This tool measures **one number**: the Euclidean distance between a 128-dimensional
descriptor of your face captured before a makeup session, and a descriptor of
your face right now, both produced by dlib's face recognition ResNet as shipped
in face-api.js.

That number tells you how far one specific, publicly available 2017 model has
moved you in its own embedding space. It does **not** tell you:

- whether you would be recognised by any deployed surveillance system
- whether the makeup would work on a different model
- whether the makeup would work under different lighting or from a different angle
- whether your face is "safe"

What it is genuinely good for is **iteration**. If you are developing a makeup
technique, you need a fast local signal to compare variant A against variant B.
This gives you that, cheaply, offline, on your own device, without sending a
face anywhere. It can take either a live camera or a local video, mark the
operator-declared application intervals, and measure each finished step over a
short temporal window. Treat it as a rehearsal instrument, not a verdict.

The rest of this document explains why that framing is the correct one.

---

## 2. The pipeline

The input is either the live camera or a video file selected from the device.
The local file is read through a temporary object URL; it is not uploaded or
persisted. Both inputs go through the same 2D face-api pipeline below.

Three separate models run in sequence on each frame. They are frequently
conflated in public discussion, and the distinction matters because an
intervention can affect one stage without affecting the others.

### 2.1 Detection: TinyFaceDetector

Finds face bounding boxes. A compact CNN shipped with
[face-api.js](https://github.com/vladmandic/face-api), based on Tiny YOLO v2.
Configured in `config.js`:

```js
export const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
   inputSize: 416,      // square input dimension
   scoreThreshold: 0.5  // minimum reported confidence
});
```

**This is the stage that classical anti-surveillance makeup targeted.** See
[§11.1](#111-cv-dazzle-2010-and-its-own-obsolescence).

### 2.2 Alignment: 68-point facial landmarks

`faceLandmark68Net` locates 68 points: jaw outline (0–16), eyebrows (17–26),
nose (27–35), eyes (36–47), mouth (48–67). The recognition network needs a
canonically-aligned crop, so landmarks are used to rotate and scale the face
before embedding.

This tool also reads landmarks directly for pose estimation: see
[§9.2](#92-the-quality-gate).

### 2.3 Recognition: 128-d descriptor

`faceRecognitionNet`, a port of
[dlib's `dlib_face_recognition_resnet_model_v1`](https://github.com/davisking/dlib-models).
Takes a 150×150×3 aligned face crop, outputs 128 floating-point numbers.

Architecture and training, from
[Davis King's announcement post](https://blog.dlib.net/2017/02/high-quality-face-recognition-with-deep.html):

- A ResNet with **29 convolutional layers**: a reduced
  [ResNet-34](https://arxiv.org/abs/1512.03385) (He, Zhang, Ren & Sun, 2015)
  with layers removed and filters per layer halved
- Trained from scratch on **~3 million face images** across **7,485 identities**
- Sources: [FaceScrub](http://vintage.winklerbros.net/facescrub.html),
  the [VGG Face dataset](https://www.robots.ox.ac.uk/~vgg/data/vgg_face/),
  and images scraped from the web by the author
- LFW identities were deliberately excluded so the LFW evaluation stayed valid
- The model file is public domain

**Age note.** This model was published in February 2017 and has not been
retrained. It is a reasonable stand-in for "an open-source face recogniser," and
a poor stand-in for the state of the art. See
[§12](#12-transferability-the-central-caveat).

---

## 3. What a 128-dimensional face descriptor is

### 3.1 Deep metric learning

Classical face recognition extracted hand-designed features
([Eigenfaces](https://www.face-rec.org/algorithms/PCA/jcn.pdf), Turk & Pentland
1991; Fisherfaces; LBP histograms). Modern systems instead learn a **mapping**
from face image to a vector space where geometric distance corresponds to
identity difference.

The canonical statement of this idea is
[**FaceNet**](https://arxiv.org/abs/1503.03832) (Schroff, Kalenichenko & Philbin,
CVPR 2015), which trained with a *triplet loss*: pull an anchor face toward
another image of the same person, push it away from a different person, by at
least a margin. Everything downstream, including dlib's model, is a variation
on this.

The practical consequence: **recognition becomes arithmetic.** Once faces are
vectors, identifying someone is a nearest-neighbour lookup. There is no
"template" of your face in a human-legible sense; there is a point in R¹²⁸.

### 3.2 Distance metrics

For descriptors *a* and *b*, this tool uses **Euclidean (L2) distance**:

```
d(a, b) = √( Σᵢ (aᵢ − bᵢ)² )
```

Implemented in `realtime-capture.js` as `euclidean()`. Deliberately not
`faceapi.euclideanDistance`: keeping it local means the module can be unit
tested without loading the vendor bundle.

**Do not substitute cosine similarity.** Davis King has answered this directly
[in the comments of the announcement post](https://blog.dlib.net/2017/02/high-quality-face-recognition-with-deep.html):
a user reported high cosine similarity between images of different people, and
the answer was that the model is calibrated for Euclidean distance. Cosine
similarity discards vector magnitude; for this model, that magnitude carries
information.

Other systems differ.
[ArcFace](https://arxiv.org/abs/1801.07698) (Deng et al., CVPR 2019) optimises
angular margin and *is* naturally read with cosine similarity. **Thresholds and
metrics are not portable between models.** A distance of 0.6 means something in
dlib's space and nothing at all in ArcFace's.

### 3.3 Vector norm: a subtlety that affects the baseline

dlib's descriptors are not explicitly L2-normalised to unit length, though in
practice their norms cluster near 1. This matters for one reason: **averaging
several descriptors produces a vector shorter than its inputs**, because
imperfectly-aligned vectors partially cancel. A mean-of-N baseline therefore
sits slightly inside the manifold, and every subsequent distance measured
against it carries a small systematic offset.

This tool avoids the problem entirely by using the **medoid** rather than the
mean: see [§9.3](#93-medoid-baseline).

---

## 4. Where 0.6 comes from

This is the single most-cited and least-understood number in open-source face
recognition. It has two independent justifications, and most write-ups mention
only the second.

### 4.1 It is baked into the training objective

From [Davis King's post](https://blog.dlib.net/2017/02/high-quality-face-recognition-with-deep.html):
the network was trained with a structured metric loss that attempts to project
each identity into a **non-overlapping ball of radius 0.6**. It is a pairwise
hinge loss over all pairs in a mini-batch, with hard-negative mining.

This is the important part. **0.6 is not a threshold discovered by tuning after
training: it is the geometry the network was explicitly optimised to produce.**
The model was told to make same-identity clusters fit inside spheres of that
radius. The threshold is the training target, read back out.

That makes 0.6 far more principled than a tuned hyperparameter, *and* far more
model-specific. It is a fact about this network's loss function. It transfers to
no other model.

### 4.2 It is the operating point of the reported benchmark

From [dlib's `face_recognition.py` example](https://github.com/davisking/dlib/blob/master/python_examples/face_recognition.py):
at a distance threshold of 0.6, the model reaches **99.38% accuracy on LFW**.
The docs state the plain-language rule: descriptors closer than 0.6 are
generally the same person, further apart generally are not.

`face-api.js` inherits this as the default `distanceThreshold` in its
[`FaceMatcher`](https://github.com/vladmandic/face-api).

### 4.3 What "99.38%" actually measures

It is a **verification** figure on a specific protocol: given a pair of images,
correctly say same/different, on LFW's balanced 6,000-pair test. It is not:

- an identification (1:N search) figure: those degrade with gallery size
- a figure for any demographic subgroup
- a figure for non-frontal, low-resolution, or surveillance-quality imagery
- a figure that has been re-validated on any recent dataset

Accuracy on 1:1 verification and accuracy on 1:N identification against a
12-million-person gallery are different problems. See
[§7](#7-the-metrics-vocabulary).

---

## 5. What LFW does and does not tell you

[Labeled Faces in the Wild](https://vis-www.cs.umass.edu/lfw/) (Huang, Ramesh,
Berg & Learned-Miller, UMass Amherst TR 07-49, 2007) is ~13,000 images of ~5,700
individuals, scraped from news photographs. It became the field's default
yardstick.

### 5.1 It is demographically skewed

The widely-cited estimate is that LFW is approximately **83.5% white** and
**77.5% male**. This figure originates from Han & Jain's
[demographic analysis of unconstrained face images](https://www.researchgate.net/publication/263697688_Age_Gender_and_Race_Estimation_from_Unconstrained_Face_Images)
and is reproduced across the fairness literature: for example in
[Gender Classification and Bias Mitigation in Facial Images](https://arxiv.org/abs/2007.06141)
and the
[Harvard JOLT digest on racial bias in facial recognition](https://jolt.law.harvard.edu/digest/why-racial-bias-is-prevalent-in-facial-recognition-technology).
The [Algorithmic Fairness Datasets survey](https://arxiv.org/abs/2202.01711)
(Fabris et al.) documents LFW's skew toward white, male and under-60 subjects.

Because the images are news photographs of public figures, this skew reflects
whose faces circulate in Anglophone news media. That media pattern is now
baked into a benchmark.

### 5.2 The model's author says so himself

In the comments of the dlib announcement post, Davis King notes that LFW is
heavily biased toward white adult American public figures, that the training
data carries a similar bias, and that this creates an obvious problem for people
outside that distribution, who would **likely require a different threshold**.

There is empirical support for this. A study of the model on Asian faces
([Neural Network Facial Authentication for Public Electric Vehicle Charging Station](https://arxiv.org/abs/2106.10432))
reports accuracy dropping from the 99.38% LFW figure to **98.18%**, citing a
GitHub issue raised against dlib.

### 5.3 It is saturated

A benchmark where everything scores 99%+ has stopped discriminating between
methods. The field moved on to IJB-A/B/C, MegaFace, and NIST's ongoing FRVT
precisely because LFW no longer separates good systems from great ones.

**Consequence for this tool.** The 0.60 line is labelled in the UI as dlib's LFW
default, explicitly as a benchmark's number rather than a property of your face.
If you are not a white adult American public figure photographed by press
photographers, its calibration is less well established for you. There is no
correction factor to apply, because nobody has published one.

---

## 6. Demographic differentials

NIST evaluations and the academic literature document demographic performance
differences across many face-recognition systems. These differences are central
to any public-interest investigation of the technology.

### 6.1 NIST FRVT Part 3

[**NISTIR 8280: Face Recognition Vendor Test Part 3: Demographic Effects**](https://doi.org/10.6028/NIST.IR.8280)
(Grother, Ngan & Hanaoka, December 2019). See the
[full PDF](https://pages.nist.gov/frvt/reports/demographics/nistir_8280.pdf),
[NIST summary](https://www.nist.gov/news-events/news/2019/12/nist-study-evaluates-effects-race-age-sex-face-recognition-software).

189 algorithms from 99 developers. Key findings:

- Demographic differentials exist in the **majority** of algorithms studied
- Among US-developed algorithms, elevated false-positive rates in one-to-one
  matching for Asian, African American and Native American groups, with the
  American Indian demographic showing the highest false positive rates
- Many algorithms were 10–100× more likely to misidentify a Black or East Asian
  face than a white one
- Most algorithms were substantially less likely to correctly identify a Black
  woman than any other demographic group

Grother's own framing in the NIST release is careful: the report quantifies the
differentials without claiming to explain their causes.

### 6.2 The follow-up: false positives are the harder problem

[**NISTIR 8429: Face Recognition Vendor Test Part 8: Summarizing Demographic Differentials**](https://pages.nist.gov/frvt/reports/demographics/nistir_8429.pdf)

The finding that matters:

- **False positive differentials are widespread and occur even in pristine
  images.** Within-group false positive rates were found to vary by a factor of
  several thousand.
- False *negative* inequities are substantially attributable to poor photography
  of certain groups, notably under-exposure of dark-skinned individuals, and
  are fixable with better cameras and capture conditions.
- The much larger false *positive* variations are not fixable that way. They must
  be addressed in the algorithm.

This asymmetry is important. "Better lighting" is a real mitigation for one class
of error and no mitigation at all for the other.

### 6.3 The academic literature

- [**Gender Shades**](https://proceedings.mlr.press/v81/buolamwini18a.html)
  (Buolamwini & Gebru, FAccT 2018): the study that put this on the public
  agenda. **Note carefully:** it audits gender *classification*, not face
  verification. It is frequently miscited as a face-recognition-accuracy study.
  Its finding of far higher error rates for darker-skinned women than
  lighter-skinned men concerns a different task on the same faces.
- [Characterizing the Variability in Face Recognition Accuracy Relative to Race](https://arxiv.org/abs/1904.07325)
  (Krishnapriya et al.): impostor distributions for African-American cohorts
  shift toward higher similarity scores relative to Caucasian cohorts across
  multiple matchers, raising false match rates at any fixed threshold.
- [Analysis of Gender Inequality In Face Recognition Accuracy](https://arxiv.org/abs/2002.00065)
  (Albiero et al.): female impostor distributions shift toward higher
  similarity, female genuine distributions toward lower; d′ separation is
  consistently worse for women. The paper's subset analysis (neutral expression,
  head pose, visible forehead, **no makeup**) is directly relevant to this
  project.
- [Exploring Causes of Demographic Variations In Face Recognition Accuracy](https://arxiv.org/abs/2304.07175)
- [Impact of Blur and Resolution on Demographic Disparities in 1-to-Many Facial Identification](https://arxiv.org/abs/2309.04447)

**Consequence for this tool.** A single global threshold produces systematically
different error rates for different people. Since this tool measures *your*
distance from *your own* baseline, it sidesteps the cross-identity false-match
problem, but the underlying embedding still carries whatever demographic
structure the training data gave it, and there is no way to measure that from
one face.

---

## 7. The metrics vocabulary

Necessary to read any of the linked literature without being misled.

| Term | Meaning |
|---|---|
| **Verification (1:1)** | Are these two images the same person? What LFW measures. |
| **Identification (1:N)** | Which of N enrolled people is this? Harder; error grows with N. |
| **Genuine / mated pair** | Two images of the same person. |
| **Impostor / non-mated pair** | Two images of different people. |
| **FMR** (False Match Rate) | Fraction of impostor pairs accepted. A false accept. |
| **FNMR** (False Non-Match Rate) | Fraction of genuine pairs rejected. A false reject. |
| **FPIR / FNIR** | The 1:N identification analogues of FMR/FNMR. |
| **ROC** | FNMR plotted against FMR as the threshold sweeps. The whole curve, not one point. |
| **d′ (d-prime)** | Separation between genuine and impostor distributions: `|μ_G − μ_I| / √((σ²_G + σ²_I)/2)`. Assumes roughly Gaussian distributions. Higher is better. |

**The threshold is a dial, not a fact.** Moving it trades FMR against FNMR. Any
single accuracy number is one point on a curve, and quoting it without the
operating point is meaningless. This is why the visualizer does *not* let you
move the threshold: 0.60 is the one operating point with a documented
provenance, and a moved line would have none.

---

## 8. The table that is not in this tool, and why

During design, a banded interpretation table was proposed:

| Distance | Proposed meaning |
|---|---|
| 0.00–0.25 | Same face, session noise |
| 0.25–0.45 | Same face, natural variation |
| 0.45–0.60 | Approaching the boundary |
| 0.60+ | Reads as a different person |

**It was rejected, and it is documented here so nobody reintroduces it.**

Only the 0.60 boundary is sourceable. The 0.25 and 0.45 edges were a plausible
synthesis, not a published finding. A search of the literature turned up no
source: the genuine/impostor distribution work that exists
([Krishnapriya et al.](https://arxiv.org/abs/1904.07325),
[Albiero et al.](https://arxiv.org/abs/2002.00065)) covers other matchers and
reports similarity scores rather than dlib Euclidean distances, so it does not
transfer.

Rendering unsourced numbers as thin labelled lines on a plot would read as
*calibration*. Users would reasonably assume someone measured them. In a project
whose subject is facial recognition accountability, shipping a fabricated axis is
the wrong failure to have.

**What replaced it.** The tool draws exactly two reference lines, and they carry
different kinds of claim:

| Line | Provenance | Meaning |
|---|---|---|
| Noise floor | **MEASURED**: this session, this camera, this face | At or below it, the reading is within the variation observed during baseline capture |
| 0.60 | **CITED**: dlib training objective + LFW | A benchmark's number |

The gridlines at 0.25 / 0.50 / 0.75 / 1.00 / 1.25 are **axis ticks only**, drawn
at hairline weight so they cannot be mistaken for claims. They let you read a
value off the trace. They assert nothing.

The space between the noise floor and 0.60 is deliberately left uncalibrated,
and the UI says so.

---

## 9. Algorithms implemented here

### 9.1 Sampling and smoothing

Detection runs on `requestAnimationFrame` with a busy-flag guard, so the
detector is never re-entered while a pass is in flight. Readings accumulate in a
buffer; a separate 3 Hz timer averages the buffer into one timeline sample.
The buffer records a comparability state alongside each value. Valid values
feed the experiment; pose/framing and lighting exclusions remain visible as raw
context under distinct backgrounds. A no-face tick advances time with a null
value, so the trace lifts its pen instead of drawing a false zero.

The status pill is a deliberately slower projection of that stream. Its colour
swatch identifies the corresponding timeline class, but each visible state has
a 1.5-second minimum dwell so alternating valid/pose/light frames do not produce
unreadable text flicker. This does not smooth, delay or discard timeline data.

Rationale: raw per-frame distance is noisy, and the graph's job is trend
legibility, not maximum temporal resolution. The numeric readout is unsmoothed
and updates per frame, so instantaneous values remain visible.

Baseline and declared-step measurements use a different aggregation path. The
baseline collects five accepted descriptors distributed over at least two
seconds; a declared step collects eight over at least three seconds. Each window
then selects its medoid, so it is not represented by the frame that happened to
be visible when the button was pressed. Local-video spacing uses media time and
ignores repeated decoded frames while the video is paused or ended.

### 9.2 The quality gate

`realtime-capture.js → createQualityGate()`. Face detection and measurement
admission are separate stages: a valid 128-value descriptor can still be
excluded when pose, framing or light would make it a poor comparison with the
baseline. Baseline frames use the strict gate below. The UI reports all failed
checks, while retaining the first as the primary instruction:

**Confidence.** Detector score ≥ 0.85, above the 0.5 reporting floor in
`DETECTOR_OPTIONS`. A frame that barely registered as a face produces a
correspondingly unreliable descriptor.

**Scale.** Face box width ≥ 25% of video width. The recognition network resamples
to 150×150; a small box means feeding it upscaled mush.

**Framing.** Box fully inside the frame with ≥ 2% margin on every edge. A clipped
face yields a garbage descriptor that looks perfectly valid downstream: one of
the more insidious failure modes, because nothing errors.

**Roll**, from landmarks 36 and 45 (outer eye corners):

```
roll = |atan2(y₄₅ − y₃₆, x₄₅ − x₃₆)|   →   gate at 8°
```

**Yaw proxy**, from the nose tip (30) against the eye-corner midpoint,
normalised by interocular distance:

```
yaw ≈ |x₃₀ − (x₃₆ + x₄₅)/2| / ‖p₄₅ − p₃₆‖   →   gate at 0.12
```

This is a cheap monocular approximation, not a calibrated pose estimate. For
real head-pose work, see
[OpenFace](https://github.com/TadasBaltrusaitis/OpenFace) (Baltrušaitis et al.).

**Sharpness.** Gradient energy over a 96×96 greyscale crop:

```
E = (1/N) Σ (∂I/∂x)² + (∂I/∂y)²
```

A discrete approximation of the Tenengrad focus measure, related to the standard
variance-of-Laplacian blur detector. **Used only for ranking candidates against
each other, never against a fixed floor**: an absolute sharpness threshold would
vary with every camera, lens and lighting setup, and would be one more invented
constant.

**Exposure.** Mean crop luminance in [0.18, 0.86] (Rec. 601 weighting), and fewer
than 2% of pixels above 0.98. Rejects both under- and over-exposure.

The exposure gate connects directly to
[NISTIR 8429's finding](https://pages.nist.gov/frvt/reports/demographics/nistir_8429.pdf)
that false-negative inequities are substantially caused by under-exposure of
dark-skinned subjects. Refusing to build a baseline from an under-exposed frame
is a small, concrete mitigation.

Intervention frames deliberately use a different mode. Detector confidence and
face-crop exposure are not rejection criteria, because makeup may change exactly
those signals. Scale, framing, roll and yaw must still pass. The frame is then
compared with the baseline's averaged 2D conditions: roll, yaw proxy, face-box
scale and centre, plus ambient luminance sampled **outside** the face box. A
frame beyond those relative tolerances is omitted from every measurement-grade
path: declared-step aggregation, spike capture, equalizer and radial plot. Its
raw descriptor distance remains on the timeline under an exclusion background.
The header labels it **No distance** and states the exclusion cause. The operator can hide or restore each exclusion class
without deleting its samples. Hidden samples contribute zero virtual height, so
the interval truly collapses instead of leaving an empty coloured block.

This is exclusion, not correction. The software does not rotate, relight or
otherwise normalise a changed frame back to the baseline. The checks reduce
obvious pose, framing and room-light confounds, but they cannot prove that the
remaining distance came only from makeup. Pitch is not estimated, and ambient
luminance is a deliberately simple 2D proxy.

### 9.3 Medoid baseline

Given N accepted descriptors, compute the pairwise distance matrix and select the
member minimising summed distance to all others:

```
medoid = argmin_i  Σ_j d(xᵢ, xⱼ)
spread = (1/(N−1)) Σ_j d(x_medoid, xⱼ)
```

**Why medoid rather than mean:**

1. It stays a **real point** in the embedding, not a synthetic average.
2. It sidesteps the norm-shrinkage problem in [§3.3](#33-vector-norm-a-subtlety-that-affects-the-baseline),
   so no systematic offset gets baked into the reference.
3. It is naturally robust to one marginal frame slipping the gate. The mean is not.

Cost is O(N²) in distance computations: 10 pairwise comparisons for the
five-frame baseline and 28 for an eight-frame declared step, each over 128
elements.

The same accepted baseline frames produce a coordinate-wise median of the
normalized detector box and 68 landmarks. This separate 2D record draws the
temporary alignment guide; it is not a descriptor, is not selected as the
medoid, and never enters distance arithmetic. Face-api provides no scalp
landmarks, so the upper arc is explicitly derived from the detector box.

### 9.4 The noise floor

`spread` above **is** the noise floor: how far the descriptor moved during a
baseline window intended to hold face, pose, and light steady. It is the tool's
only empirical reference line, and the most useful number it produces.

Without it you cannot tell whether a small movement in the descriptor exceeds
the variability of the baseline window. With it, a reading of 0.09 against a
measured floor of 0.06 is weak evidence, while a reading of 0.55 against the
same floor is a much larger model-local effect. The relative-condition gate in
§9.2 removes obvious head and light changes; neither mechanism can guarantee
that all nuisance variation has been removed.

If spread exceeds 0.20 (**UNTUNED**) the batch is rejected outright: the subject
moved or the lighting flickered, and accepting it would set a floor so high that
real results vanish beneath it.

### 9.5 Sustained spike detection

Capture fires on a reading that **holds**, not an instantaneous value. Two
triggers:

- **Personal best**: a new session maximum by ≥ 0.05, held for ≥ 1.5s
- **Threshold crossing**: the first time the run clears 0.60, held for ≥ 1.5s

Plus a manual shutter, because no heuristic catches everything.

Automatic spike capture is active only while the session is in its ready state.
During an operator-declared application interval and its measurement window,
the explicit step snapshot is the record of interest.

The frame written to disk is the **sharpest** observed across the sustain window,
not whichever frame tripped the trigger. Rationale: a single frame at 0.50 is as
likely to be motion blur as a result, and "the makeup is working" should not rest
on a photograph of someone moving. A run that dips back below its starting value
aborts.

### 9.6 What the equalizer shows

The right panel shows **per-dimension absolute delta**: `|baseline[i] − current[i]|`
for each of the 128 components, scaled against `MAX_DELTA = 0.15`.

**This is a debugging aid, not a measurement.** Individual dimensions of a
learned embedding have no assigned semantic meaning. Dimension 47 is not "nose
width." The panel is useful for seeing *whether* change is concentrated or
diffuse across the embedding, and for nothing else. Work such as
[Feature Representation in Deep Metric Embeddings](https://arxiv.org/abs/2102.03176)
(which uses this exact dlib model) examines what structure embeddings do carry;
per-dimension interpretation is not part of it.

### 9.7 Declared makeup steps and the ranked radial distribution

After setting a baseline, the operator controls the experiment semantics:

1. **Start makeup step** marks the beginning of an application interval.
2. **Measure this step** begins an eight-sample, minimum-three-second window.
3. The tool stores the window medoid as the step snapshot, reports its distance
   and temporal spread, and keeps the sharpest accepted thumbnail.

The timeline changes background during application and measurement and draws a
labelled event line for each transition. With a local video, events also include
the media time, so pause, seek and replay can be used as an experiment fixture.
The controls resume a paused local video before beginning a marked interval.
Event rows mask the vertical threshold/noise references behind their labels;
application boundaries are orange and measurement boundaries green, rather
than borrowing the yellow reserved for the 0.60 threshold.

The radial plot uses all 128 absolute component deltas, sorts them by magnitude,
splits them into 16 consecutive groups of eight and plots the root-mean-square
of each group. The live valid reading is an outline; the most recent measured
step is a filled shape. This is easier to read than 128 spokes, but ranking
deliberately discards coordinate identity: the plot describes the distribution
of change, not where that change occurred. It freezes on the last valid frame
whenever the current frame is excluded.

---

## 10. Every threshold, and where it came from

### Cited

| Constant | Value | Source |
|---|---|---|
| `MATCH_THRESHOLD` | 0.60 | dlib's [structured metric loss target radius](https://blog.dlib.net/2017/02/high-quality-face-recognition-with-deep.html) and the [documented LFW operating point](https://github.com/davisking/dlib/blob/master/python_examples/face_recognition.py) |

That is the complete list. One number.

### Measured

| Quantity | Source |
|---|---|
| Baseline noise floor | Medoid spread over 5 gated frames, this session |
| Step temporal spread | Medoid spread over 8 comparable frames, this step |

### Chosen

| Constant | Value | Reasoning |
|---|---|---|
| `GRAPH_MAX_DISTANCE` | 1.25 | Headroom above 0.60. Large model-local distances can exceed 1.0; a ceiling at 1.0 would hide their magnitude. |
| `GRAPH_WINDOW_SECONDS` | 60 | Long enough for a makeup pass, short enough to read. |
| `SAMPLES_PER_SECOND` | 3 | Smoothing vs. responsiveness. |
| `NO_FACE_DEBOUNCE_MS` | 1500 | Delays the paused UI state so a blink does not disable controls; timeline no-face marking is immediate. |
| `STATUS_MIN_DWELL_MS` | 1500 | Keeps quality instructions readable while the raw timeline continues at full cadence. |
| Timeline quality backgrounds | 3 states | Preserve raw pose/framing, lighting and no-face context without admitting it to measurements. |
| `BASELINE_TARGET_SAMPLES` | 5 | A compact temporal medoid rather than one frame, with lower capture burden. |
| `BASELINE_MIN_MS` | 2000 | Distributes accepted frames across the interval. |
| `BASELINE_TIMEOUT_MS` | 30000 | Leaves time to respond to a diagnostic rejection. |
| `MEASUREMENT_TARGET_SAMPLES` | 8 | Uses the same temporal aggregation for every declared step. |
| `MEASUREMENT_MIN_MS` | 3000 | Distributes accepted comparison frames across the interval. |
| `MEASUREMENT_TIMEOUT_MS` | 30000 | Fails explicitly when comparable frames cannot be collected. |
| `SPIKE_SUSTAIN_MS` | 1500 | ~4–5 samples at 3 Hz. |
| `SPIKE_BEST_MARGIN` | 0.05 | Avoids capturing noise as a personal best. |
| `SPIKE_COOLDOWN_MS` | 8000 | Keeps the gallery to keepers. |
| `minScore` | 0.85 | Detector floor is 0.5; used only for strict baseline capture. |
| `minBoxWidthRatio` | 0.25 | Recognition net input is 150×150. |
| `maxRollDegrees` | 8 | Tight enough to matter, loose enough to achieve. |
| `maxYawOffset` | 0.12 | As above; proxy metric, see §9.2. |
| `maxRollDelta` | 4° | Relative 2D comparison tolerance; frames beyond it are omitted. |
| `maxYawDelta` | 0.055 | Relative yaw-proxy tolerance. |
| `maxScaleDelta` | 0.08 | Relative face-box width tolerance. |
| `maxCenterDelta` | 0.065 | Relative horizontal or vertical centre tolerance. |
| `maxLumaDelta` | 0.10 | Relative ambient-luminance tolerance, measured outside the face box. |
| `MAX_DELTA` | 0.15 | Equalizer and radial scaling only. Purely visual. |

### Untuned: needs empirical calibration

| Constant | Value | Why it needs work |
|---|---|---|
| `BASELINE_MAX_SPREAD` / `MEASUREMENT_MAX_SPREAD` | 0.20 | Should be derived from observed spread distributions across cameras and subjects. Currently a guess. |
| `minLuma` / `maxLuma` | 0.18 / 0.86 | Should be validated across skin tones specifically, given §6.2. A gate tuned on light skin would systematically reject dark-skinned subjects and is exactly the failure NIST documents. **This is the highest-priority calibration task in the codebase.** |
| Relative condition tolerances | values above | Need repeated-camera and repeated-subject studies. They reduce confounds but are not calibrated guarantees of pose or illumination invariance. |

### Inherited from `config.js`

| Constant | Value |
|---|---|
| `inputSize` | 416 |
| `scoreThreshold` | 0.5 |

---

## 11. Adversarial makeup: the research

### 11.1 CV Dazzle (2010) and its own obsolescence

[**CV Dazzle**](https://adam.harvey.studio/cvdazzle), Adam Harvey. Named after
[dazzle camouflage](https://en.wikipedia.org/wiki/Dazzle_camouflage): WWI ship
patterns that confused rangefinders rather than concealing the ship. It uses
makeup, hair, and styling to break the light/dark relationships expected by the
detector it targeted. It is an early documented example of appearance-based
camouflage tested against a computer-vision system.

**Read Harvey's own current statement on the project before using any of it.**
The original 2010–2013 looks targeted the
[Viola-Jones](https://www.cs.cmu.edu/~efros/courses/LBMV07/Papers/viola-cvpr-01.pdf)
Haar cascade detector. Harvey's site states plainly that Viola-Jones was
deprecated in security use around 2013–2016, and that **the original patterns are
no longer active looks.** He developed new looks in 2020 aimed at CNN-based
recognition.

Harvey's revision makes the method's expiry date explicit. The lesson
generalises: **anti-surveillance techniques have expiry dates.** A look that
worked against one detector generation says nothing about the next.

Note also the *category* shift. CV Dazzle originally targeted **detection**:
being found at all. This tool measures **recognition**: being identified once
found. Disrupting a detector and moving an embedding are different problems with
different countermeasures. If the detector loses your face entirely, this tool
records a no-face interval with no distance line, not a low distance.

Further reading:
[Harvey's DIS Magazine writeup](https://dismagazine.com/dystopia/evolved-lifestyles/8115/anti-surveillance-how-to-hide-from-machines/),
[2011 Artblog interview](https://www.theartblog.org/2020/01/adam-harvey-and-the-anti-face/),
[Wikipedia overview](https://en.wikipedia.org/wiki/Computer_vision_dazzle).

### 11.2 Accessorize to a Crime (2016)

[**Accessorize to a Crime: Real and Stealthy Attacks on State-of-the-Art Face Recognition**](https://dl.acm.org/doi/10.1145/2976749.2978392),
Sharif, Bhagavatula, Bauer & Reiter, ACM CCS 2016.
[PDF](https://www.cs.cmu.edu/~sbhagava/papers/face-rec-ccs16.pdf) ·
[author page](https://mahmoods01.github.io/publication/ccs16-adv-ml/)

The paper that established physically-realisable adversarial attacks on face
recognition. Printed eyeglass frames that let the wearer evade recognition **or
impersonate a specific different person**. Primarily white-box, with black-box
and detection-evasion demonstrations.

The impersonation result is the striking one: the attack is not just "make me
unrecognisable" but "make me register as this specific other individual."

Extended in [A General Framework for Adversarial Examples with Objectives](https://dl.acm.org/doi/10.1145/3317611)
(ACM TOPS, 2019).

### 11.3 The physical attack lineage

- [**AdvHat**](https://arxiv.org/abs/1908.08705) (Komkov & Petiushko, ICPR 2020)
  describes a printed sticker on a hat targeting ArcFace.
- [**Adversarial Mask**](https://arxiv.org/abs/2111.10759): universal patterned
  face mask.
- [**Towards Effective Adversarial Textured 3D Meshes**](https://arxiv.org/abs/2303.15818)
  describes 3D-aware physical attacks.
- [**Imperceptible Physical Attack via LED Illumination Modulation**](https://arxiv.org/abs/2307.13294)
  targets the *illumination* rather than the face. It was evaluated against dlib,
  FaceNet and ArcFace, and useful for seeing how the three compare.

### 11.4 Makeup-specific attacks: the directly relevant work

- [**Adv-Makeup: A New Imperceptible and Transferable Attack on Face Recognition**](https://arxiv.org/abs/2105.03162)
  (Yin et al., IJCAI 2021):
  [proceedings](https://www.ijcai.org/proceedings/2021/173) ·
  [code](https://github.com/TencentYoutuResearch/Adv-Makeup).
  Synthesises adversarial eye shadow over the orbital region. Explicitly targets
  **imperceptibility** (looks like makeup, not like an attack) and
  **transferability** (works black-box), using meta-learning across multiple
  surrogate models. Includes a physical-world case study against two commercial
  platforms. **The closest published analogue to what this project is doing.**
- [**AMT-GAN: Protecting Facial Privacy via Style-robust Makeup Transfer**](https://arxiv.org/abs/2203.03121)
  (Hu et al., CVPR 2022): adversarial identity masks through makeup transfer.
- [Generating Adversarial Examples by Makeup Attacks on Face Recognition](https://ieeexplore.ieee.org/document/8803269)
  (Zhu, Lu & Chiang, ICIP 2019): earlier work in the same direction.
- [Adv-Attribute: Inconspicuous and Transferable Adversarial Attack](https://arxiv.org/abs/2210.06871)
  uses attribute-space rather than pixel-space perturbation.

**Note the methodological gap.** These papers optimise perturbations with
gradient access to a model. Physical makeup applied by hand is a much coarser
instrument, and none of these results should be read as predicting what a human
with brushes can achieve. That gap is precisely the space this tool is meant to
explore empirically.

### 11.5 Digital cloaking: a different threat model

- [**Fawkes: Protecting Privacy against Unauthorized Deep Learning Models**](https://www.usenix.org/conference/usenixsecurity20/presentation/shan)
  (Shan et al., USENIX Security 2020):
  [PDF](https://people.cs.uchicago.edu/~ravenben/publications/pdf/fawkes-usenix20.pdf) ·
  [code](https://github.com/Shawn-Shan/fawkes) ·
  [project site](https://sandlab.cs.uchicago.edu/fawkes/).
  Perturbs images *before upload* so that a scraper training on them builds a
  model that misidentifies the real you. The authors reported 95%+ protection,
  and 80%+ even when clean images leak, under the paper's test conditions.
- [**LowKey**](https://arxiv.org/abs/2101.07922) (Cherepanova et al., ICLR 2021)
  pursues a similar goal, using an ensemble for better black-box transfer and a perceptual
  metric in the loss.

**Critically, this is poisoning, not evasion.** Fawkes aims to alter what a
scraped training set teaches a model. It does not address a person walking past
a camera. Independent work has also
questioned its practical robustness: see
[Oriole](https://arxiv.org/abs/2102.11502), which reports the perturbations
becoming plainly visible on high-resolution images.

### 11.6 The survey to read first

[**SoK: Anti-Facial Recognition Technology**](https://arxiv.org/abs/2112.04558),
Wenger, Shan, Zheng & Zhao, systematises the whole space: evasion vs.
poisoning, digital vs. physical, detection vs. recognition. If you read one
paper from this list, read this one.

Also useful:
[Privacy-Enhancing Face Biometrics: A Comprehensive Survey](https://ieeexplore.ieee.org/document/9481149)
(Meden et al., IEEE TIFS 2021).

---

## 12. Transferability: the central caveat

**A high distance in this tool does not mean you are unrecognisable.**

The entire adversarial ML literature converges on this: attacks optimised against
one model **transfer poorly** to others. Transferability is treated as the core
open challenge in
[Adv-Makeup](https://arxiv.org/abs/2105.03162), which needed a dedicated
meta-learning strategy across multiple surrogate models just to get black-box
success, even with full gradient access during optimisation.

The model in this tool is:

- **From 2017**, never retrained
- **Trained with a different loss** (structured metric loss) than modern systems
  (ArcFace's angular margin, AdaFace's quality-adaptive margin)
- **Read with a different metric** (Euclidean, not cosine)
- **Small**: 29 conv layers, halved filters
- **Not** what any commercial system uses

Deployed systems from vendors such as Clearview, Idemia, NEC, Microsoft, and
Amazon use proprietary models, typically larger, trained on far more data, and often
ensembled. NIST's FRVT programme
([ongoing results](https://pages.nist.gov/frvt/html/frvt11.html)) evaluates
hundreds of them; the open-source models in this class sit well below the
commercial frontier. NISTIR 8280 itself notes that some open-source algorithms
included in prior comparative work are inaccurate enough not to represent
commercial deployment.

So: **moving 0.9 in dlib's space is evidence that you moved something in dlib's
space.** It is weak evidence about ArcFace, and near-zero evidence about a
production surveillance stack.

### What would strengthen a claim

If the goal is a defensible finding rather than a local signal, the standard
approach is an **ensemble** of independent recognisers, reporting the distance in
each. A technique that moves all of them is meaningfully more likely to
generalise than one that moves a single 2017 model. Candidates:

- [ArcFace / InsightFace](https://github.com/deepinsight/insightface)
- [FaceNet (facenet-pytorch)](https://github.com/timesler/facenet-pytorch)
- [AdaFace](https://github.com/mk-minchul/AdaFace)
- [DeepFace](https://github.com/serengilx/deepface) as a wrapper over several

This would be a substantial architectural change, with different preprocessing,
metrics, and thresholds per model. It is a possible next step for the project,
not something the current page does.

---

## 13. What this tool can and cannot tell you

### It can

- Tell you whether a makeup pass moved dlib's embedding **at all**, above your
  own measured noise floor
- Let you **compare two makeup variants** on the same face, same session, same
  camera. This is the comparison it is built for
- Mark operator-declared application intervals and aggregate each finished step
  over time instead of reporting only one clicked frame
- Show whether component changes are diffuse or concentrated, with a 128-row
  equalizer and a 16-band ranked RMS distribution using all 128 deltas
- Give you a **watermarked record** carrying the project mark, distance,
  threshold and verdict; its timestamp remains in the stored metadata and
  exported filename, while local-video events also retain their media time
- Do all of this **offline, on-device**, with no face leaving the machine

### It cannot

- Tell you whether any deployed system would recognise you
- Tell you whether the technique transfers to another model
- Prove invariance to pose or lighting. It omits frames with sufficiently large
  2D pose, framing or ambient-light differences; it does not correct them and
  does not estimate pitch
- Map a descriptor dimension or ranked radial band to a facial feature or makeup line
- Tell you anything about **detection** evasion: if the detector loses you, the
  tool records a no-face interval, not a success
- Establish that a technique works for anyone other than you
- Correct for demographic differentials in the underlying embedding

### Methodological hygiene, if you want the results to mean something

1. **Re-baseline whenever source, lighting or camera setup changes.** A baseline
   captured under different conditions is a different experiment.
2. **Report the noise floor with every result.** A distance without its noise
   floor is uninterpretable.
3. **Use the declared-step controls.** Mark the start of application, then
   measure only after returning to the baseline pose and lighting.
4. **Compare within a session.** Cross-session comparison confounds makeup with
   lighting, camera position and time of day.
5. **Repeat the step.** One accepted temporal window is stronger than a peak,
   but it is still one small sample. Report distance, baseline noise floor and
   step temporal spread together.
6. **Test pose separately.** Deliberately vary yaw, roll and pitch in a separate
   protocol rather than treating excluded frames as proof of invariance.

---

## 14. Privacy and data handling

The tool keeps the following local records. None is transmitted.

| Data | Store | Deletion |
|---|---|---|
| Camera baseline descriptor + noise floor + averaged conditions + median 2D guide + timestamp | `localStorage` (`gstmxx.realtime.baseline`, format 3) | "Source → Reset baseline": removes the key |
| Local-video baseline | Memory for the current page session | Change source, delete baseline, or close the page |
| Spike, manual and declared-step captures (watermarked JPEGs) | IndexedDB (`gstmxx-realtime` / `captures`) | "Delete all", or per-capture in the viewer |
| View settings | `localStorage` (`gstmxx.realtime.settings`) | Browser storage clear |

The selected video is exposed to the page through a temporary browser object
URL. The file and that URL are not stored in IndexedDB or `localStorage`.

**Why IndexedDB for captures.** `localStorage` caps near 5MB per origin, is
shared with everything else the site stores, and inflates binary by ~33% through
base64. Photographs belong in a store that takes Blobs natively.

**A 128-d descriptor is biometric data.** Under
[GDPR Article 9](https://eur-lex.europa.eu/eli/reg/2016/679/oj), biometric data
processed for unique identification is a special category. The page does not
send it to a remote processor. Local processing does not make the data
insignificant, which is why deletion is a real removal and not a flag.

**Deleting the baseline does not clear the gallery.** Deliberate: the gallery is
expected to outlive a re-baseline. Stated in the UI rather than left to be
inferred.

No third-party requests. All models are vendored under `/lab-js/vendor`; fonts
are self-hosted. The page functions with the network unplugged.

---

## 15. Regulatory context

Relevant because it explains what this tooling is a response to.

### EU AI Act

[Regulation (EU) 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
applies in stages. The prohibited practices have applied since **2 February
2025**. The enforcement powers of the AI Office and national competent
authorities apply from **2 August 2026**. Infringements involving prohibited
practices can attract penalties of up to €35 million or 7% of worldwide annual
turnover. The European Commission maintains an
[application timeline](https://digital-strategy.ec.europa.eu/en/policies/enforcement-ai-act)
and [guidance on biometric identification](https://digital-strategy.ec.europa.eu/en/faqs/navigating-ai-act).

Provisions bearing on facial recognition:

- **Art. 5(1)(e)**: bans creating or expanding facial recognition databases
  through **untargeted scraping** of internet images or CCTV footage. "Untargeted"
  is the operative word. See the Future of Privacy Forum's analysis:
  [Red Lines under the EU AI Act](https://fpf.org/blog/red-lines-under-the-eu-ai-act-understanding-the-ban-of-the-untargeted-scraping-of-facial-images-and-facial-recognition-databases/).
- **Art. 5(1)(g)**: bans biometric categorisation inferring race, political
  opinions, trade union membership, religious belief, sex life or sexual
  orientation.
- **Art. 5(1)(h)**: bans **real-time** remote biometric identification in
  publicly accessible spaces for law enforcement, with narrow exceptions
  requiring prior judicial or independent administrative authorisation.

**The gap worth knowing.** The prohibition targets *real-time* RBI.
**Post-remote** biometric identification, which runs recognition over previously
collected material, is not prohibited. The Commission states that its use for a
person under investigation requires prior judicial or independent
administrative authorisation, plus notification to the relevant authorities.
It is regulated, but not banned.

*These provisions are recent and interpretation is still developing; verify
against the current consolidated text and any Commission guidelines before
relying on this summary.*

### GDPR

[Article 9](https://eur-lex.europa.eu/eli/reg/2016/679/oj): biometric data for unique
identification is a special category requiring explicit consent or another
Art. 9 condition. Between 2022 and 2024 several EU data protection authorities
fined Clearview AI over facial recognition practices; those decisions are the
enforcement backdrop to Art. 5(1)(e).

### Standards

- [ISO/IEC 19795](https://www.iso.org/standard/73515.html): biometric performance
  testing and reporting. Part 10 addresses quantifying performance variation
  across demographic groups.
- [NIST FRVT](https://pages.nist.gov/frvt/html/frvt11.html): the ongoing
  independent evaluation programme.

---

## 16. Vendored assets and provenance

Full inventory in `lab-js/vendor/README.md`; refresh via
`lab-js/vendor/fetch-sources.sh`.

| Asset | Upstream | Version |
|---|---|---|
| `face-api.js` | [@vladmandic/face-api](https://github.com/vladmandic/face-api) | floating: no pinned version in the source URL |
| Model shards | [justadudewhohacks/face-api.js-models](https://github.com/justadudewhohacks/face-api.js-models) | `@master` |
| Original model weights | [davisking/dlib-models](https://github.com/davisking/dlib-models) | `dlib_face_recognition_resnet_model_v1` |

**Two provenance weaknesses worth fixing.** The face-api bundle URL carries no
version, and the model shards track `@master`. Both mean a re-run of
`fetch-sources.sh` could silently change the model, and therefore every
measurement, with no record of what changed. For research output, pin both to
commit SHAs and record the SHA alongside results.

---

## 17. Reading list

### Start here

1. [SoK: Anti-Facial Recognition Technology](https://arxiv.org/abs/2112.04558): the map of the territory
2. [High Quality Face Recognition with Deep Metric Learning](https://blog.dlib.net/2017/02/high-quality-face-recognition-with-deep.html): the model in this tool, from its author
3. [NISTIR 8280: FRVT Part 3: Demographic Effects](https://doi.org/10.6028/NIST.IR.8280): the evidence base for bias
4. [CV Dazzle](https://adam.harvey.studio/cvdazzle): including its own obsolescence notice

### Foundations

- [FaceNet: A Unified Embedding for Face Recognition and Clustering](https://arxiv.org/abs/1503.03832): Schroff et al., CVPR 2015
- [Deep Residual Learning for Image Recognition](https://arxiv.org/abs/1512.03385): He et al., 2015
- [ArcFace: Additive Angular Margin Loss](https://arxiv.org/abs/1801.07698): Deng et al., CVPR 2019
- [Rapid Object Detection using a Boosted Cascade of Simple Features](https://www.cs.cmu.edu/~efros/courses/LBMV07/Papers/viola-cvpr-01.pdf): Viola & Jones, 2001
- [Deep Face Recognition: A Survey](https://arxiv.org/abs/1804.06655): Wang & Deng

### Benchmarks and their critique

- [Labeled Faces in the Wild](https://vis-www.cs.umass.edu/lfw/): the original
- [Algorithmic Fairness Datasets: the Story so Far](https://arxiv.org/abs/2202.01711): Fabris et al.
- [FairFace](https://github.com/joojs/fairface): a demographically balanced alternative
- [Racial Faces in the Wild](https://github.com/whdeng/RFW): Wang et al.

### Bias and fairness

- [Gender Shades](https://proceedings.mlr.press/v81/buolamwini18a.html): Buolamwini & Gebru (gender *classification*, not verification)
- [NISTIR 8429: FRVT Part 8](https://pages.nist.gov/frvt/reports/demographics/nistir_8429.pdf)
- [Characterizing the Variability in Face Recognition Accuracy Relative to Race](https://arxiv.org/abs/1904.07325)
- [Analysis of Gender Inequality In Face Recognition Accuracy](https://arxiv.org/abs/2002.00065)
- [Exploring Causes of Demographic Variations In Face Recognition Accuracy](https://arxiv.org/abs/2304.07175)

### Attacks

- [Accessorize to a Crime](https://www.cs.cmu.edu/~sbhagava/papers/face-rec-ccs16.pdf): Sharif et al., CCS 2016
- [Adv-Makeup](https://arxiv.org/abs/2105.03162): Yin et al., IJCAI 2021
- [AMT-GAN](https://arxiv.org/abs/2203.03121): Hu et al., CVPR 2022
- [AdvHat](https://arxiv.org/abs/1908.08705): Komkov & Petiushko
- [Fawkes](https://www.usenix.org/conference/usenixsecurity20/presentation/shan): Shan et al., USENIX Sec 2020
- [LowKey](https://arxiv.org/abs/2101.07922): Cherepanova et al., ICLR 2021
- [Intriguing Properties of Neural Networks](https://arxiv.org/abs/1312.6199): Szegedy et al., where adversarial examples begin

### Policy

- [EU AI Act, official text](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
- [European Commission: navigating the AI Act](https://digital-strategy.ec.europa.eu/en/faqs/navigating-ai-act)
- [FPF: Red Lines under the EU AI Act](https://fpf.org/blog/red-lines-under-the-eu-ai-act-understanding-the-ban-of-the-untargeted-scraping-of-facial-images-and-facial-recognition-databases/)
- [GDPR, official text](https://eur-lex.europa.eu/eli/reg/2016/679/oj)

---

## 18. Glossary

**Alignment**: Warping a detected face to a canonical pose before embedding.

**Descriptor / embedding / template**: The vector representing a face. Here, 128 floats.

**Detection vs. recognition**: Finding that a face exists vs. determining whose it is. Different models, different attacks.

**Euclidean distance**: Straight-line distance in vector space. The metric this model is calibrated for.

**Genuine / impostor distribution**: Distance distributions for same-person and different-person pairs. Their overlap determines error rates.

**Medoid**: The member of a set with smallest summed distance to the others. Unlike the mean, always a real member.

**Noise floor**: Descriptor movement observed during a baseline window intended to hold face, pose, and light steady. Measured per session.

**Threshold**: The distance below which two descriptors are declared a match. A dial trading false accepts against false rejects, not a fact.

**Transferability**: Whether an attack developed against one model works against another. Generally poor. The reason this tool's readings are local signal rather than evidence.

**White-box / black-box**: Whether the attacker has access to model internals and gradients. This tool is white-box against dlib and tells you nothing about black-box performance.

---

*Sources current as of October 2026. The EU AI Act sections describe recent and
evolving provisions: verify against the consolidated text before relying on
them. If you re-run `fetch-sources.sh`, record the resulting commit SHAs: the
upstream model references are unpinned, and an unnoticed model change invalidates
every prior measurement.*
