# Development and maintenance scripts

Version 1.0 · 4 September 2026

This guide describes development and maintenance scripts, together with the relevant commands in `package.json`.

Run the commands below from the `ghostmaxxing` repository root. Most scripts resolve project paths from their own location; the text extractor, prompt exporter and relative input arguments depend on the working directory.

## Choose a task

| Task | Command | Output or effect |
|---|---|---|
| Visibly mark synthetic images | `node scripts-dev/mark-ai-images.cjs --size 15%` | Overwrites unmarked JPEG/PNG fixtures; skips existing badges |
| Validate one Ghostyle | `npm run validate:ghostyle -- ghostyles/brush.js` | Errors and warnings on stdout |
| Validate all Ghostyles | `npm run validate:ghostyles` | Stops when a file fails validation |
| Generate API documentation | `npm run docs` | JSDoc output; configuration is `jsdoc.clean.json` |
| Rebuild API documentation | `npm run docs:rebuild` | Deletes `docs/jsdoc/`, then runs JSDoc |
| Validate complementary projects | `npm run validate:projects` | Checks JSON, URLs, categories and local images |
| Build complementary projects | `npm run update:projects` | Overwrites `projects/index.html` |
| Redraw the genealogy chart | `npm run update:genealogy` | Overwrites `genealogy.html` and `styles/genealogy.css` (needs `python3`) |
| Put a photograph through the lab | `node scripts-dev/lab-capture.cjs render --image <file>` | Cropped PNG or JPEG in `scratch/story/`, numbers on stdout (needs `ffmpeg`) |
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

Install the repository's development dependencies using its normal locked dependency workflow. `npm ci` uses the committed `package-lock.json`. The image marker uses the existing `canvas` development dependency and the committed Atkinson Bold TTF; it downloads no fonts.

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
npm run validate:projects
npm run update:projects
npm run update:references
npm run update:genealogy
```

`docs` runs `jsdoc -c jsdoc.clean.json`. The supplied technical index identifies `JSDOC_index.md` as the generated home and `docs/jsdoc/` as the output location; check the actual configuration when changing either.

`docs:clean` recursively removes `docs/jsdoc/`. `docs:rebuild` runs cleanup and generation with `&&`. The hand-authored `docs/index.html` survives this cleanup. Edit source comments, tutorial sources and the home Markdown rather than generated JSDoc HTML.

`validate:projects` checks `projects/PROJECTS.json`, its single primary strategy per entry, absolute URLs, duplicate identifiers, image metadata, and the presence of every local image under `images/projects/`. `update:projects` validates first and then fills `projects/templates/projects.template.html`, overwriting `projects/index.html`. It never downloads media or establishes permission to republish third-party images. Follow `projects/CONTRIBUTING-PROJECTS.md` when adding an entry.

`update:references` runs `references/build-references-page.js`, which validates `references/REFERENCES.json` and fills `references/templates/references.template.html`, overwriting `references/index.html`. The references dataset remains the larger cultural and technical archive; do not move papers or articles into the complementary-project catalogue merely because they describe a possible intervention.

## Pick a picture for the homepage story

```sh
node scripts-dev/lab-capture.cjs render --image shots/candidate.jpg \
  --ghostyle cv-dazzle-1 --layers box,ghostyle
