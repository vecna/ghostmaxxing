# Functional documentation source

The public functional documentation is hand-authored here and generated into `docs/` by `npm run docs:functional`.

`en/pages.json` is the page index. Each record declares a body fragment, output path, page title, description, and active documentation-navigation section. Body fragments contain only the content inserted inside the shared page shell.

Do not edit generated HTML under `docs/` as the source of a lasting change.

## Documentation layers

- Functional and usability guides: `docs-src/<locale>/`, translatable.
- Technical orientation: `JSDOC_index.md`, English.
- Generated symbol reference: source JSDoc under `docs/jsdoc/`, English.
- Maintainer operations: `scripts-dev/README.md`, English.

## Translation contract

English is the first source locale. A future locale should preserve:

- the same page IDs and information hierarchy;
- the same heading fragment IDs where cross-language links depend on them;
- glossary concept IDs such as `#match-threshold` and `#matte`;
- screenshot IDs and documented state, unless a localised interface capture is intentionally substituted;
- evidence labels that distinguish observed, synthetic, and planned figures.

Translate functional prose, captions, alt text, metadata, and navigation together. The generated JSDoc reference is not part of the translation target.

## Screenshot contract

Generated images live at `docs/assets/screenshots/<locale>/<viewport>/`. The capture manifest is the source of truth for pixel dimensions, aspect ratio, capture region, viewport, and state provenance.

Do not use an injected result as evidence of an experiment. Synthetic UI states must be cropped or framed as interface illustrations and labelled in the caption. Observed before and after comparisons require controlled inputs and the actual returned measurements.
