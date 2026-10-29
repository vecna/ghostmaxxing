# Let the machine search your face: random Ghostyles, tested on every angle of your head

*A new Ghostmaxxing tool turns one short video of your face into a test bench. It draws random camouflage, paints it on every pose you recorded and measures how far an open face-recognition model moves away from you. The useful part is not the one pattern that works today. It is that anyone can run the same search on their own face and share what they find.*

<!--
IMAGE COMMANDS
Every figure below is produced from the repository. Run these first,
from the ghostmaxxing root, then move the files under images/articles/fuzz/
(or wherever the blog keeps its assets) and fix the paths.

  # 1. The atlas and the first trials (about 10 minutes on a laptop CPU)
  node scripts-dev/ghostyle-fuzz.cjs atlas  --video tests/fixtures/my-moving-face.mp4
  node scripts-dev/ghostyle-fuzz.cjs trial  --atlas scratch/fuzz/my-moving-face/pose-atlas.json \
       --recipe scripts-dev/ghostyle-fuzz/recipes/three-bands.json --trials 12 --seed 2246338699 --top 3
  node scripts-dev/ghostyle-fuzz.cjs report --atlas scratch/fuzz/my-moving-face/pose-atlas.json

  # Figures 1, 3, 4 are written by those commands:
  #   scratch/fuzz/my-moving-face/anchor.png
  #   scratch/fuzz/my-moving-face/skin-mask.jpg
  #   scratch/fuzz/my-moving-face/runs/three-bands-1d7a652d-2246338702/anchor-overlay.jpg
  #   scratch/fuzz/my-moving-face/runs/three-bands-1d7a652d-2246338702/poses-overlay.jpg

  # 2. Figure 2: the lab's own landmark view on the anchor frame
  node scripts-dev/lab-capture.cjs render --baseline scratch/fuzz/my-moving-face/anchor.png \
       --layers landmarks --output scratch/fuzz/fig2-landmarks.jpg

  # 3. Figures 5 and 6: the report
  npx playwright screenshot --viewport-size=1400,1000 --full-page \
       file://$PWD/scratch/fuzz/my-moving-face/report.html scratch/fuzz/fig5-report.png
  # Crop the "Two criteria" and "Trial" panels from that PNG for figure 5,
  # and the "Fuzz matrix" panel for figure 6.

  # 4. Figure 7: the generated Ghostyle running in the real lab
  cp scratch/fuzz/my-moving-face/runs/three-bands-1d7a652d-2246338702/ghostyle-fuzz-2246338702.js ghostyles/fuzz-2246338702.js
  #   add {"id": "fuzz-2246338702", "url": "ghostyles/fuzz-2246338702.js"} to ghostyles.json, then:
  node scripts-dev/lab-capture.cjs render --baseline scratch/fuzz/my-moving-face/anchor.png \
       --ghostyle fuzz-2246338702 --output scratch/fuzz/fig7-lab.jpg
-->

## What this is, and what it is not

Ghostmaxxing is a public lab for testing face-recognition camouflage in the browser. A **Ghostyle** is a modular AR intervention: a small JavaScript file that paints something on a face in real time, so that an idea about camouflage becomes a thing you can apply, inspect, test and pass on.

Until now, Ghostyles were made by hand. Someone had an intuition (a dark diagonal across the nose bridge, a bright block over one eye), drew it, and looked at the lab's readout. That is slow, and it tests one pose at a time: the face that looks at the webcam. Face recognition in public space does not meet you frontally. It meets you from above, from the side, mid-turn.

`ghostyle-fuzz` is the new tool. It takes a video of a person turning their head, keeps one clean reference of the face at every angle it finds, then generates random Ghostyles from a recipe and measures each one against every angle. Thousands of trials can run against the same video. The result is a ranked list of candidates, each with its conditions attached, and a Ghostyle file for each one worth keeping.

Two limits come first, because they shape everything below.

