# Ghostmaxxing technical reference

> Version 1.3.0
> Last updated: 22 November 2026
> Functional documentation: [use the tools and understand the results](/docs/)

Ghostmaxxing is a static browser lab for testing how selected face-analysis models respond to visible interventions. This site is the generated developer reference. It documents runtime modules, functions, parameters, events, and the Ghostyle extension contract.

If you want to operate an interface, begin with the functional guides. If you are changing code, use this page to choose an entry point, then follow the generated module reference in the sidebar.

## Choose the right layer

| Question | Documentation |
|---|---|
| How do I use the Lab, Video Loader, Latent Space Visualizer, or Face Brush? | [Functional guides](/docs/) |
| What does a match state, threshold, descriptor, or landmark mean? | [Understand the results](/docs/understand/) and [technical glossary](/docs/glossary/) |
| How do I create a Ghostyle? | [Ghostyle Authoring Guide](tutorial-ghostyle-authoring.html), then [`ghostyles/00-template.js`](module-ghostyles_00-template.html) |
| Which module, function, parameter, or event do I need? | Generated API reference in this site's sidebar |
| How do I regenerate, validate, inspect, or package the project? | [Maintainer guide](/docs/maintain/) and [`scripts-dev/README.md`](https://github.com/vecna/ghostmaxxing/blob/main/scripts-dev/README.md) |

## Released interfaces

### Browser Lab

`ghostyle-transfer.html` extracts a Ghostyle from clean and painted photos.

`lab.html` loads `lab-js/workshop/main.js` for camera comparison, numbered faces, eight seconds of recognition history, and independent landmarks.

### Ghostyle Player

`ghostyle-player.html` loads `lab-js/ghostyle-player/main.js` to replay bundled Ghostyles, apply edits to the local preview, and use the native face-anchored brush.

### Ghostyle Transfer

`ghostyle-transfer.html` loads `lab-js/ghostyle-transfer/main.js` to align a clean and painted photo on the canonical UV mesh and export the detected regions as colored polygons. The preview renders the exported `paintUV` callback. Face-api comparisons and explicitly saved clean references use the same local archive as Lab and Realtime.

### Video Loader

`loader.html` loads `lab-js/loader.js`. It lets a maintainer load a local MP4, record a baseline at one frame, seek to another frame, and inspect repeatable 2D and experimental visual-embedding comparisons.

Use it when exact media time matters more than a live webcam.

Use it to explore appearance transfer. A visually successful transfer is not evidence that the target image evades recognition.

### Latent Space Visualizer

`realtime.html` loads `lab-js/realtime/realtime.js`. It captures a temporal 2D
face-api baseline, filters frames whose 2D pose, framing, or ambient light is not
comparable, and lets the operator mark and aggregate successive makeup steps.
The input may be a live camera or a local video. The timeline, equalizer, and
radial fingerprint are different views of the same descriptor-distance session.

Begin with the [functional guide](/docs/guides/realtime.html), then use the
[combined operating guide and methodology](/docs/jsdoc/tutorial-realtime.html) before
interpreting the threshold, noise floor, or per-coordinate plots.

## Runtime architecture

- `workshop/recognition.js` classifies observations and computes the timed history.
- `face-archive.js` gives Lab and Realtime access to the same numbered camera references.
- `workshop/media.js` and `workshop/overlays.js` provide the camera, clips, model setup and geometry rendering.
- `ghostyle-player/catalog.js` loads and compiles editable modules.
- `ghostyle-player/preview.js` and `ghostyle3d-uv-renderer.js` render the Player's 2D and 3D paint.

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

Ghostyle Player exposes `window.gstmxx` before loading the selected Ghostyle. The API contains the current geometry, active Ghostyle ID, events and drawing helpers. See [Ghostmaxxing.d.ts](https://github.com/vecna/ghostmaxxing/blob/main/lab-js/Ghostmaxxing.d.ts).

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
3. Check `Ghostmaxxing.d.ts`, event consumers, and tests.
4. Change source documentation and functional copy where the behaviour changes.
5. Run the narrow tests, then the relevant end-to-end path.
6. Regenerate only the outputs whose sources changed and inspect their diffs.

Continue with [Build and inspect](/docs/develop/) for an annotated module map or [Maintain the project](/docs/maintain/) for operational commands and overwrite behaviour.