```

`render` is the picture-picking tool. `measure` runs the built fixtures and reports numbers; `render` takes any still, turns it into a fake webcam feed with `ffmpeg`, opens the lab against it, turns on the layers you asked for, and writes a cropped image you can drop into a page.

The clean pass and the Ghostyle pass are **the same frame**. A Ghostyle is an overlay drawn on the video, so nobody has to hold a pose between two photographs: crop, light, distance and expression are identical by construction and the only thing that differs is the thing being tested. That is what makes two cards comparable, and it is why the story carousel does not need a photographer.

| Option | Meaning |
|---|---|
| `--image <file>` | Any JPEG or PNG with one frontal face. Required. |
| `--ghostyle <id>` | An id from `ghostyles.json`. Omitted, only the clean pass is written. |
| `--layers <list>` | From `none`, `box`, `landmarks`, `mesh`, `ghostyle`. Default `box`. `landmarks` is the box plus the face-api 68-point scaffold, which is the "recognised" look. |

For a card that shows a Ghostyle, pass `--layers ghostyle` on its own. That keeps the lab in its Camera view, which is where the effect is painted; the clean pass of the same run still comes back carrying the detection scaffold, so one command gives you both the "this face is being read" picture and the "this is the pattern on it" picture. Adding `box` or `landmarks` moves the lab into a points view, where the overlay canvas is given over to the scaffold and the pattern does not appear.
| `--pad <n>` | Crop padding as a fraction of the face box, default `0.6`. A fraction rather than a pixel count, so the head fills the same share of every card whatever the source resolution. |
| `--aspect <w:h>` | Crop aspect, default `4:5`. |
| `--width <px>` | Output width, default `1024`. |
| `--name <stem>` | Output file stem, default the image file name. |
| `--no-measure` | Skip saving a baseline and reading the distance. |
| `--output <path>` | Destination, default `scratch/story/`. |

It writes images and prints numbers, and it writes no data file. The numbers are for choosing between candidates; the ones you publish are typed into the page by hand, because the story cards are chosen rather than generated. If face-api finds no face it stops and says so rather than writing an unannotated picture.

`update:genealogy` runs `scripts-dev/build-genealogy.py` (Python 3, standard library only). It reads `references/REFERENCES.json` and `projects/PROJECTS.json`, places every reference and every project on the genealogy chart by year and by the row its `target` tags select, and overwrites `genealogy.html` and `styles/genealogy.css`. It stops with a message when an entry carries a target the row table does not know, so run it after adding to either dataset. The row table and the access-to-kind mapping for projects live at the top of the script.

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

The script reads the literal `messages` export in `lab-js/i18n.js`, evaluates the extracted object, and overwrites:

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

Input paths are relative to the current working directory. The fixed page list includes the homepage, About, reporting, workshops, genealogy, Lab, Loader, realtime, `docs/index.html` and `references/index.html`. It also reads `data/camera-facts.json`. Missing files are silently skipped.

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

## Capture lab screenshots and measure recognition distance

Sources: `scripts-dev/build-face-fixtures.cjs`, `scripts-dev/lab-capture.cjs`.

These two scripts run `lab.html` in a headless browser with a synthetic face in
place of the webcam. They exist for two jobs: producing the workshop
screenshots without pointing a camera at a real person, and measuring how far a
painted face moves from its own saved identity.

Both are development tools. They write nothing that ships, apart from the
images you ask for.

### Requirements

- The repository's development dependencies (`npm install`). Playwright is
  already declared for the end-to-end tests, so no extra install is needed.
- A Chromium build. The scripts look for `/opt/pw-browsers/chromium`, then the
  usual system paths, and otherwise fall back to Playwright's own browser. If
  none is present, run `npm run prepare:e2e` once.
- `ffmpeg` on `PATH`, for the fixture builder only.

No server needs to be running. Both scripts start a static server on a free
port and stop it at the end. Pass `--base-url http://localhost:8080` to use one
you already have.

### Step 1: build the fake-webcam fixtures

Chromium can replace the camera with a raw Y4M file. The builder turns each
`figureN-clean` / `figureN-painted` pair in `tests/fixtures/synthetic-faces/`
into three clips in `tests/fixtures/synthetic-faces/y4m/`:

| File | Contents | Used by |
|---|---|---|
| `figureN-clean.y4m` | the bare face, 6 seconds | `shots` |
| `figureN-painted.y4m` | the same face with the makeup, 10 seconds | `shots` |
| `figureN-pair.y4m` | clean then painted, concatenated | `measure` |

```sh
node scripts-dev/build-face-fixtures.cjs --figure 9,10
node scripts-dev/build-face-fixtures.cjs --figure all --force
```

The pair file is the one that matters. The lab saves an identity while the
clean segment is on screen, then reports the distance as the painted segment
arrives, which is exactly what a participant does with their own face.

