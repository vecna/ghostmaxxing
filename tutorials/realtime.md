# Latent Space Visualizer

**Project:** Ghostmaxxing
**Audience:** researchers and facilitators studying how a face descriptor moves
**Status:** ⚠️ NOT RELEASED YET — this page is written ahead of launch and is
deliberately kept out of the docs build. It is not registered in
`tutorials/tutorials.json` and is not linked from the site. See the RELEASE
TOGGLE in `docs/index.html` for how to publish it.

---

## 1. What it is

The Latent Space Visualizer (`realtime.html`) is a real-time debugger for **face
descriptor drift**. You record a baseline face signature from the webcam, and the
tool then shows, live, how far the current face has moved from that baseline —
numerically, historically, and per-dimension.

It answers a question the main lab abstracts away: *when a look changes the match
result, what exactly is moving in the descriptor?*

## 2. The three panels

- **Distance (left).** The live descriptor distance to your baseline, plus a
  scrolling history graph. The reference line sits at the match threshold
  (`0.6` in this tool).
- **Webcam + calibration (centre).** The live video, a status pill, a countdown
  used when setting the baseline, and a **Set Baseline** button.
- **Descriptor Delta (right).** A 128-cell "equalizer": one cell per dimension of
  the face descriptor, coloured by how much that dimension has shifted from the
  baseline. This is where you can *see* which parts of the signature a given
  makeup stroke, head turn, or lighting change disturbs.

## 3. How to use it

1. Open the page and allow camera access; models load automatically.
2. Sit in a neutral pose and press **Set Baseline**. A short countdown captures a
   clean baseline descriptor. The state moves from `CALIBRATING` to `TRACKING`.
3. Change something — apply makeup, turn your head, change the light — and watch:
   - the **Distance** value and graph move;
   - the **Descriptor Delta** equalizer light up on the dimensions that shifted.
4. Re-press **Set Baseline** any time to re-anchor.

## 4. Reading the numbers

- Distance is a descriptor distance: **lower means more similar** to the
  baseline. Crossing the threshold line is the moment the pipeline would stop
  treating the current face as the baseline face.
- The equalizer is a *diagnostic*, not a score. A large delta on many dimensions
  usually corresponds to a large distance, but the point is to build intuition
  about which changes matter, not to read an exact value off a single cell.

## 5. Limits

- This is a **local, conditional** view of one browser pipeline's descriptor.
  Movement here is not proof of real-world protection, and the threshold shown is
  this tool's own reference, not a universal cut-off.
- The visualizer studies the descriptor path; it does not bake or export a
  Ghostyle. When a look you found here is worth keeping, reproduce and bake it in
  the main lab (`lab.html`).

## 6. Privacy

The baseline descriptor and all per-frame computation stay in the browser.
Nothing is uploaded.
