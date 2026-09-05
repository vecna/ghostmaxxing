# Development and maintenance scripts

Version 1.0 · 4 September 2026

This guide describes the 10 executable scripts, together with the relevant commands in `package.json`. Commands and side effects were checked against those sources. They were not run against the complete application or a backend.

Run the commands below from the `ghostmaxxing` repository root. Most scripts resolve project paths from their own location; the text extractor, prompt exporter and relative input arguments depend on the working directory.

## Choose a task

| Task | Command | Output or effect |
|---|---|---|
| Validate one Ghostyle | `npm run validate:ghostyle -- ghostyles/brush.js` | Errors and warnings on stdout |
| Validate all Ghostyles | `npm run validate:ghostyles` | Stops when a file fails validation |
| Generate API documentation | `npm run docs` | JSDoc output; configuration is `jsdoc.clean.json` |
| Rebuild API documentation | `npm run docs:rebuild` | Deletes `docs/jsdoc/`, then runs JSDoc |
| Generate a code map and viewer | `npm run codemap` | `codemap/codemap.json`, `codemap/codemap.html` |
| Export UI translations | `npm run i18n:extract` | POT and pipe-delimited CSV under `translations/` |
| Extract public copy | `node scripts-dev/extract-text-only.js` | `EXTRACTED-text-YYYY-MM-DD.md` |
| Export a focused prompt bundle | `npm run c2p -- c2p:lab` | `C2P-lab-YYYY-MM-DD.txt` |
| Update the coverage badge | `npm run update:coverage-badge` | Rewrites the badge block in `README.md` |
| Prepare the backend client directory | See the packaging sequence below | Clears and repopulates `../gstmxx-backend/client-interface/` |
| Send a test upload | See the upload tester below | Performs an HTTP POST and prints the response |
| Generate logo assets | See the logo compatibility note before running | Overwrites named SVG and PNG assets |

`FOLDER-DESCRIPTION.md` is a repository overview for source bundles. Keep it short and link to this guide for commands and operational detail.

## Dependencies

Install the repository's development dependencies using its normal locked dependency workflow. `npm ci` requires a compatible `package-lock.json`; none was included in this review.

- `package.json` declares Node `>=18`. This is the declared floor, not a verified compatibility statement for every listed dependency version.
- The upload tester uses the Node globals `fetch`, `FormData` and `Blob`.
- The code map requires `acorn` and `acorn-walk`, both declared as development dependencies.
- The prompt exporter requires a separate `code2prompt` executable on `PATH`; it is not supplied by the listed npm dependencies.
- Logo generation uses Python 3. PNG generation additionally requires CairoSVG and its working native dependencies.

## Validate Ghostyles

Source: `scripts-dev/validate-plugin.js`.

```sh
npm run validate:ghostyle -- ghostyles/brush.js
npm run validate-plugin -- ghostyles/brush.js
npm run validate:ghostyles
```

The second command is an alias for the first. The final command selects top-level `.js` files in `ghostyles/`, sorts them and validates each sequentially. A failing file aborts the run, so later files may remain unchecked.

The validator reads the selected file without executing it. It requires:

- a block delimited by `==Ghostyle==` and `==/Ghostyle==`;
- `@name` and `@description` tags;
- an exported function declared as `export function onDraw(...)` or `export function paintUV(...)`.

If a non-empty `@release_date` is present, the script checks whether JavaScript can parse it as a date. It does not enforce a strict ISO format.

Warnings cover direct `landmarks[0]` text, asynchronous `onDraw`, an `await` pattern following `onDraw`, and `onInit` without `onClear`. These are regular-expression checks: they do not prove whether a guard exists, establish precise function boundaries or validate complete JavaScript syntax. Alternative export forms can be rejected even when JavaScript permits them.

Exit status is `1` for missing input, missing files or validation errors. Warnings alone return `0`. The script writes no project files.

The broader authoring policy in `JSDOC_index.md` includes attribution, licence and stable IDs. Passing this validator does not establish compliance with every policy requirement: it does not currently require `@slug`, `@version`, `@author` or `@license`.

## Generate documentation and references

These npm tasks invoke tooling outside `scripts-dev/`, but are part of the maintenance workflow.

```sh
npm run docs
npm run docs:rebuild
npm run update:references
```

`docs` runs `jsdoc -c jsdoc.clean.json`. The supplied technical index identifies `JSDOC_index.md` as the generated home and `docs/jsdoc/` as the output location; check the actual configuration when changing either.

`docs:clean` recursively removes `docs/jsdoc/`. `docs:rebuild` runs cleanup and generation with `&&`. The hand-authored `docs/index.html` survives this cleanup. Edit source comments, tutorial sources and the home Markdown rather than generated JSDoc HTML.