Output is roughly 7 MB per second at 640x480, so a pair is about 105 MB. The
folder is git-ignored. `--size 320x240` cuts it to a quarter if disk is tight,
at the cost of comparability with earlier runs.

Other options: `--fps`, `--clean-seconds`, `--painted-seconds`,
`--face-height`, `--background`, `--source`, `--output`, `--pair-only`,
`--force`. `--help` lists them.

### Step 2: measure

```sh
node scripts-dev/lab-capture.cjs measure --figure 9,10
node scripts-dev/lab-capture.cjs measure --figure all
```

For each figure the script waits for the first detection, clicks Save, then
reads `#gm-num`, `#gm-thr` and `#gm-state` six times across the painted
segment. It prints a table and writes
`tests/fixtures/synthetic-faces/lab-measurements.json` with every individual
reading.

Read the result as follows. `min` is normally 0.00, the distance of the clean
face against the identity it just saved. `peak` is the highest distance reached
while the makeup is on screen. The verdict compares `peak` against the
threshold the lab is using, `MATCH_THRESHOLD`, currently 0.58: below it the
face is still recognised, at or above it the match breaks.

Useful options: `--samples`, `--interval`, `--settle`, `--save-wait`,
`--output`, `--base-url`, `--lab`, `--headed`.

### Step 3: capture the screenshots

```sh
node scripts-dev/lab-capture.cjs shots --figure 9
```

Writes three images into `images/workshops/`:

| File | What it shows | How it is produced |
|---|---|---|
| `ws-lab-save-id.jpg` | a saved identity, readout at 0.00 | clean fixture, Save clicked |
| `ws-lab-save-id-plain.jpg` | the landmark view | the same session, `[data-view="2d"]` |
| `ws-lab-upload-consent.jpg` | the upload consent screen with a clip ready | painted fixture, Save, Record, Upload |

Options: `--output`, `--prefix`, `--format jpg|png`, `--quality`, `--record`,
`--headed`. Use `--prefix` when capturing more than one figure into the same
folder, otherwise each figure overwrites the last.

### When a capture comes back empty

```sh
node scripts-dev/lab-capture.cjs probe --figure 9 --variant clean
```

`probe` prints the video track dimensions, whether `window.gstmxx` is present,
the readout and the last twenty console lines. The usual causes are a fixture
that was never built, a face the detector cannot find at that scale (raise
`--face-height`), and a missing WebGL backend.

### One implementation note

The lab runs face-api and MediaPipe on the render loop. Under a headless
browser that starves `requestAnimationFrame`, and Playwright's own in-page
pollers stall with it: `waitForSelector` and `waitForFunction` time out on
elements that are plainly in the DOM. Every wait in `lab-capture.cjs`
therefore polls from Node with `page.evaluate`, and clicks fall back to a
direct DOM click when the actionability check cannot run. If you extend these
scripts, keep that pattern or the runs become intermittent.


## Visibly mark AI-generated fixture images

Source: `scripts-dev/mark-ai-images.cjs`. Run from the repository root:

```sh
npm ci
node scripts-dev/mark-ai-images.cjs --size 15% --dry-run
node scripts-dev/mark-ai-images.cjs --size 15%
```

The default target is `tests/fixtures/synthetic-faces/`, recursively. The default
badge width is 15% of each image's width. For a fixed width or selected images:

```sh
node scripts-dev/mark-ai-images.cjs --size 160 tests/fixtures/synthetic-faces/figure9-clean.jpeg
node scripts-dev/mark-ai-images.cjs --size 20% path/to/images
node scripts-dev/mark-ai-images.cjs --help
```

The visible bottom-right badge reads **AI Gen**, using the repository's Atkinson
Hyperlegible Bold font, orange `--gm-bg` fill and `--gm-ink` lettering/border from
`styles/tokens.css`. Its height is one third of its width; the outer margin is
1% of the shorter image dimension, with a 4px minimum. Badge width must be at
least 48px and fit the image. No EXIF, Content Credentials, hidden watermark or
sidecar is added. The label asserts that the selected files are synthetic; it
does not detect AI generation.

