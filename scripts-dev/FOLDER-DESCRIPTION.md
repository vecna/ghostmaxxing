# scripts-dev

This folder contains the repository's maintenance, validation, and project-generation scripts. These are not runtime app code; they support local development, static analysis, build output generation, and documentation/packaging workflows for Ghostmaxxing.

Most files here are intended to be included in code2prompt or used by maintainers when preparing repo updates, validating Ghostyle plugins, refreshing generated assets, or exporting text for review. One script is intentionally excluded from the main code2prompt output because it manipulates the localization catalog rather than application logic.

## Script roles

- `build-codemap.js` — builds a static architecture map of the app by scanning `lab-js/*.js`, parsing imports and event bus usage, and listing which HTML entry pages reach each module. It produces `codemap.json` and is used to understand module connectivity and event flow.

- `build-codemap-html.js` — wraps the generated codemap JSON into the standalone HTML viewer under `codemap/`. It injects the JSON into the codemap template so the architecture map can be opened in a browser without extra setup.

- `build-logo.py` — regenerates the logo and favicon set from one geometry source in Python. It emits the SVG and PNG assets used in `images/logo/` and updates the Apple touch icon and favicon variants from the canonical SVG mark.

- `code2prompt.js` — generates filtered prompt bundles for AI tooling. It defines namespace-based include/exclude rules for design work, lab/runtime work, testing, copy review, repo map summaries, and a full snapshot safety-net export.

- `extract-i18n-pot.cjs` — extracts the translation strings from `lab-js/i18n.js` and writes the POT and CSV summary files into `translations/`. It is intentionally excluded from the main prompt bundles because it operates on the localization catalog and translation-maintenance artifacts, not on the live app logic.

- `extract-text-only.js` — extracts user-facing text from HTML pages and structured data files into a reviewable Markdown report. It is used to audit copy, labels, metadata, and alt/aria text without sending the full inline SVG-heavy HTML to a review process.

- `install-client-interface.cjs` — copies the runtime web app files into a sibling backend/client-interface target directory. It is a packaging/install script used to prepare a client interface bundle for a backend deployment or local integration target.

- `test-upload-consent-post.cjs` — sends a multipart upload request that mirrors the app's consented clip upload flow. It is a local debugging aid for checking the backend upload endpoint, payload shape, and consent metadata without needing to trigger the browser UI.

- `update-coverage-badge.js` — refreshes the coverage badge block in the main `README.md` using the latest Vitest JSON report. It updates only the badge section and leaves the surrounding documentation intact.

- `validate-plugin.js` — validates a Ghostyle plugin file against the expected framework contract. It checks for the required `==Ghostyle==` header metadata, required exports such as `onDraw` or `paintUV`, and flags risky patterns like direct landmark indexing or async `onDraw` logic.

## Typical maintenance workflow

This folder supports the repo's operational lifecycle:

- generate architecture views and map the codebase,
- validate plugin compliance,
- update generated branding assets,
- export text for review,
- refresh coverage metadata,
- and prepare outputs for backend/client deployment.

In short, `scripts-dev/` is the operational support layer behind the app: it turns source files, translations, and generated assets into maintainable, reviewable, and deployable outputs.

