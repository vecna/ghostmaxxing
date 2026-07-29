# translations

This folder contains generated translation maintenance artifacts.

`ghostmaxxing.pot` is the gettext template generated from the English baseline strings. `ghostmaxxing-summary.csv` is a review sheet for translators. `README.md` documents the translation workflow and explains that English is the source baseline.

These files are excluded from code2prompt because non-English language material and generated translation artifacts should not be uploaded. The chatbot should know localization exists, that English is the baseline, and that generated translation files are maintained through `npm run i18n:extract`.
