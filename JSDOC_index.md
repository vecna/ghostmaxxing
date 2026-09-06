# Ghostmaxxing technical reference

> Version 0.9.9  
> Last updated: September 2026  
> Functional documentation: [use the tools and understand the results](/docs/)

Ghostmaxxing is a static browser lab for testing how selected face-analysis models respond to visible interventions. This site is the generated developer reference. It documents runtime modules, functions, parameters, events, and the Ghostyle extension contract.

If you want to operate an interface, begin with the functional guides. If you are changing code, use this page to choose an entry point, then follow the generated module reference in the sidebar.

## Choose the right layer

| Question | Documentation |
|---|---|
| How do I use the Lab, Video Loader, Transfer, or Face Brush? | [Functional guides](/docs/) |
| What does a match state, threshold, descriptor, or landmark mean? | [Understand the results](/docs/understand/) and [technical glossary](/docs/glossary/) |
| How do I create a Ghostyle? | [Ghostyle Authoring Guide](tutorial-ghostyle-authoring.html), then [`ghostyles/00-template.js`](module-ghostyles_00-template.html) |
| Which module, function, parameter, or event do I need? | Generated API reference in this site's sidebar |
| How do I regenerate, validate, inspect, or package the project? | [Maintainer guide](/docs/maintain/) and [`scripts-dev/README.md`](https://github.com/vecna/ghostmaxxing/blob/main/scripts-dev/README.md) |

## Released interfaces

### Browser Lab

`lab.html` loads `lab-js/main.js`, the application controller. It coordinates the camera, local baselines, face-api analysis, MediaPipe geometry, Ghostyles, composite checks, UI, and the public `window.gstmxx` API.

Use it when you need live feedback or are developing an effect that follows the face.

### Video Loader

`loader.html` loads `lab-js/loader.js`. It lets a maintainer load a local MP4, record a baseline at one frame, seek to another frame, and inspect repeatable 2D and experimental visual-embedding comparisons.

Use it when exact media time matters more than a live webcam.

Use it to explore appearance transfer. A visually successful transfer is not evidence that the target image evades recognition.

`realtime.html` is not part of the initial released documentation set.

## Runtime architecture

Ghostmaxxing has no production bundling step. The browser loads HTML, CSS, ES modules, vendored libraries, model assets, and `ghostyles.json` directly. Node tooling supports tests, documentation, validation, inspection, and packaging.

```text
lab.html
  └─ lab-js/main.js
       ├─ camera.js + db.js
       ├─ engine.js + landmark-analysis.js
       ├─ mediapipe-loop.js + engine-3d.js
       ├─ auto-find-loop.js + bbox-overlay.js + analyze-panel.js
       ├─ ghostyles-manager.js
       └─ plugins3d-loader.js + ghostyle3d-uv-renderer.js

loader.html
  └─ lab-js/loader.js

```

### Core state and lifecycle

- `main.js` initialises the Lab, dispatches `gstmxxReady`, and exposes `window.gstmxx`.
- `state.js` owns shared mutable state and the `gstmxxEvents` bus.
- `config.js` owns model locations, detector options, and recording configuration.
- `dom.js`, `lab-ui.js`, and `mobile-ui.js` bind the interface to that state.

### Camera and local records

- `camera.js` manages webcam lifecycle, facing mode, and short recordings.
- `db.js` stores face-api descriptors and experimental ImageEmbedder vectors locally under related record IDs.
- `face-thumbnails.js` renders saved records.
- `upload-consent.js` is an in-progress client contract. Do not document the end-to-end upload flow as released until the backend and consent milestone are complete.

### 2D face-api path

- `engine.js` runs TinyFaceDetector, 68-point landmarks, 128-value face descriptors, and identity comparison.
- `landmark-analysis.js` turns metrics into the 2D result state.
- `MATCH_THRESHOLD` defaults to `0.58`. Face-api uses Euclidean distance, so lower is more similar and a distance at or below the threshold is a match.

### MediaPipe geometry and experimental image embedding

- `mediapipe-loop.js` runs FaceLandmarker and publishes 478 normalised landmarks for mesh and UV work.
- `engine-3d.js` runs MediaPipe ImageEmbedder with MobileNetV3 Small and compares general visual embeddings with cosine similarity.
- `MATCH_THRESHOLD_3D` defaults to `0.85`. Higher is more similar and a value at or above the threshold is a match.

The FaceLandmarker and ImageEmbedder paths serve different purposes. User-facing technical copy should call the latter an **experimental visual embedding**, not reliable 3D face recognition. It responds to global image content and is not a dedicated ArcFace-style face descriptor.

## The two-pass Ghostyle contract

The Lab intentionally analyses two images at different cadences:

1. The live scaffold tracks the original webcam frame for responsive positioning.
2. The selected Ghostyle draws onto a composite image.
3. `auto-find-loop.js` analyses that modified composite on a slower interval.
4. `bbox-overlay.js` and `analyze-panel.js` expose the resulting state and metrics.

Do not merge the original and composite paths as a cleanup. A visible live box answers “where is the face now?” The composite result answers “what did the modified image do to this local comparison?” Keeping both is necessary to interpret an intervention.

The combined state can be `matched`, `eluded`, `partial-elusion`, or `unknown`. The public word “Escaped” is an interface label, not a universal security result. Preserve raw per-path measurements wherever the distinction matters.

## Ghostyle extension contract

A Ghostyle is an ES module referenced by `ghostyles.json`. Capability comes from exports, not from header metadata:

- `onDraw(ctx, landmarks, box)` supplies a 2D canvas effect;
- `paintUV(...)` supplies a UV or mesh effect;
- a hybrid module may export both;
- `onInit()` and `onClear(ctx)` are optional lifecycle hooks;
- `params` can expose supported controls.

`onDraw()` is on a rendering hot path. Keep it synchronous, guard absent or partial landmarks, and avoid allocating persistent resources without cleanup.

### Metadata and provenance

Each module contains a block between `==Ghostyle==` and `==/Ghostyle==`. The project policy distinguishes:

- required identity and provenance fields: name, description, stable slug, version, author, licence;
- recommended technique fields: supported path, regions, evidence, and technique;
- optional archive fields: release date, references, and workshop provenance.

The current validator enforces only the implemented minimum and format checks. Passing `npm run validate:ghostyle` does not prove that every policy field is present. Read the authoring tutorial and canonical template before tightening validation or publishing an exported Ghostyle.

## Public browser API

`window.gstmxx` is exposed for plugins, tests, and integrations after the `gstmxxReady` event. Use [`lab-js/Ghostmaxxing.d.ts`](https://github.com/vecna/ghostmaxxing/blob/main/lab-js/Ghostmaxxing.d.ts) as the typed index and the generated symbols in this site as the detailed reference.

Important groups include:

- latest analysis and thresholds, including `getLastResult()`;
- detector, model, and FaceLandmarker access required by supported extensions;
- active Ghostyle and composite helpers;
- utility functions deliberately surfaced to plugins.

Treat everything else in module state as internal. If an integration needs a new stable function, add it to the public object, type declaration, JSDoc, and a test together.

## Generated and hand-authored documentation

The documentation is deliberately split:

- `docs-src/en/*.body.html` contains hand-authored, translatable functional documentation;
- `scripts-dev/build-functional-docs.cjs` wraps it in shared site chrome and writes `/docs/`;
- `JSDOC_index.md`, tutorials, and source comments feed the technical site under `/docs/jsdoc/`;
- `scripts-dev/README.md` is the detailed operational source for maintainers.

```sh
npm run docs:functional  # build the public functional pages
npm run docs             # generate JSDoc into docs/jsdoc/
npm run docs:rebuild     # remove only docs/jsdoc/ and regenerate it
```

The JSDoc cleanup must remain scoped to `docs/jsdoc/`. It must not delete the functional pages or screenshot assets.

## Before changing a contract

1. Read the functional guide so you know which user-visible promise depends on the code.
2. Inspect the source module and its generated reference.
3. Check `Ghostmaxxing.d.ts`, event consumers, tests, and the codemap.
4. Change source documentation and functional copy where the behaviour changes.
5. Run the narrow tests, then the relevant end-to-end path.
6. Regenerate only the outputs whose sources changed and inspect their diffs.

Continue with [Build and inspect](/docs/develop/) for an annotated module map or [Maintain the project](/docs/maintain/) for operational commands and overwrite behaviour.