- Every number is produced by one open model, face-api's 128-dimensional descriptor, running in a browser with the lab's own vendored weights. It is the same model the lab uses. It is not the model in any camera on any street. Whether a result transfers to a deployed system is an open question, and this tool does not answer it.
- The reference is your own face in your own video. A pattern that escapes recognition against yourself under your lighting says nothing yet about another face or another room. That is exactly why the test is designed to be repeated by many people.

Within those limits the tool does one thing well: it makes the search systematic and the result reproducible.

## The idea in one paragraph

Face recognition reads a face as geometry and texture and turns it into a vector. Two vectors closer than a threshold are called the same person. face-api, like dlib before it, uses a Euclidean distance with 0.6 as the published default threshold. A Ghostyle succeeds, in this narrow sense, when the painted face lands farther than 0.6 from every clean reading of the same face, or when the detector finds no face at all. The fuzzer does not try to be clever about where to paint. It draws random strokes on the skin, in colours chosen for contrast, and lets the model say which draws moved the vector.

## Step 1: record a video, get a pose atlas

Record 20 to 40 seconds of yourself. Start by looking straight at the camera for two seconds, then turn slowly: left, right, up, down, the diagonals. Even light helps. The video never leaves your machine; the tool runs locally, in a headless browser, and writes everything into a scratch folder.

```
node scripts-dev/ghostyle-fuzz.cjs atlas --video my-face.mp4
```

The tool scans the video with MediaPipe, which tracks 478 points on the face and estimates the head's rotation in degrees. It divides the rotations into 10° cells (yaw by pitch), picks the sharpest frame in each cell, and asks face-api to describe it. Each clean description is an **imprint**: the fingerprint of your face at that angle. The most frontal imprint becomes the **anchor**. A cell where MediaPipe sees a face but face-api cannot describe it (typically beyond 40° of yaw) is recorded as unmeasurable rather than silently dropped.

![Figure 1. Left: the anchor frame, the most frontal imprint. Right: the pixels used to measure the skin colour, tinted green. The lower face is excluded because beard and shadow are not skin.](images/articles/fuzz/fig1-anchor-skin.jpg)

The atlas also measures your skin. It takes the face oval above the nose base, removes eyes and brows, and computes the median colour in CIELAB, a colour space where the first axis is perceived lightness. Median, not mean, because a forehead highlight and a shadow under the brow are both outliers and a mean follows them. On the test video the beard alone moved the median lightness by seven points before it was excluded; the mask image lets you check what was measured.

On the 32-second test video shipped with the repository, the atlas found 14 imprints spanning yaw −20° to +17° and pitch −25° to +9°, with a 3.6-second gap where the face left the frame. The atlas took two minutes on a laptop CPU, most of it face-api.

![Figure 2. The same anchor frame as the lab draws it: the face box and the 68-point scaffold face-api fits before computing the descriptor.](images/articles/fuzz/fig2-landmarks.jpg)

## Step 2: write a recipe, run trials

A **recipe** describes a family of Ghostyles without fixing one. This is the one in the repository:

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

Three straight bands, 5 cm long and 2 cm wide, at 80% opacity. Centimetres are real: the tool measures the iris in the anchor frame, and a human iris is about 11.7 mm across in nearly everyone, so pixels per centimetre follow. The palette is drawn from the 240 colours of the xterm-256 cube, keeping the quarter with the highest lightness contrast against your skin and requiring the four chosen colours to differ from each other. On light skin that produces mostly dark colours; on dark skin mostly light ones.

```
node scripts-dev/ghostyle-fuzz.cjs trial --atlas scratch/fuzz/my-face/pose-atlas.json \
     --recipe scripts-dev/ghostyle-fuzz/recipes/three-bands.json --trials 50
```

Each trial has a seed. The seed picks the palette, then for each band a random point among the 468 mesh points of the face, a random angle and a random colour. The bands are drawn on the anchor frame and baked into the canonical UV texture of the face mesh, the same mechanism the lab uses to paint Ghostyles that follow the skin. Then the trial is applied to every imprint, by warping the texture through that imprint's mesh, and face-api describes the painted face.

