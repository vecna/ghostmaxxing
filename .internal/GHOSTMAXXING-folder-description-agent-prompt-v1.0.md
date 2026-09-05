# Agent prompt: audit and update FOLDER-DESCRIPTION.md files

Copy the prompt below into a coding-agent session from the Ghostmaxxing repository root.

---

You are maintaining the Ghostmaxxing repository documentation.

Your task is to audit the repository's `FOLDER-DESCRIPTION.md` files and update the affected ones so they describe the code that exists now. This is a periodic documentation-maintenance task, not a request to redesign the architecture.

## Scope

1. Find every tracked `FOLDER-DESCRIPTION.md` file.
2. Inspect the corresponding directory and its immediate architectural relationships.
3. Compare the description with the current files, entry points, imports, package scripts, generated outputs, tests, fixtures, and configuration.
4. Update every description made stale by the current change set or by repository drift.
5. Create a new `FOLDER-DESCRIPTION.md` only when the repository convention clearly requires one for a substantial source directory. Do not add descriptions to generated, vendored, cache, report, or dependency directories.

## Required content

Each file should concisely explain, where applicable:

- the directory's purpose and audience;
- whether it contains runtime source, maintainer tooling, test code, fixtures, editorial source, generated output, or vendored code;
- the principal entry points and the responsibility of important files;
- the inputs and outputs owned by the directory;
- important relationships with parent or sibling directories;
- public APIs, events, manifests, schemas, or plugin contracts owned there;
- commands that operate on the directory, verified against `package.json` or the actual script;
- which files are generated and which source files must be edited instead;
- destructive, overwrite, privacy, performance, or deployment constraints that a maintainer must know;
- current limitations that are visible in the implementation.

## Accuracy rules

- Inspect source before writing. Use repository search and file contents as evidence.
- Describe current behaviour, not intended future behaviour.
- Do not invent files, commands, routes, models, events, or guarantees.
- If a feature is experimental, optional, incomplete, or unreleased, label it explicitly.
- Keep face-api identity comparison distinct from MediaPipe FaceLandmarker geometry and the experimental ImageEmbedder path.
- Keep functional documentation source, generated functional HTML, screenshot assets, and generated JSDoc output distinct.
- Treat `docs-src/` as the editable source for functional documentation.
- Treat `docs/jsdoc/` as generated output.
- Treat `docs/assets/screenshots/` as published documentation assets with a provenance manifest, even though a script captures them.
- Do not claim that an `Escaped` state proves protection, anonymity, or transfer to an external recognition system.
- Do not rewrite the project's brand voice, visual direction, or public copy unless a factual path or command is wrong.
- Preserve unrelated user changes and the existing tone of each file.
- Avoid version numbers and dates that will become stale unless the repository uses them as an explicit contract.

## Generated and excluded material

Do not document the contents of these as maintained source trees:

- `node_modules/`;
- `docs/jsdoc/`;
- JSDoc's legacy root output such as `docs/_assets/`, `docs/_islands/`, `docs/module/`, `docs/pagefind/`, and `docs/source/`;
- `coverage/`, `playwright-report/`, and `test-results/`;
- temporary prompt exports and extracted-copy reports;
- vendored model shards, WebAssembly, fonts, or minified libraries file by file.

For generated directories, document the generator, editable source, command, output location, and cleanup boundary in the nearest maintained source description.

## Procedure

1. Start with `git status --short` and preserve unrelated changes.
2. Find descriptions with `rg --files -g 'FOLDER-DESCRIPTION.md'`.
3. For every relevant directory, compare the description with `rg --files <directory>`, source headers, imports, and matching package scripts.
4. Inspect parent descriptions when a responsibility has moved between directories.
5. Apply focused edits. Do not mechanically list every insignificant file.
6. Search the updated documents for names of files that no longer exist.
7. Run documentation or code checks only when they are relevant and safe. Do not regenerate large output merely to update a description.

## Final report

Return:

1. the `FOLDER-DESCRIPTION.md` files changed or created;
2. the repository changes that made each update necessary;
3. stale claims removed or corrected;
4. descriptions inspected but left unchanged;
5. uncertainties that could not be verified from the repository;
6. checks performed.

Do not report the task as complete if a renamed script, new generator, changed output directory, new public entry point, or altered plugin contract is still absent from the relevant folder description.

---

## Suggested cadence

Run this audit after architectural changes, before a release, after moving or renaming files, and periodically during long development phases. It does not need to run after every small implementation change.
