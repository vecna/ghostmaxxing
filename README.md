# Ghostmaxxing
<!-- coverage-badge:start -->
[![Unit Test Coverage](https://img.shields.io/badge/coverage-66.96%25-yellow)](coverage/)
<!-- coverage-badge:end -->
[![CI](https://github.com/vecna/ghostmaxxing/actions/workflows/ci.yml/badge.svg)](https://github.com/vecna/ghostmaxxing/actions/workflows/ci.yml)

[![Docs](https://img.shields.io/badge/docs-JSDoc-blue)](docs/)
[![Source](https://img.shields.io/badge/source-GitHub-black)](https://github.com/vecna/ghostati)

**Ghostmaxxing** is a static, browser-side Web AR laboratory for designing and testing face-obfuscation overlays against face-detection and face-recognition pipelines.

The project combines webcam capture, [`face-api.js`](https://github.com/vladmandic/face-api), [MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision/face_landmarker), canvas rendering, local descriptor storage, and a plugin system for custom **Ghostyles**: 2D or 3D face overlays that can be tested against recognition behavior in real time.

Primary links:

- first inception and italian workshop organization area: [https://sindacato.nina.watch/ghostati/](https://sindacato.nina.watch/ghostati/)
- Browser app: [lab.html](https://ghostmaxxing.vecna.eu/lab.html)
- Source code: [github.com/vecna/ghostmaxxing](https://github.com/vecna/ghostmaxxing)
- Ghostyle gallery [ghosmaxxing.vecna.eu/@ghostlyles](https://ghostmaxxing.vecna.eu/@ghostyles), it's on acivitypub, follow it via mastodon!
- Technical docs: [docs/](https://ghostmaxxing.vecna.eu/docs/)
- Test coverage: [coverage/](https://ghstmaxxing.vecna.eu/coverage/)
- Sitemap: [sitemap.xml](https://sindacato.nina.watch/ghostati/sitemap.xml)
- Reference dataset: [references/REFERENCES.json](references/REFERENCES.json)
- Live pages: [lab.html](lab.html), [realtime.html](realtime.html), and [ghostyle-transfer.html](ghostyle-transfer.html)

**Central field-reporting resource:** if you know of a place where facial recognition is being deployed, tested, procured, or hidden in public-space infrastructure, use the NINA submission node: [Raccontacelo](https://raccontaci.nina.watch/#/submission?context=10c78596-3ea0-4867-b2fb-21fdb8e3f40c). Reports about supplier, technology, data access, deployment context, limits, and abuses are project inputs, not side notes.

# What the app does

```text
 webcam ──► landmarks ──► save your face ──► overlay renderer
                                         ──► or do actual makeup
                             │                │
       ─ share the sucess ◄──┴──── compare ◄──┘
```

The app is designed around a simple experimental loop:

1. Start the webcam in a modern browser.
2. Load face-detection and landmark models.
3. Save a local baseline descriptor for a consenting test face.
4. Apply a Ghostyle overlay, or, paint your own (it's the default!) to the live video/canvas layer.
5. Re-run detection and recognition against the saved descriptor.
6. Observe whether the pipeline still detects the face, extracts landmarks, and matches the baseline.

Key runtime files and responsibilities:

- webcam setup and teardown through [`scripts/camera.js`](scripts/camera.js);
- face detection, landmarks, descriptors, and match orchestration through [`scripts/engine.js`](scripts/engine.js);
- 3D/MediaPipe loop support through [`scripts/mediapipe-loop.js`](scripts/mediapipe-loop.js) and [`scripts/engine-3d.js`](scripts/engine-3d.js);
- bounding-box overlays through [`scripts/bbox-overlay.js`](scripts/bbox-overlay.js);
- dynamic Ghostyle loading through [`scripts/ghostyles-manager.js`](scripts/ghostyles-manager.js);
- 3D plugin loading through [`scripts/plugins3d-loader.js`](scripts/plugins3d-loader.js);
- IndexedDB-backed local state through [`scripts/db.js`](scripts/db.js);
- DOM and UI bindings through [`scripts/dom.js`](scripts/dom.js), [`scripts/main.js`](scripts/main.js), and [`scripts/mobile-ui.js`](scripts/mobile-ui.js);
- image/makeup export helpers through [`scripts/export-makeup.js`](scripts/export-makeup.js);
- homepage interaction through [`scripts/home.js`](scripts/home.js).

# Runtime architecture

```text
lab.html
  ├─ face-api.js / MediaPipe Tasks Vision
  ├─ scripts/main.js
  │   ├─ camera.js            — webcam stream lifecycle
  │   ├─ engine.js            — detection, landmarks, descriptors, matching
  │   ├─ db.js                — local IndexedDB state
  │   ├─ dom.js               — DOM wiring and UI state
  │   └─ ghostyles-manager.js — Ghostyle discovery and dynamic loading
  ├─ ghostyles.json          — manifest of available Ghostyles
  └─ ghostyles/*.js          — overlay modules rendered on top of the canvas/video layer
```

The project is a static web app: there is no production build step required to open the interface locally. The browser loads HTML, CSS, JavaScript modules, model assets, and plugin manifests.

Important local entry points:

- [`index.html`](index.html) — public landing page with links to code, docs, coverage, Ghostyles, project context, and the reporting node.
- [`lab.html`](lab.html) — translated main webcam/AR application.
- [`loader.html`](loader.html) — translated internal MP4 loader for repeatable 2D/3D video tests.
- [`realtime.html`](realtime.html) — realtime interface entry point.
- [`ghostyle-transfer.html`](ghostyle-transfer.html) — transfer-oriented interface entry point.
- [`ghostati.html`](ghostati.html) — legacy webcam/AR application entry point.
- [`ghostyles.json`](ghostyles.json) — Ghostyle manifest.
- [`JSDOC_index.md`](JSDOC_index.md) — concise generated-docs overview.
- [`references/REFERENCES.json`](references/REFERENCES.json) — curated technical/cultural reference set.

# Localization coverage

Ghostmaxxing currently ships runtime translations for English, Italian, and Portuguese through [`scripts/i18n.js`](scripts/i18n.js). The translated browser pages are:

- [`index.html`](index.html) — homepage and public navigation.
- [`lab.html`](lab.html) — main camera lab, settings, drawers, controls, status labels, and runtime logs.
- [`loader.html`](loader.html) — internal MP4 video loader, language switcher, static interface labels, model status, and loader activity logs.

Other static pages such as [`about.html`](about.html), [`report.html`](report.html), workshop/tutorial pages, generated docs, coverage, and reference pages are still English-baseline unless they add `data-i18n*` bindings and catalog keys.

Runtime external dependencies visible from the HTML/config layer:

- Local vendored Google Fonts CSS/assets in `styles/vendor/` (`Inter`, `JetBrains Mono`, `League Script`, `Outfit`)
- [jsDelivr CDN](https://cdn.jsdelivr.net)
- [`@vladmandic/face-api`](https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js)
- [face-api.js model weights](https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/)
- [MediaPipe Tasks Vision](https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35)
- [MediaPipe Face Landmarker model](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)
- [MediaPipe Image Embedder model](https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite)

For workshops or higher-risk demos, prefer self-hosting model and library assets instead of relying on third-party CDNs.

# Install and run locally

```text
 clone ──► install dev deps ──► static server ──► browser + webcam
```

Clone the repository:

```bash
git clone https://github.com/vecna/ghostmaxxing.git
cd ghostmaxxing
```

Install development dependencies:

```bash
npm install
```

Serve the directory with any local static server:

```bash
npx http-server .
# or
python3 -m http.server 8000
```

Open the main lab app:

```text
http://localhost:8000/lab.html
```

Open the landing page:

```text
http://localhost:8000/
```

# Ghostyles plugin API

```text
 landmarks + box + canvas context
          │
          ▼
      ghostyle module
          │
          ▼
   live overlay + diagnostic pass
```

A **Ghostyle** is a JavaScript module that draws an overlay anchored to a detected face. It can be local or loaded through a manifest.

Start from [`ghostyles/00-template.js`](ghostyles/00-template.js), then add the file to [`ghostyles.json`](ghostyles.json). Existing examples include:

- [`ghostyles/beauty-2d.js`](ghostyles/beauty-2d.js)
- [`ghostyles/brush.js`](ghostyles/brush.js)
- [`ghostyles/cv-dazzle-1.js`](ghostyles/cv-dazzle-1.js)
- [`ghostyles/maximalism.js`](ghostyles/maximalism.js)
- [`ghostyles/smokey-eyes.js`](ghostyles/smokey-eyes.js)
- [`ghostyles/soft-contour.js`](ghostyles/soft-contour.js)
- [`ghostyles/uv-stripes.js`](ghostyles/uv-stripes.js)

A minimal 2D plugin shape:

```js
/**
 * @name Example Ghostyle
 * @engine faceapi
 */
export function onInit() {
  return 'loaded';
}

export function onDraw(ctx, landmarks, box) {
  ctx.save();
  // Draw against landmarks and detection box here.
  ctx.restore();
}

export function onClear(ctx) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
```

Plugins that expose MediaPipe/UV hooks are loaded through the same manifest. The current UV-capable example is [`ghostyles/uv-stripes.js`](ghostyles/uv-stripes.js).

# Testing and generated docs

```text
 unit tests ──► coverage
 e2e tests  ──► browser flows
 jsdoc      ──► docs/
```

Package scripts:

```bash
npm run test:unit
npm run test:unit -- --coverage
npm run test:e2e
npm run docs
```

Testing stack:

- [Vitest](https://vitest.dev/) for unit tests;
- [`@vitest/coverage-v8`](https://vitest.dev/guide/coverage) for coverage;
- [Playwright](https://playwright.dev/) for browser-level tests;
- [JSDOM](https://github.com/jsdom/jsdom) and [node-canvas](https://github.com/Automattic/node-canvas) for DOM/canvas test fixtures;
- [JSDoc](https://jsdoc.app/) with [`clean-jsdoc-theme`](https://github.com/ankitskvmdam/clean-jsdoc-theme) for generated documentation.

Relevant test directories:

- [`tests/unit/`](tests/unit/)
- [`tests/e2e/`](tests/e2e/)
- [`tests/fixtures/`](tests/fixtures/)

# Privacy, data, and limitations

```text
 browser storage
    ├─ descriptors
    ├─ preferences
    └─ test state
 external network
    ├─ fonts
    ├─ CDN libraries
    └─ model weights
```

The app is designed to keep biometric test data local to the browser interface. Face descriptors and related state are stored locally, not posted to a central server by the default app flow.

Technical caveats:

- webcam access is controlled by the browser permission model;
- local descriptors may persist in IndexedDB/local browser storage until cleared;
- screenshots, recordings, and exports should be treated as sensitive biometric-adjacent material;
- CDN-loaded libraries and model files still create external network requests;
- detection failure, landmark instability, and match failure are different outcomes and should not be collapsed into “anonymity”;
- a Ghostyle that affects this browser pipeline may not affect another face-recognition system.

Use consenting test subjects. Do not represent experimental overlays as operational safety guarantees.

# Field reports: public-space face recognition

```text
 observe ──► document ──► submit ──► update resistance research
```

Ghostmaxxing is also connected to a field-reporting workflow. The landing page now treats the NINA reporting node as a central project resource:

[Raccontacelo: segnala un possibile uso di riconoscimento facciale nello spazio pubblico](https://raccontaci.nina.watch/#/submission?context=10c78596-3ea0-4867-b2fb-21fdb8e3f40c)

Useful report details include:

- location and institutional context;
- supplier or vendor name;
- visible hardware or software clues;
- procurement documents, signage, screenshots, or public records;
- who appears to access the data;
- retention, oversight, and abuse risks;
- whether the system is detection-only, identification, verification, watchlist matching, analytics, or unclear.

The point is to turn deployments into inspectable evidence: claims, vendors, interfaces, procurement, sensors, data flows, and affected communities.

# References dataset

```text
 REFERENCES.json ──► timeline / exhibition / research context
 PROMPT-REFERENCES-UPDATE.txt ──► repeatable curation rules
```

[`REFERENCES.json`](REFERENCES.json) is a curated dataset of artistic, research, and activism-adjacent references around face obfuscation, adversarial appearance design, makeup-based attacks, physical-world adversarial vision, and sensor disruption.

The update protocol in [`PROMPT-REFERENCES-UPDATE.txt`](PROMPT-REFERENCES-UPDATE.txt) keeps the file deduplicated, sorted, and stable. It requires canonical links, local preview-image paths, stable slugs, and a `closeness` score from `1` to `100`.

Current reference links:

- [Human-Imperceptible Physical Adversarial Attack for NIR Face Recognition Models](https://arxiv.org/abs/2504.15823) — Songyan Xie, Jinghang Wen, Encheng Su et al., 2025 · `research` · closeness `22`
- [Accessorize in the Dark: A Security Analysis of Near-Infrared Face Recognition](https://doi.org/10.1007/978-3-031-51479-1_3) — Amit Cohen, Mahmood Sharif, 2024 · `research` · closeness `22`
- [DAZZLE](https://www.michelletylicki.info/dazzle/) — Michelle Tylicki, Lauri Love, 2023 · `activism` · closeness `100`
- [Physical-World Optical Adversarial Attacks on 3D Face Recognition](https://openaccess.thecvf.com/content/CVPR2023/html/Li_Physical-World_Optical_Adversarial_Attacks_on_3D_Face_Recognition_CVPR_2023_paper.html) — Yanjie Li, Yiquan Li, Xuelong Dai et al., 2023 · `research` · closeness `30`
- [The Camera-Shy Hoodie](https://www.macpierce.com/the-camera-shy-hoodie) — Mac Pierce, 2023 · `artistic` · closeness `20`
- [Shadows can be Dangerous: Stealthy and Effective Physical-world Adversarial Attack by Natural Phenomenon](https://arxiv.org/abs/2203.03818) — Yiqi Zhong, Xianming Liu, Deming Zhai et al., 2022 · `research` · closeness `35`
- [The Dazzle Club](https://emilyroderick.com/work/the-dazzle-club/) — Evie Price, Emily Roderick, Georgina Rowlands et al., 2021 · `activism` · closeness `96`
- [Adv-Makeup: A New Imperceptible and Transferable Attack on Face Recognition](https://arxiv.org/abs/2105.03162) — Bangjie Yin, Wenxuan Wang, Taiping Yao et al., 2021 · `research` · closeness `95`
- [Adversarial Attacks against Face Recognition: A Comprehensive Study](https://arxiv.org/abs/2007.11709) — Fatemeh Vakhshiteh, Ahmad Nickabadi, Raghavendra Ramachandra, 2020 · `research` · closeness `82`
- [Breaking certified defenses: Semantic adversarial examples with spoofed robustness certificates](https://arxiv.org/abs/2003.08937) — Amin Ghiasi, Ali Shafahi, Tom Goldstein, 2020 · `research` · closeness `35`
- [VLA: A Practical Visible Light-based Attack on Face Recognition Systems in Physical World](https://doi.org/10.1145/3351261) — Meng Shen, Zelin Liao, Liehuang Zhu et al., 2019 · `research` · closeness `78`
- [Adversarial Robustness Toolbox v1.0.0](https://arxiv.org/abs/1807.01069) — Maria-Irina Nicolae, Mathieu Sinn, Minh Ngoc Tran et al., 2018 · `research` · closeness `55`
- [DPatch: An Adversarial Patch Attack on Object Detectors](https://arxiv.org/abs/1806.02299) — Xin Liu, Huanrui Yang, Ziwei Liu et al., 2018 · `research` · closeness `40`
- [ShapeShifter: Robust Physical Adversarial Attack on Faster R-CNN Object Detector](https://arxiv.org/abs/1804.05810) — Shang-Tse Chen, Cory Cornelius, Jason Martin et al., 2018 · `research` · closeness `38`
- [Adversarial Generative Nets: Neural Network Attacks on State-of-the-Art Face Recognition](https://arxiv.org/abs/1801.00349) — Mahmood Sharif, Sruti Bhagavatula, Lujo Bauer et al., 2017 · `research` · closeness `90`
- [Adversarial Patch](https://arxiv.org/abs/1712.09665) — Tom B. Brown, Dandelion Mané, Aurko Roy et al., 2017 · `research` · closeness `50`
- [Accessorize to a Crime: Real and Stealthy Attacks on State-of-the-Art Face Recognition](https://dl.acm.org/doi/10.1145/2976749.2978392) — Mahmood Sharif, Sruti Bhagavatula, Lujo Bauer et al., 2016 · `research` · closeness `92`
- [HyperFace](https://adam.harvey.studio/hyperface/) — Adam Harvey, 2016 · `artistic` · closeness `92`
- [Adversarial Manipulation of Deep Representations](https://arxiv.org/abs/1511.05122) — Sara Sabour, Yanshuai Cao, Fartash Faghri et al., 2015 · `research` · closeness `45`
- [CV Dazzle](https://adam.harvey.studio/cvdazzle/) — Adam Harvey, 2010 · `artistic` · closeness `100`
