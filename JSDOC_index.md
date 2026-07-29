# Ghostmaxxing — Technical Documentation

> **Version:** 1.0.0
> **Last updated:** July 2026

This is the technical reference for Ghostmaxxing, a static browser lab for
developing and real-time testing of anti-biometric face-recognition camouflage.
It is the developer-and-agent layer of the documentation: the [public site](https://ghostmaxxing.vecna.eu/)
speaks to workshop and research audiences, the [README](https://github.com/vecna/ghostmaxxing)
covers cloning and running, and this document (plus the generated JSDoc reference
in the sidebar) is the implementation depth.

The rest of this page is generated as the JSDoc site's home. Explore the sidebar
for per-module symbol reference.

## Start here if you are building a Ghostyle

1. **[Ghostyle Authoring Guide](tutorial-ghostyle-authoring.html)** — the practical
   contract, file shape, review expectations, and current project decisions.
   Read this before the generated API reference.
2. **[`ghostyles/00-template.js`](module-ghostyles_00-template.html)** — the
   canonical, heavily commented template. Executable documentation.
3. This page and the sidebar — the API reference for every module.

## Frontend architecture

Ghostmaxxing is a static web app. There is no production build step: the browser
loads HTML, CSS, ES modules, model assets, and the Ghostyle manifest directly.
Node tooling exists only for tests, docs, validation, and i18n extraction.

```text
lab.html
  ├─ face-api.js (Vladmandic) + MediaPipe Tasks Vision
  ├─ scripts/main.js                — application controller; exposes window.gstmxx
  │   ├─ camera.js                  — webcam stream lifecycle, 2s recording
  │   ├─ engine.js                  — face-api 2D detection / landmarks / descriptors / matching
  │   ├─ engine-3d.js               — MediaPipe ImageEmbedder experimental visual-embedding path
  │   ├─ mediapipe-loop.js          — MediaPipe FaceLandmarker loop
  │   ├─ auto-find-loop.js          — periodic composite re-detection (~2s tick)
  │   ├─ db.js                      — IndexedDB persistence for face records
  │   ├─ dom.js                     — DOM handles and bindings
  │   ├─ ghostyles-manager.js       — 2D plugin loading and UI
  │   └─ plugins3d-loader.js        — 3D/UV plugin loading and parameter UI
  ├─ ghostyles.json                 — manifest of available Ghostyles ({ id, url })
  └─ ghostyles/*.js                 — overlay modules rendered on top of the canvas/video layer
```

Two parallel recognition pipelines run side by side:

- **2D face-api** — descriptor distance, `MATCH_THRESHOLD = 0.58`, *lower is more
  similar*. This is the primary matching path.
- **Experimental 3D / visual embedding** — MediaPipe ImageEmbedder similarity,
  `MATCH_THRESHOLD_3D = 0.85`, *higher is more similar*. User-facing copy must
  call this *experimental visual embedding*, never "reliable face recognition".

The result model is `unknown / matched / eluded / partial-elusion / no-baseline`.

### Two-detector overlay architecture (do not "fix")

The bounding-box overlay uses **two different detectors on two different images**,
on purpose:

- the **live scaffold** tracks the raw webcam frame for responsive, per-frame
  feedback;
- the **composite readout** re-runs detection on the composited (overlay-applied)
  image on the slower auto-find tick, to report whether the *modified* face still
  matches.

They are intentionally not unified. Pointing the live scaffold at the composite
image would make the overlay feel laggy and would conflate "is a face visible"
with "does the modified face still match". This split is documented in the
`bbox-overlay` module header — do not regress it.

## Module map

### Core scripts (`scripts/`)

- **`main.js`** — application entry point; initialises subsystems, dispatches the
  `gstmxxReady` lifecycle event, and exposes the public API on `window.gstmxx`.
- **`config.js`** — CDN/model URLs and recording configuration.
- **`state.js`** — central mutable state and the `gstmxxEvents` bus; holds
  `MATCH_THRESHOLD` (0.58) and `MATCH_THRESHOLD_3D` (0.85).
- **`camera.js`** — webcam setup, front/back switching (`facingMode`), and 2-second
  recording.
- **`engine.js`** — face-api 2D detection, landmarks, descriptors, and match
  orchestration.
- **`engine-3d.js`** — experimental MediaPipe ImageEmbedder visual-embedding path.
- **`mediapipe-loop.js`** — MediaPipe FaceLandmarker loop.
- **`auto-find-loop.js`** — periodic composite re-detection loop (~2s tick). Keep
  this tick light; it is on the hot path.
- **`bbox-overlay.js`** — detection/match visual overlay (live scaffold vs
  composite readout — see the two-detector note above).
- **`landmark-analysis.js`** — landmark-derived metrics.
- **`analyze-panel.js`** — user-facing result explanation panel and "Copy report"
  text export.
- **`face-thumbnails.js`** — saved-face thumbnail rendering.
- **`db.js`** — IndexedDB wrapper for local face records.
- **`dom.js`** — DOM handles and event bindings.
- **`lab-ui.js`** — lab screens, settings drawer, and threshold controls
  (`setMatchThreshold`).
- **`ghostyles-manager.js`** — loads and switches 2D Ghostyles from
  `ghostyles.json`; drives `onDraw()`.
- **`plugins3d-loader.js`** — loads UV/3D Ghostyles; drives `paintUV()` and the
  exported `params` UI.
- **`ghostyle3d-uv-renderer.js`** — UV rendering and mesh-warp support.
- **`export-makeup.js`** — "Copy makeup" PNG export (clipboard-first, Web Share
  fallback).
- **`home.js`** — homepage behaviour.
- **`mobile-ui.js`** — mobile navigation shell and touch interactions.
- **`loader.js`** — internal MP4 loader (`loader.html`) for repeatable 2D/3D tests.
- **`utils.js`** — geometry / canvas / plugin helpers (also reachable by plugins
  through the public API).
- **`upload-consent.js`** — *in progress.* Client contract for the two-step
  record → consent → upload flow. See the **Consent And Ownership** tutorial; the
  end-to-end flow is not enabled yet (tracked in the upload-consent milestone).
- **`Ghostmaxxing.d.ts`** — TypeScript declarations for editor support.

### Ghostyles (`ghostyles/`)

- **`00-template.js`** — canonical template for 2D + UV callbacks (heavily
  commented).
- **`beauty-2d.js`** — 2D beauty style.
- **`brush.js`** — landmark-anchored hold-to-paint brush with live scoring, **Bake
  Ghostyle** (standalone `.js` download), and stroke-state serialization. This is
  the interactive authoring path.
- **`cv-dazzle-1.js`** — CV Dazzle style 1.
- **`maximalism.js`** — dazzle maximalist patterns.
- **`smokey-eyes.js`** — eye shadow / contouring.
- **`soft-contour.js`** — cheek / jaw / forehead contouring.
- **`uv-stripes.js`** — forehead / nose / eyes UV-warped stripes (UV example).

## Ghostyle plugin API

A Ghostyle is an ES module. Capability is detected by which functions it exports,
**not** by header metadata:

- exports `onDraw(ctx, landmarks, box)` → treated as a **2D** Ghostyle;
- exports `paintUV(...)` → treated as a **UV/3D** Ghostyle;
- may export both (hybrid), plus optional `onInit()` / `onClear(ctx)`.

Header metadata is documentation, never a runtime switch. Do not access
`landmarks[0]` without a guard, and never make `onDraw` async or `await` inside it
— it runs on the render hot path (the validator warns about these).

### Header metadata policy

Every Ghostyle carries a header block between `==Ghostyle==` and `==/Ghostyle==`.
The tiers below are the project policy; the validator (`npm run validate:ghostyles`)
currently enforces the **required** minimum and format-checks `@release_date`.

| Tag | Tier | Why |
|---|---|---|
| `@name` `@description` | **required** | UI display + card text; enforced by the validator today |
| `@slug` | **required** | stable id; enforced once every Ghostyle carries it (see note) |
| `@version` `@author` `@license` | **required** | baked Ghostyles circulate outside git — version, attribution, and license are the only provenance an exported file carries |
| `@technique` `@supports` `@regions` `@evidence` | **recommended** | the future archive filter vocabulary and the `@evidence` celebration framing; `@supports` doubles as capability documentation. Never read at runtime — which is exactly why they are not required |
| `@release_date` | **optional** | archive-card freshness only; duplicates git metadata for in-repo files and goes stale on edits. Format-checked if present |
| `@references` `@workshop` | **optional** | ties a Ghostyle to the references dataset and workshop-tested evidence level |

> **Implementation note (July 2026):** `@release_date` is already optional in the
> validator (format-checked only). Of the shipped Ghostyles, only `brush.js`
> carries the full recommended set; the others carry
> `@name @description @author @version @release_date` but not `@slug`/`@license`.
> The validator therefore does not yet hard-require `@slug`/`@license`, so
> `npm run validate:ghostyles` stays green. Tighten the validator to enforce the
> full required tier only after backfilling those tags across `ghostyles/`, or
> when the archive track (Roadmap §9) begins.

## Generating this documentation

```bash
npm run docs          # builds the JSDoc site into docs/jsdoc/
npm run docs:rebuild  # wipes docs/jsdoc/ and rebuilds
```

The site is served under `/docs/jsdoc/`. The `/docs/` landing page
(`docs/index.html`) is hand-authored and routes readers to the three
documentation layers; it is not part of the JSDoc build and is not removed by
`docs:rebuild`.
