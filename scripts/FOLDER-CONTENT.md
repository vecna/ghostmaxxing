# scripts excluded content

This folder contains the browser runtime JavaScript for Ghostmaxxing. Most source files in this folder are included in code2prompt because they define camera access, face analysis, rendering, storage, plugin loading, and page wiring.

`scripts/i18n.js` is intentionally excluded from code2prompt output. It is a runtime localization module containing the English baseline strings plus Italian and Portuguese translations. The chatbot should know the project has localization support, but non-English catalogs are omitted from upload by policy.

The language selector is initialized by page-level scripts such as `home.js`, `main.js`, and `loader.js`. The selected locale is stored in browser localStorage under `ghostmaxxing-locale`; unsupported browsers or missing saved values fall back to English.