`update:references` runs `references/build-references-page.js`. Its source was not supplied, so its full output contract and arguments cannot be documented here. The public reference copy identifies `REFERENCES.json` as the editorial data format; verify the builder before changing the generation workflow.

After a documentation change, inspect the home, one affected module and any changed tutorial links. The source review does not establish that every module currently appears in JSDoc.

## Generate the code map

Sources: `scripts-dev/build-codemap.js`, `scripts-dev/build-codemap-html.js`.

```sh
npm run codemap
```

This runs the extractor and, only if it succeeds, the HTML wrapper.

The extractor scans top-level `lab-js/*.js` and root-level HTML pages. It records relative imports, dynamic import expressions, exports, event dispatch/listen calls, DOM listeners and selected `window` assignments. It does not recursively index `lab-js/`, and does not scan `pages-js/`, Ghostyle implementations or maintainer scripts as modules. Dynamic imports are recorded but not traversed for reachability.

Defaults:

| Item | Path |
|---|---|
| JSON output | `codemap/codemap.json` |
| Viewer template | `codemap/codemap-template.html` |
| HTML output | `codemap/codemap.html` |

Custom paths:

```sh
node scripts-dev/build-codemap.js --out /tmp/ghostmaxxing-codemap.json
node scripts-dev/build-codemap-html.js /tmp/ghostmaxxing-codemap.json /tmp/ghostmaxxing-codemap.html
```

The output parent directory must already exist. The wrapper replaces the literal marker `/*__CODEMAP__*/ null` in the template with the JSON text. It does not check whether that marker was found.

**Known source mismatch:** module IDs are relative to `lab-js/`, such as `main.js`, but HTML entry IDs retain `lab-js/main.js`. The reachability lookup uses those strings directly. Page reachability and module-to-page associations can therefore be empty even when imports are present. Correct this mismatch before using those fields as a documentation inventory.

A module parse failure is recorded as `parseError`; it does not make the whole extraction fail. Inspect these records and the resulting viewer, rather than treating a successful process exit as proof of complete coverage. Event-bus detection is heuristic and is not a runtime trace.

## Export translation files

Source: `scripts-dev/extract-i18n-pot.cjs`.

```sh
npm run i18n:extract
```

Edit the `messages` catalog in `lab-js/i18n.js`, then regenerate:

- `translations/ghostmaxxing.pot`;
- `translations/ghostmaxxing-summary.csv`.

The English text becomes the gettext `msgid`. Context, notes, keys and Italian text are included as references/comments. The CSV columns are key, context, Italian, English and Portuguese. Its delimiter is `|`, despite the `.csv` extension.

The extractor locates the literal `export const messages = ` and the following newline plus `};`, then evaluates the extracted object in a VM context. A formatting or catalog-shape change can produce `messages export not found`, `messages object terminator not found` or an evaluation error.

The command creates `translations/` if necessary and overwrites both outputs. It does not import completed translations, call Crowdin, translate new strings or extract documentation prose. The POT header currently contains a hardcoded project version of `0.1.0`, while the supplied package declares `1.0.0`.

Review the resulting diff, string count and language columns before using the files in the translation workflow. Functional documentation needs a separate prose translation workflow.

## Extract public copy for review

Source: `scripts-dev/extract-text-only.js`.

```sh
node scripts-dev/extract-text-only.js
node scripts-dev/extract-text-only.js --out /tmp/ghostmaxxing-copy.md
```

Input paths are relative to the current working directory. The fixed page list includes the homepage, About, reporting, workshops, genealogy, Transfer, Lab, Loader, realtime, `docs/index.html` and `references/index.html`. It also reads `data/camera-facts.json`. Missing files are silently skipped.

Output is Markdown containing text, source line numbers and locator hints. The default filename uses the current UTC date. The file is overwritten if it already exists.

This is a review aid, not a DOM parser or a complete localisation audit:

- comments and entire `script`, `style`, `template`, `svg` and `noscript` elements are blanked before the main extraction;
- whole SVG elements are blanked, so their own accessible labels can be missed;
- text-node selection requires at least two characters and a letter in the Latin ranges used by the script;
- attribute matching can also pick up text inside names such as `data-i18n-aria-label`, causing translation keys to appear;
- entity decoding and selector hints are approximate;
- runtime-generated strings and unlisted pages are not exhaustively covered.

If reviewing reference copy, regenerate the reference page first because the extractor reads the generated HTML. Add new guide pages to the extraction workflow explicitly; the script does not discover them automatically.