![Figure 3. The best of twelve trials, seed 2246338702, on the anchor frame: three bands drawn at random on the mesh.](images/articles/fuzz/fig3-anchor-overlay.jpg)

![Figure 4. The same trial on all 14 imprints. A band drawn straight on the frontal face bends with the skin when the head turns. Green labels: face-api found no face or placed it beyond the threshold. Red: still recognised.](images/articles/fuzz/fig4-poses-overlay.jpg)

The seed is the whole identity of a trial. `--seed 2246338702 --trials 1` reproduces it bit for bit, on your atlas, with the same recipe. If you leave the seed out, a random one is drawn and printed. Every trial is appended to a log; nothing is overwritten, so you can keep adding runs for days.

## Step 3: read the report

```
node scripts-dev/ghostyle-fuzz.cjs report --atlas scratch/fuzz/my-face/pose-atlas.json
```

For each imprint the trial records two distances. `dPair` is the distance between the painted frame and the same clean frame. `dAtlas` is the distance to the nearest of all your clean imprints, which is the stricter number: a system that has seen you at several angles will match the closest one. An imprint **escapes** when the face is lost or `dAtlas` is at or above 0.6.

Two scores summarise a trial, and they answer different questions. The **escape rate** is the share of imprints that escape: how much of the head turn the pattern covers. The **worst case** is the smallest `dAtlas` over all imprints: a camera recording a video needs only one recognised frame, so this is the honest number. The report does not pick one. It plots both and marks the trials no other trial beats on both, the Pareto front.

