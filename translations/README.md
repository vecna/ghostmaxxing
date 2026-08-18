# Translation Maintenance

Ghostmaxxing keeps its runtime translation catalog in `lab-js/i18n.js`.

English is the source baseline and default locale. Italian is still included as
the original app language, but it is no longer the baseline used for gettext
`msgid` values or browser fallback behavior.

## Source Format

Each message entry in `lab-js/i18n.js` should include:

- `context`: source file and line, using `file:line`.
- `en`: English source string and gettext `msgid`.
- `it`: Italian translation, preserving old Italian UI copy exactly when it was already present.
- `pt`: Portuguese translation.
- `notes`: optional glossary or translator guidance.

Keys must stay lowercase with underscores, for example `face_saved_status`.

## When Adding A New String

1. Add the string to `messages` in `lab-js/i18n.js`.
2. Write the English copy first, because English is the baseline.
3. Add Italian and Portuguese translations in the same entry.
4. Add `context` with the best source reference, for example `lab-js/main.js:120`.
5. Add `notes` if the string contains a technical term, product term, or ambiguous wording.
6. Replace the hardcoded UI/log/console string with `t('your_key')` in JavaScript, or add `data-i18n="your_key"` / `data-i18n-title="your_key"` / `data-i18n-aria-label="your_key"` / `data-i18n-alt="your_key"` / `data-i18n-content="your_key"` in HTML.
7. Run:

   ```sh
   npm run i18n:extract
   ```

8. Review the updated `translations/ghostmaxxing.pot` and `translations/ghostmaxxing-summary.csv`.
9. Run the relevant tests before shipping.

## When Adding A New Language

1. Choose the locale code, using the short browser language code when possible, for example `fr` or `de`.
2. Add the locale code to `supportedLocales` in `lab-js/i18n.js`.
3. Add the native language name to `localeNames`, for example `fr: 'Français'`.
4. Add a flag or compact visual identifier to `localeFlags`.
5. Add the new locale field to every entry in `messages`.
6. Make sure `normalizeLocale()` can resolve browser variants correctly, for example `pt-BR` to `pt`.
7. Run:

   ```sh
   npm run i18n:extract
   ```

8. Upload the refreshed `translations/ghostmaxxing.pot` to Crowdin.
9. Export/import completed Crowdin translations back into `lab-js/i18n.js` or the future build pipeline.
10. Test the language selector in `index.html`, `lab.html`, and `loader.html`.

## Language Selection Persistence

The language selector is shared by the homepage, the lab, and the video loader.

1. `index.html` loads `lab-js/home.js`.
2. `lab.html` loads the main lab JavaScript, which also initializes i18n.
3. `loader.html` loads `lab-js/loader.js`, which initializes i18n for the video-loader interface.
4. All three pages call `setupLocaleSelect()` from `lab-js/i18n.js`.
5. When a user selects a language, `setLocale()` saves the selected locale in browser `localStorage`.
6. The storage key is `ghostmaxxing-locale`, exported as `LOCALE_STORAGE_KEY` in `lab-js/i18n.js`.
7. When `lab.html` or `loader.html` opens later, `lab-js/i18n.js` reads `ghostmaxxing-locale` and applies the same language.
8. If no saved language exists, Ghostmaxxing tries the browser language.
9. If the browser language is unsupported, Ghostmaxxing falls back to English.

This means a user can choose `Italiano` on `index.html`, click into the lab or
open the video loader, and the destination page will open in Italian because
all translated pages share the same origin-level `localStorage` value.

## Extraction Workflow

Run:

```sh
npm run i18n:extract
```

This custom Node.js extractor reads `lab-js/i18n.js` and generates:

- `translations/ghostmaxxing.pot`: gettext template for Crowdin upload.
- `translations/ghostmaxxing-summary.csv`: review sheet with key, context, English, Italian, and Portuguese.

## Glossary Candidates

The current catalog flags these technical terms for Crowdin glossary entries:

- Ghostyle
- face recognition
- Web AR / AR
- baseline
- match / no match
- match threshold / recognition threshold
- 2D points
- 3D mesh
- hardcoded
- frame
- deployment
- pipeline
- face-api / face-api.js
- ImageEmbedder
- 3D recognition engine
- pinned / slot
- snapshot
- detection confidence
- diversity