The file header and generated report still call this script `extract-copy.js`. The actual executable in the supplied archive is `extract-text-only.js`.

## Export source bundles

Source: `scripts-dev/code2prompt.js`.

```sh
npm run c2p -- --help
npm run c2p -- c2p:lab
npm run c2p -- c2p:copy --output /tmp/ghostmaxxing-copy-context.txt
```

| Namespace argument | Intended scope | Default output prefix |
|---|---|---|
| `c2p:design` | Layout, styles, page scripts, visual assets and tutorials | `C2P-design` |
| `c2p:lab` | Browser runtime, tool HTML and Ghostyles | `C2P-lab` |
| `c2p:lab-test` | Runtime and tests | `C2P-lab-test` |
| `c2p:copy` | Brand standards, translation summary, asset descriptions and camera facts | `C2P-copy` |
| `c2p:map` | Folder descriptions, README and top-level metadata | `C2P-map` |
| `c2p:full` | Broad, filtered source snapshot | `CODE2PROMPT` |

These are arguments to `npm run c2p`, not separately declared npm commands. Default outputs append `-YYYY-MM-DD.txt`, using UTC. `--output` and `-o` choose a destination.

The script prints include/exclude rules and an estimated file tree, then invokes the external `code2prompt` CLI with `--no-ignore`. A missing CLI or failed child command produces an error. No network upload is implemented by this wrapper.

The include/exclude arrays in the script are the executable configuration. The help mentions `code2prompt-commands.md`, but the script does not read that file.

The printed inventory uses a custom glob implementation and may differ from the external CLI's selection. Check the actual exported bundle. In particular, this is not a full backup: `c2p:full` deliberately excludes several directories and tests. The common presets exclude `docs/`; even the broad preset excludes it. New functional guide sources need explicit inclusion in appropriate presets.

For editorial review, generate both the `c2p:copy` bundle and the extracted HTML text. Neither alone covers both brand standards and the visible site copy.

## Refresh the coverage badge

Source: `scripts-dev/update-coverage-badge.js`.

```sh
npm run test:coverage && npm run update:coverage-badge
```

The badge script reads `coverage/coverage-final.json`, computes statement coverage, and rewrites `README.md` around the `coverage-badge:start` and `coverage-badge:end` markers. It also removes matching older coverage badge lines, then places the updated block after the first Markdown heading.

The badge is statement coverage, not an aggregate of statements, branches, functions and lines. Colours are green at 80% or above, yellow from 50%, and red below 50%.

If the JSON is absent, invalid or has no statements, the script still updates the README using an `UNKNOWN` badge. The command's success therefore does not establish that a coverage report was generated. Check that the Vitest configuration emits the expected JSON file, and inspect the README diff. The script does not run tests or check report freshness itself.

## Prepare the backend client directory

Source: `scripts-dev/install-client-interface.cjs`.

**This script recursively clears `../gstmxx-backend/client-interface/` before copying files.** The destination is fixed relative to the source repository; there is no dry-run flag or destination argument. Use it only when that sibling directory is the intended generated client output.

For a preparation run that stops on generation failure:

```sh
npm run update:references && npm run docs:rebuild && node scripts-dev/install-client-interface.cjs
```

The existing `npm run web-client-setup` uses semicolons between those three stages. Earlier failures do not prevent later stages from running. Its final exit status can therefore conceal a failed generation stage. The command above changes the invocation sequence without changing any repository files.

The installer:

1. creates or clears the target and writes a new `.keep` file;
2. copies all root-level HTML files;
3. copies the explicit page list again;
4. copies selected `web-files/` entries to the target root;
5. recursively copies `images`, `styles`, `lab-js`, `pages-js`, `references`, `ghostyles`, `docs`, `data`, `codemap` and `coverage`;
6. copies `web-files/security.txt` to `.well-known/security.txt`.

The explicit file list also includes `ghostyles.json`. Selected web files are `CITATION.cff`, `llms.txt`, `manifest.webmanifest`, `robots.txt`, `sitemap.xml` and `apple-touch-icon.png`.

Missing sources print `skip missing` and do not fail the run. The installer does not rebuild the codemap, coverage reports or other copied generated assets. Prepare those separately if the destination must contain current versions.

Verify the target path, inspect skip messages and check representative output pages before using the prepared directory. A successful copy does not prove that every feature is present or current. This script performs local copying; it does not itself start or deploy the backend.

## Send a test upload

Source: `scripts-dev/test-upload-consent-post.cjs`.

This is an integration debugging tool. It sends the chosen video to an endpoint. It does not simulate the browser's consent interface, and setting a consent-version field is not a test of that interface.

