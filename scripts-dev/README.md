# Maintainer scripts

`scripts-dev/` is the operational support layer for Ghostmaxxing. These files are not loaded by the public interfaces. They generate documentation and architecture views, capture screenshots, validate Ghostyles, export copy and source bundles, update assets, test one backend contract, and prepare a client directory.

Run commands from the repository root unless a section says otherwise. Review generated diffs. Script success establishes only the checks described here.

## Task index

| Task | Command | Writes or affects |
|---|---|---|
| Build functional documentation | `npm run docs:functional` | `docs/` pages and `docs.html` |
| Capture functional screenshots | `npm run docs:screenshots -- --locale en,it` | `docs/assets/screenshots/` |
| Build generated API reference | `npm run docs` | `docs/jsdoc/` |
| Clean and rebuild API reference | `npm run docs:rebuild` | Deletes and recreates `docs/jsdoc/` |
| Build both documentation layers | `npm run docs:all` | Functional pages, then `docs/jsdoc/` |
| Validate one Ghostyle | `npm run validate:ghostyle -- ghostyles/brush.js` | Standard output only |
| Validate all Ghostyles | `npm run validate:ghostyles` | Standard output; stops on failure |
| Build code map and viewer | `npm run codemap` | `codemap/codemap.json` and `.html` |
| Extract interface translations | `npm run i18n:extract` | Files under `translations/` |
| Extract reviewable public copy | `node scripts-dev/extract-text-only.js` | Dated Markdown report |
| Export a focused source bundle | `npm run c2p -- c2p:lab` | Dated text bundle |
| Refresh the coverage badge | `npm run update:coverage-badge` | Badge block in `README.md` |
| Run fast repository checks | `npm run check` | Validation and unit-test output |

## Functional documentation

Source: `scripts-dev/build-functional-docs.cjs`.

The source index is `docs-src/en/pages.json`. Each page points to a body fragment in the same directory and an output under `docs/`. The builder supplies the shared site header, documentation navigation, footer, metadata, and stylesheet links.

```sh
npm run docs:functional
```

The command overwrites its declared HTML outputs and `docs.html`. It does not remove other files from `docs/`, translate prose, capture screenshots, or generate JSDoc. `docs.html` is a compatibility redirect to `/docs/`.

Edit the body fragments, not generated functional HTML. Keep the URL set stable when a translation track is added. Screenshots use locale-specific paths under `docs/assets/screenshots/<locale>/<viewport>/`.

## Screenshot capture

Source: `scripts-dev/capture-doc-screenshots.cjs`.

```sh
npm run docs:screenshots
npm run docs:screenshots -- --locale en,it --loader-time 3
npm run docs:screenshots -- --only lab --viewport desktop --headed
npm run docs:screenshots -- --include-brush
```

The script starts a local static server unless `--base-url` is supplied. It drives the released Lab, Video Loader, and Ghostyle Transfer interfaces with Playwright and writes stable PNGs, `manifest.json`, and a Markdown index.

Required fixtures:

- `tests/fixtures/mock-face.y4m` for Chromium's fake webcam;
- `tests/fixtures/my-moving-face.mp4` for the Video Loader.

Optional Transfer result fixtures:

- `tests/fixtures/docs-transfer/before.jpg`;
- `tests/fixtures/docs-transfer/after.jpg`;
- `tests/fixtures/docs-transfer/target.jpg`.

Each manifest entry records pixel dimensions, aspect ratio, file size, capture crop, source viewport, locale, and state provenance. Transfer result capture is skipped when the image trio is absent. Face Brush is excluded by default.

Stable screenshot filenames are overwritten. Inspect every image and its provenance before publishing. Do not use the synthetic full-screen Escaped state as observed evidence. A definitive comparison needs separate controlled clean and physically painted inputs. The current broad scripted Brush strokes also remain outside the public guide until replaced by smaller paths derived from the 68-point face-api landmarks.

## Generated API documentation

JSDoc itself is configured outside this folder in `jsdoc.clean.json`.

```sh
npm run docs
npm run docs:rebuild
```

`docs:clean` recursively removes only `docs/jsdoc/`. `docs:rebuild` then generates the technical reference from `JSDOC_index.md`, tutorials, and source comments. The functional pages and screenshot assets must survive this operation.

After a change, inspect the technical home, one affected module, tutorial links, and links back to the functional documentation.

## Ghostyle validation

Source: `scripts-dev/validate-plugin.js`.

```sh
npm run validate:ghostyle -- ghostyles/brush.js
npm run validate-plugin -- ghostyles/brush.js
npm run validate:ghostyles
```

The first two forms validate one file. The final command sorts top-level JavaScript files in `ghostyles/` and validates them sequentially. A failure stops the loop, so later files may remain unchecked.

The validator reads source without executing it. It checks the Ghostyle header delimiters, `@name`, `@description`, and a supported function export in the exact forms it recognises. It format-checks `@release_date` when present and warns about selected risky patterns such as asynchronous `onDraw`, direct landmark indexing, or setup without cleanup.

These are regular-expression checks, not full static analysis. Passing validation does not establish the complete metadata policy documented in `JSDOC_index.md`.

## Code map

Sources: `scripts-dev/build-codemap.js` and `scripts-dev/build-codemap-html.js`.

```sh
npm run codemap
node scripts-dev/build-codemap.js --out /tmp/ghostmaxxing-codemap.json
node scripts-dev/build-codemap-html.js /tmp/ghostmaxxing-codemap.json /tmp/ghostmaxxing-codemap.html
```

