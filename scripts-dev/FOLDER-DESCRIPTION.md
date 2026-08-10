# scripts-dev excluded content

This folder contains development and maintenance scripts.

Most scripts are included in code2prompt because they validate Ghostyle plugins, update local badges, test upload-consent posting, or install local client helper files.

`extract-i18n-pot.cjs` is intentionally excluded because it reads the runtime localization catalog and generates translation artifacts in `translations/`. The chatbot should know this workflow exists, but non-English translation-maintenance content is represented only by this summary and `translations/FOLDER-DESCRIPTION.md`.