Before writing, the tool compares the bottom-right pixels with its badge,
allowing for JPEG compression. An existing badge is skipped even if the new
`--size` differs, leaving the file byte-for-byte unchanged. To change a badge's
size, restore the unmarked image from Git and run again. Detection recognises
this tool's current font, colours, geometry and margin: it is not OCR and cannot
guarantee recognition after cropping, rescaling, heavy compression, or a brand
style change. `SKIP`, `WOULD MARK`, `MARKED`, and `ERROR` report each file's result.

**Overwrite behaviour:** PNG remains PNG; JPEG is encoded once at quality 0.98
with chroma subsampling disabled. Dimensions stay the same. A temporary file in
the same directory is renamed over the original only after encoding succeeds.
JPEG re-encoding can alter pixels outside the badge; canvas output does not
preserve source metadata or existing provenance signatures. The badge itself
also changes test input pixels. Review the Git diff before committing fixtures.
Animated PNG and symlinks are rejected. A file error returns a nonzero exit code;
other valid files in the batch may already have been marked.

Regression checks are included in `npm run test:unit` (JPEG/PNG idempotence,
changed size, dry-run, invalid size and corrupt input).

## Rebuild social cards

```sh
node scripts-dev/build-social-cards.cjs --update-docs
```

This updates `scripts-dev/README.md`, `scripts-dev/FOLDER-DESCRIPTION.md`, and
`images/social/FOLDER-DESCRIPTION.md`. It preserves all existing text outside its
managed sections and can be run repeatedly. The ZIP deliberately does not
replace those files with the older GitHub copies, since your changes are unpushed.
The three files must already exist, as they do in the inspected repository.

## Edit and export

Edit `scripts-dev/social-cards.html`. All four cards share the same font family
and weight. The wordmark is 100px; the main copy is 78px (70px on the longer generic
card). Artwork positions, sizes, colours and text can be adjusted in that page.
The illustrations are embedded snapshots; later icon edits elsewhere will not
change them automatically. Font and stylesheet paths use the existing checkout.

To export element screenshots on your machine:

```sh
npm ci
npm run prepare:e2e
node scripts-dev/build-social-cards.cjs
```

Optional:

```sh
node scripts-dev/build-social-cards.cjs --only generic
node scripts-dev/build-social-cards.cjs --format png
node scripts-dev/build-social-cards.cjs --output /tmp/ghostmaxxing-cards
```

The script starts a temporary local server, waits for the self-hosted font,
checks dimensions and text overflow, and captures each card element. Only selected
outputs are overwritten. `cards-manifest.json` describes the latest export.
To preview manually, serve your repository and visit `/scripts-dev/social-cards.html`;
add `?card=glasses`, `pole`, `canopy`, or `generic` to show one card.

Validation: JavaScript syntax and documentation preservation/idempotence were
checked. The supplied JPEGs were rendered with a local Canvas/SVG renderer using
the same font, copy and artwork, and visually inspected. They are not Playwright
screenshots: the available browser's security policy blocked the local page.
The Playwright export path therefore remains untested here. Browser text rendering
may differ slightly from these supplied files.

## Use in link previews

The generic card is the default suggestion. Replace the existing image metadata
in each intended public page or its generating template with:

```html
<meta property="og:image" content="https://ghostmaxxing.vecna.eu/images/social/ghostmaxxing-generic.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Ghostmaxxing: test face-recognition camouflage in your browser.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://ghostmaxxing.vecna.eu/images/social/ghostmaxxing-generic.jpg">
<meta name="twitter:image:alt" content="Ghostmaxxing: test face-recognition camouflage in your browser.">
```

Use `ghostmaxxing-glasses.jpg`, `ghostmaxxing-pole.jpg`, or `ghostmaxxing-canopy.jpg`
for the other cards, with corresponding alt text. Keep page-specific titles,
descriptions, canonical URLs and `og:url` values. Replace old image tags rather
than appending competing entries. Deploy the JPEGs along with the metadata changes.
Adding these files alone does not switch existing Open Graph tags to the new cards.
No current public-page HTML is overwritten by this package.