Required environment variables:

| Variable | Meaning |
|---|---|
| `UPLOAD_ENDPOINT` | Exact backend endpoint to test |
| `CLIP_PATH` | Local video path, relative to the working directory or absolute |
| `CONSENT_VERSION` | Consent version expected by the backend |
| `APP_VERSION` | App version to include in the payload |

Optional variables:

| Variable | Default or validation |
|---|---|
| `CLIP_FILENAME` | Basename of `CLIP_PATH` |
| `CLIP_MIME_TYPE` | Inferred for MP4, WebM, MOV and MKV; otherwise `video/mp4` |
| `KIND` | `video` |
| `GHOSTYLE_ID` | Omitted when unset |
| `USER_NOTE` | Omitted when unset |
| `METRICS_JSON` | Must parse as JSON when supplied; no metrics schema validation |

Example for a local test endpoint; substitute the endpoint, fixture path and versions with those used by the test backend:

```sh
UPLOAD_ENDPOINT='http://localhost:3000/api/uploads' \
CLIP_PATH='./tmp/test-clip.mp4' \
CONSENT_VERSION='2026-07-v1' \
APP_VERSION='1.0.0' \
node scripts-dev/test-upload-consent-post.cjs
```

The example consent version comes from the script header and is not a verified current server setting.

The multipart payload includes `video`, `kind`, `consent_version`, `app_version` and any optional metadata. Success requires both an HTTP success status and a truthy `ok` field in the parsed JSON response. Missing `uploadId` or `deleteToken` fields are printed as missing but do not cause failure.

The script prints the endpoint, filename, size, selected metadata, response body and deletion token. Keep the token out of public logs and use an appropriate test clip: the endpoint receives the actual file. There is no dry run, automatic deletion, retry, explicit timeout or authentication option in this script.

Missing environment variables, invalid metrics JSON, absent clip files and rejected responses exit with status `1`. A successful POST establishes endpoint acceptance, not moderation, publication, revocation or complete browser-flow correctness.

## Generate logo assets

Source: `scripts-dev/build-logo.py`.

**Compatibility issue:** the supplied generator defines a circular lens with pink shard geometry. The supplied visual direction describes a different mark with two live lenses, a gust and a spent lens. Treat this generator as needing reconciliation before using it to refresh current brand assets.

Its actual invocation is:

```sh
python3 scripts-dev/build-logo.py
```

It has no documented command-line parameters. Geometry, colour constants and naming are embedded in the Python source. It does not read `styles/tokens.css`; the constants are only described as a mirror.

The script creates `images/logo/` if needed and writes:

- 16 SVGs: mark, small mark, horizontal lockup and stacked lockup in four variants;
- two animated SVG marks;
- with CairoSVG available, five favicon PNGs at 16, 32, 48, 180 and 512 pixels;
- a root-level `apple-touch-icon.png`;
- `images/logo/icon-maskable-512.png`.

Existing files with those names are overwritten; unrelated assets are not removed. If CairoSVG cannot be imported, the 18 SVGs are still written, PNG generation is skipped, and the script returns normally. Existing PNGs may then be stale relative to the SVGs.

The lockups use live SVG text with a font stack, not outlined glyphs. Do not treat generated SVGs as font-independent exports.

There is also a packaging mismatch: this script writes the touch icon to the repository root, while the installer reads it from `web-files/apple-touch-icon.png`. Reconcile that path as part of any generator update.

## Routine checks

The package provides the following additional commands:

| Command | Scope |
|---|---|
| `npm start` | Serves the repository on port 8080 and opens `/lab.html` |
| `npm run serve` | Serves the repository on port 8080 |
| `npm run serve:site` | Serves the repository and opens `/index.html` |
| `npm run check` | Validates Ghostyles, then runs unit tests |
| `npm run test:unit` | Runs Vitest once |
| `npm run test:unit:watch` | Starts interactive Vitest |
| `npm run prepare:e2e` | Installs Playwright Chromium |
| `npm run test:e2e` | Runs Playwright tests |
| `npm run test:e2e:ui` | Opens the Playwright test UI |
| `npm test` | Runs unit tests, then end-to-end tests |

Choose checks for the changed behaviour. `check` does not rebuild docs, verify translations, run end-to-end tests or prepare the backend client. Avoid treating any one task as a complete release procedure.

## Keep this guide current

When adding or changing a script, record its exact command, inputs, outputs, overwrite behaviour and failure conditions here. Update the task index and the short folder description. Keep executable behaviour separate from intended future behaviour, and document scripts without npm aliases as well as those exposed through `package.json`.
