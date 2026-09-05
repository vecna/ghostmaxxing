# docs-src

This folder is the editable source for Ghostmaxxing's functional documentation. It is maintainer-authored, translatable documentation rather than generated HTML.

`en/pages.json` defines page IDs, source fragments, output paths, titles, descriptions, and navigation sections. The referenced Markdown fragments provide the page bodies. `README.md` documents the translation and screenshot contracts.

Run `npm run docs:functional` to generate public pages under `docs/`; edit this directory for lasting content changes, not the generated HTML. Screenshots referenced by the documentation are published under `docs/assets/screenshots/` and are captured separately with `npm run docs:screenshots`.