The extractor parses top-level `lab-js/*.js` and root HTML entries. It records imports, exports, selected events, DOM listeners, dynamic import expressions, and selected window assignments. It does not recursively index every repository module and is not a runtime trace.

Known limitation: page entry IDs and module IDs may retain different path forms, which can leave reachability associations empty. A module parse failure is recorded rather than necessarily failing the complete run. Inspect `parseError` values and the rendered viewer.

The HTML wrapper replaces the literal template marker with the JSON map. Confirm that replacement occurred.

## Translation extraction

Source: `scripts-dev/extract-i18n-pot.cjs`.

```sh
npm run i18n:extract
```

The script reads the literal `messages` export in `lab-js/i18n.js`, evaluates the extracted object, and overwrites:

- `translations/ghostmaxxing.pot`;
- `translations/ghostmaxxing-summary.csv`.

The summary uses a pipe delimiter despite its `.csv` suffix. This command extracts interface strings only. Functional documentation prose needs a separate translation workflow and matching locale source tree.

## Public-copy extraction

Source: `scripts-dev/extract-text-only.js`.

```sh
node scripts-dev/extract-text-only.js
node scripts-dev/extract-text-only.js --out /tmp/ghostmaxxing-copy.md
```

The extractor reads selected public pages, discovers functional HTML below `docs/` while excluding `docs/jsdoc/` and assets, and includes structured camera facts. The report contains source line numbers and approximate locator hints for text, metadata, alt text, ARIA labels, titles, placeholders, and descriptions.

It is not a browser or full HTML parser. Runtime text, skipped SVG text, entity handling, and selector context can be incomplete. Generate pages before extraction.

## Prompt bundles

Source: `scripts-dev/code2prompt.js`.

```sh
npm run c2p -- --help
npm run c2p -- c2p:lab
npm run c2p -- c2p:copy --output /tmp/ghostmaxxing-copy-context.txt
```

Namespaces cover design, runtime, tests, copy, repository map, and a broad filtered snapshot. The wrapper requires a separate `code2prompt` executable on `PATH`. It prints an estimated tree, then runs the external command.

The include and exclude arrays in the script are the source of truth. An estimated tree and the external tool's final selection can differ. A broad export is not a backup. Functional docs source and `JSDOC_index.md` are included in copy-oriented context; generated `docs/` remains excluded.

## Coverage badge

Source: `scripts-dev/update-coverage-badge.js`.

```sh
npm run test:coverage && npm run update:coverage-badge
```

The script reads `coverage/coverage-final.json`, computes statement coverage, and rewrites only the marked badge block in `README.md`. Missing or empty coverage can still produce an `UNKNOWN` badge. Check report freshness and the rendered percentage.

## Backend client packaging

Source: `scripts-dev/install-client-interface.cjs`.

This is the destructive support script. It recursively clears the fixed sibling path `../gstmxx-backend/client-interface/`, creates a new `.keep`, then copies selected root HTML, web files, and runtime directories. It has no destination option or dry run.

Resolve and inspect the exact destination before running:

```sh
npm run update:references && npm run docs:all && npm run codemap && node scripts-dev/install-client-interface.cjs
```

The `web-client-setup` npm command chains reference generation, both documentation layers, and installation with `&&`. Keep that fail-fast behaviour when adding another required stage.

Missing sources are logged as `skip missing` and do not fail the installer. A successful copy is not proof that all generated assets are current.

## Upload integration probe

Source: `scripts-dev/test-upload-consent-post.cjs`.

This script performs an actual multipart POST. It is not a dry run, does not drive the browser consent UI, has no automatic deletion, and prints the deletion token returned by the server.

Required environment variables are `UPLOAD_ENDPOINT`, `CLIP_PATH`, `CONSENT_VERSION`, and `APP_VERSION`. Optional values include filename, MIME type, kind, Ghostyle ID, user note, and metrics JSON.

```sh
UPLOAD_ENDPOINT='http://localhost:3000/api/uploads' \
CLIP_PATH='./tmp/test-clip.mp4' \
CONSENT_VERSION='replace-with-current-version' \
APP_VERSION='1.0.0' \
node scripts-dev/test-upload-consent-post.cjs
```

Use a deliberate test clip and keep returned tokens out of public logs. Endpoint acceptance does not prove consent UX, moderation, revocation, or deletion.

## Logo generation

Source: `scripts-dev/build-logo.py`.

```sh
python3 scripts-dev/build-logo.py
```

The script writes named SVG logo variants and, when CairoSVG and its native dependencies are available, PNG icons. Existing files with those names are overwritten. A missing CairoSVG import skips PNG output without making SVG generation fail, so raster files can become stale.

Before running it, reconcile the generator's geometry with the current visual direction. Also reconcile its root-level Apple touch icon output with the installer's `web-files/apple-touch-icon.png` input.

## Release-oriented check

No one command is the complete release check. Select the relevant steps:

1. validate Ghostyles and inspect warnings;
2. run unit and end-to-end tests;
3. regenerate functional docs, JSDoc, references, screenshots, and codemap when their sources changed;
4. extract and review public copy and translations separately;
5. open every released interface plus representative functional and API pages through the deployment-style server;
6. prepare the client target only after generation succeeds;
7. inspect missing-file logs and the packaged directory before deployment.

When a script changes, update this guide and `FOLDER-DESCRIPTION.md` with its command, inputs, outputs, overwrite behaviour, and failure conditions.
