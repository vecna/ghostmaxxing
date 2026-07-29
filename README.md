# Ghostmaxxing

<!-- coverage-badge:start -->
[![Unit Test Coverage](https://img.shields.io/badge/coverage-66.96%25-yellow)](coverage/)
<!-- coverage-badge:end -->
[![CI](https://github.com/vecna/ghostmaxxing/actions/workflows/ci.yml/badge.svg)](https://github.com/vecna/ghostmaxxing/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-JSDoc-blue)](https://ghostmaxxing.vecna.eu/docs/)
[![Source](https://img.shields.io/badge/source-GitHub-black)](https://github.com/vecna/ghostmaxxing)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](#license)

**Ghostmaxxing** is a static, browser-side lab for testing face-recognition
camouflage. Point a webcam at your face, save a baseline, change how you look —
paint directly on the tracked face or apply a **Ghostyle** overlay — and watch a
local recognition pipeline react in real time. Everything runs in the browser;
your face data stays on your device.

It is **not** a protection product and it does not promise anonymity. It makes
parts of a face-recognition pipeline visible, testable, and discussable.

## Who this README is for

This page is the developer entry point. Three audiences, three documents:

- **This README** — clone it, run it, test it, build the docs. (You are here.)
- **[Technical documentation](https://ghostmaxxing.vecna.eu/docs/)** — module map,
  runtime architecture, the Ghostyle plugin API, and the generated JSDoc reference.
  Locally: run `npm run docs` and open `docs/`.
- **[The public site](https://ghostmaxxing.vecna.eu/)** — the lab, the vision,
  the research references, and the reporting channel, written for workshop
  participants and curious readers rather than for developers.

## Read the disclaimer first

A result in this lab is a **local, conditional finding, not a general protection
claim**. The detectors and models are open-source; results depend on the model,
camera, lighting, pose, distance, thresholds, and context. A look that defeats
the local match here may not affect any other system, and a human watching camera
footage can often still recognise someone wearing makeup. Local evasion is not
real-world protection. Use consenting test subjects, and never present an
experimental overlay as an operational safety guarantee.

## Quickstart

```bash
git clone https://github.com/vecna/ghostmaxxing.git
cd ghostmaxxing
npm install          # dev tooling only (tests, docs, validation)
npm start            # serves the repo and opens /lab.html
```

`npm start` runs a static file server — there is no build step. Any static
server works:

```bash
npm run serve        # http://localhost:8080/  (no page opened)
python3 -m http.server 8000
```

Entry points once served:

- `/lab.html` — the main webcam / AR lab (the app).
- `/` (`index.html`) — public landing page.
- `/about.html` — project vision and context.
- `/report.html` — how to report a face-recognition deployment.
- `/loader.html` — internal MP4 loader for repeatable 2D/3D video tests.
- `/references/` — curated research/artistic/activism reference set.
- `/docs/` — technical documentation (after `npm run docs`).

## Common tasks

```bash
npm run check              # validator + unit tests (run before proposing changes)
npm run test:unit          # Vitest unit tests
npm run test:unit -- --coverage
npm run test:e2e           # Playwright browser tests
npm run docs               # generate the JSDoc site into docs/jsdoc/
npm run validate:ghostyles # validate every ghostyle in ghostyles/
npm run validate:ghostyle -- ghostyles/your-slug.js   # validate one
npm run update:references  # rebuild references/index.html from REFERENCES.json
npm run i18n:extract       # regenerate the .pot / summary CSV for translation
```

New to contributing a Ghostyle? See **[CONTRIBUTING.md](CONTRIBUTING.md)** and the
[Ghostyle Authoring Guide](https://ghostmaxxing.vecna.eu/docs/) (first tutorial in
the docs sidebar).

## What a Ghostyle is

A **Ghostyle** is a small JavaScript module that draws a face-anchored overlay
and can be tested live against the recognition pipeline. It exposes `onDraw`
(2D, face-api landmarks) and/or `paintUV` (UV/3D, MediaPipe mesh). Start from the
heavily commented [`ghostyles/00-template.js`](ghostyles/00-template.js), then add
your `{ id, url }` line to [`ghostyles.json`](ghostyles.json).

The plugin contract, capability detection, and header-metadata policy are
documented in the **[technical docs](https://ghostmaxxing.vecna.eu/docs/)** and the
authoring guide — kept there so they live in one place only.

## Internationalization

Runtime translations for English, Italian, and Portuguese are shipped through
`scripts/i18n.js` (a single inline message catalog + `data-i18n*` attributes +
`t()` in JS). There is no `locales/` directory and no build step. Translated
pages currently include `index.html`, `lab.html`, and `loader.html`; other static
pages are English-baseline until they add `data-i18n*` bindings. See
`translations/README.md` for the add-a-string / add-a-language workflow, and run
`npm run i18n:extract` after adding user-facing strings.

## Privacy, data, and limitations

- Face descriptors and test state are stored locally in the browser (IndexedDB),
  not posted to a server by the default app flow.
- Webcam access is governed by the browser permission model.
- Local descriptors persist until you clear them; screenshots, recordings, and
  exports are sensitive biometric-adjacent material.
- CDN-loaded libraries and model weights still create external network requests.
  For workshops or higher-risk demos, prefer self-hosting the model and library
  assets rather than relying on third-party CDNs.
- Detection failure, landmark instability, and match failure are different
  outcomes — they must not be collapsed into "anonymity".

## Field reports: public-space face recognition

If you know of a place where facial recognition is being deployed, tested,
procured, or hidden in public infrastructure, the project runs a third-party
[GlobaLeaks](https://www.globaleaks.org) node. See **[report.html](report.html)**
for how to report safely and what happens next. Reports about suppliers,
technology, data access, deployment context, limits, and abuses are project
inputs, not side notes.

## References dataset

[`references/REFERENCES.json`](references/REFERENCES.json) is a curated,
schema-validated dataset of artistic, research, and activism references around
face obfuscation and adversarial appearance design. The curation protocol and
maintenance notes live in [`references/NOTES.md`](references/NOTES.md);
`npm run update:references` regenerates the browsable
[`references/`](references/) page. Browse it live at
[ghostmaxxing.vecna.eu/references/](https://ghostmaxxing.vecna.eu/references/).

## Provenance

Ghostmaxxing is the international evolution of **Ghòstati**, a NINA.watch
adversarial-makeup workshop. The original Italian-only workshop deployment
remains frozen and live at
[sindacato.nina.watch/ghostati/](https://sindacato.nina.watch/ghostati/); it is
legacy and is not maintained as part of this repository.

## License

AGPL-3.0-or-later. Ghostyles are individually copyable modules — keep the license
header travelling with the file.
