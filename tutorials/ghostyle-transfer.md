# Ghostyle Transfer

**Project:** Ghostmaxxing
**Audience:** researchers and workshop facilitators previewing camouflage layouts
**Status:** ⚠️ NOT RELEASED YET — this page is written ahead of launch and is
deliberately kept out of the docs build. It is not registered in
`tutorials/tutorials.json` and is not linked from the site. See the RELEASE
TOGGLE in `docs/index.html` for how to publish it.

---

## 1. What it is

Ghostyle Transfer (`ghostyle-transfer.html`) lifts a painted makeup pattern off a
workshop **before / after** image pair and previews it on a new **target** face —
entirely in the browser, with no image ever leaving the device.

It exists because a look that worked on one person is a *teachable pattern*.
Transfer lets you see roughly how that pattern would sit on a different face
before anyone picks up a brush.

> This is a **visualization**, not evidence. Placing a pattern on a face does not
> demonstrate that it affects any recognition system, and face detectors are
> unreliable on stylized artwork. Treat the output as a sketch.

## 2. The three slots

| Slot | Required | What it is |
|---|---|---|
| **Before** | optional | The bare workshop face. Used to isolate *only the paint* by subtracting it from the after image. |
| **After** | required | The painted workshop face — the source of the Ghostyle. |
| **Target** | required | The face (or painting) that will receive the paint. |

Each slot shows a fitted preview where you draw a **face box** in image
coordinates. The box tells the tool where the face is when the local engine
cannot find one automatically.

## 3. How a transfer runs

1. Load an **after** and a **target**, and draw a box on each face. (A **before**
   image improves paint isolation but is optional.)
2. The after face crop is normalized into a canonical square.
3. The paint layer is isolated: if a before image is present, it is subtracted;
   otherwise a sampled reference skin colour is subtracted. The result is an
   **alpha matte** — the isolated Ghostyle — previewed in the side panel.
4. The matte edges are feathered, then the matte is placed onto the target:
   - **Mesh mode (default):** when `@vladmandic/face-api` finds 68 landmarks on
     both faces, corresponding points are triangulated and the matte is warped
     triangle by triangle to follow the target's features.
   - **Box fallback:** if the mesh cannot find a face, the matte is scaled and
     placed using the box you drew.
5. The composite appears in the result panel; **Download result** saves a PNG.

## 4. Controls

- **Paint sensitivity** — how aggressively the paint is separated from skin.
- **Edge feather** — softens the matte edge to avoid hard cut-outs.
- **Opacity** — strength of the transferred layer on the target.
- **Blend** — `Multiply` (paints onto), `Normal`, or `Soft light`.
- **Follow features (mesh)** — toggle mesh warping off to force box placement.

## 5. Where it fits

Transfer is a diagnostic/authoring aid, adjacent to the lab and the brush. A
pattern you like here should still be re-tested live in the lab (`lab.html`) and,
if it holds, baked into a reusable Ghostyle. Transfer previews the *layout*; the
lab tests the *effect*.

## 6. Privacy

All processing is local: uploads, matte extraction, mesh detection, warping, and
compositing happen in the browser runtime. Nothing is sent to a server. Treat
the images you load, and any downloaded result, as sensitive biometric-adjacent
material.