![Figure 5. The report: every trial placed by escape rate and worst case, with the threshold line; and the evasion profile of one trial along the video's timeline, with the presence gap hatched.](images/articles/fuzz/fig5-report.png)

Below the scatter, each trial has an **evasion profile** (distance against time, one tick per imprint, with the band of natural drift between your own poses drawn in grey) and a **pose map** (yaw by pitch, coloured by distance). The pose map is where a pattern's weakness shows: a trial that escapes while the head is down but not while it is level is visible at a glance.

![Figure 6. The fuzz matrix: one row per trial, one column per imprint, sorted by yaw. Dark columns are poses that no trial in this run defeated.](images/articles/fuzz/fig6-matrix.png)

Twelve trials on the test video gave this, in two runs of about six minutes each on a CPU: escape rates of 0%, 0%, 7%, 7%, 7%, 29%, 29%, 29%, 36%, 64%, 64% and 86%. The 86% trial lost the face entirely on 12 of 14 poses. Its worst case was 0.45: on two near-frontal poses it was still recognised, below the threshold. By the strict criterion, no trial in this small run defeated face-api on this face. By the lenient one, random bands already do something in one draw out of twelve.

## Step 4: take the Ghostyle to the lab, and share it

Each trial worth keeping is written out as a real Ghostyle plugin, a `paintUV` module with the polygons in UV coordinates and a header the lab's validator accepts. The file carries its provenance: the recipe, the palette, the seed, the scores, and the command that reproduces it.

![Figure 7. The generated Ghostyle loaded in the Ghostmaxxing lab, drawn by the lab's own renderer on the same frame. The pixels match the fuzzer's.](images/articles/fuzz/fig7-lab.jpg)

This is the part that matters for distribution. A Ghostyle from the fuzzer is a research object with its conditions attached: one person, one video, one model, one threshold, these scores. It can go to the community gallery, where a human moderator reviews it before publication, and from there to the project's Fediverse accounts. Someone else can load it in their lab, or better, run the fuzzer with the same recipe against their own face and report whether the family of patterns holds up or collapses. A pattern that escapes on ten different faces under ten different lights is a different kind of claim from a pattern that escapes on one.

The recipe is the thing to share alongside the file. A single Ghostyle is a sample; the recipe is the hypothesis.

## What the numbers say so far

The following figures come from this repository's own fixtures and the runs above. They are small samples, measured on one model, and they are offered as a starting point for the question the tool exists to ask.

**How different are faces, to this model?** The repository ships ten synthetic clean faces used for testing. The descriptor distance between any two of them ranges from 0.59 to 1.04, with a median of 0.85. One of the 45 pairs falls just under 0.6, which means that even on ten faces that were generated to be distinct, the published threshold already produces one false match. The same person across head poses tells the other half of the story: on the 14 imprints of the test video, the distance between two clean poses of the same face runs from 0.20 to 0.57, with a median of 0.39. The band for "same person, other angle" reaches up to 0.57, and the band for "different person" starts at 0.59. The gap between them, on this sample, is two hundredths. The threshold is not a wall. It is a line drawn through a crowd.

This is the room the fuzzer works in. A Ghostyle does not need to make a face unrecognisable in any absolute sense. It needs to push the painted face out of a band that is already narrow, and the model's own tolerance for pose is what makes the band narrow.

**How much do interventions move the vector?** The repository's nine hand-painted fixtures (the same synthetic faces with makeup painted on) move their descriptor by 0.22 to 0.51 from the clean version. None of them crosses 0.6 against its own clean frontal image. Random bands, in the run above, reached 0.45 in the worst case and lost the face entirely on most other poses. Losing the face is a different failure mode from distance, and in a camera's terms it is the better one: there is nothing to match.

**How long does a search take?** On a laptop CPU with software rendering, face-api takes about 2.2 seconds per frame. A trial costs that many seconds times the number of imprints: 30 seconds with 14 poses, about two minutes with the 60-pose cap. A hundred trials is then 50 minutes on a small atlas and three and a half hours on a full one, unattended. The tool prunes trials that cannot reach the current top after a stratified subset of poses, which on larger atlases removes most of the cost of bad draws. With a GPU the per-frame time should fall by an order of magnitude; that has not been measured yet and is listed as untested.

**How long until a weakness shows?** On one face and one recipe, one trial in twelve reached an escape rate above 80%, and none crossed the strict threshold on every pose. If that rate of roughly one strong candidate per dozen draws held (and it is one face, so it may not), twenty trials give a 80 to 90% chance of at least one strong candidate, and an evening of CPU time gives a few. Crossing the strict threshold on every pose will take iteration on the recipe rather than more draws of the same one: wider bands, a fourth stroke, a different opacity. The report's correlation view exists for that: it shows which properties of a trial (coverage, lightness contrast, which regions the bands cross) move the scores, so that the next recipe is a guess informed by the last hundred.

Now multiply. Fifty people, each with their own atlas and an evening of unattended trials, produce several thousand measured Ghostyles across fifty faces and fifty rooms. Each one carries its conditions. The ones that recur across faces are the ones worth retesting against other models, and the ones that fail everywhere are just as informative: they say what the model does not care about. That is the research the lab cannot do alone, and the reason the tool is built to run on your machine, on your face, and to hand you a file you can share.

Two things stay true at the end. A face match is a system output, not a truth; the numbers above show how thin the line is that produces it. And nothing here is protection. It is a way to find out, on stated conditions, where one model's reading of a face gives way, and to say so in a form that someone else can check.

---

*The tool is `scripts-dev/ghostyle-fuzz.cjs` in the [Ghostmaxxing repository](https://github.com/vecna/ghostmaxxing), documented in `tutorials/ghostyle-fuzz.md`. It needs Node, ffmpeg and Playwright's Chromium. Results stay local until you choose to share them. Successful Ghostyles can be submitted to the [community gallery](https://ghostmaxxing.vecna.eu/gallery.html) for human review, and reproduced in [workshops](https://sindacato.nina.watch/en/blog/ghostati-workshop-october-2026/) organised by NINA's Universal Union.*
