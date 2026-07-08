# Translation Maintenance

Ghostmaxxing keeps its runtime translation catalog in `scripts/i18n.js`.

English is the source baseline and default locale. Italian is still included as
the original app language, but it is no longer the baseline used for gettext
`msgid` values or browser fallback behavior.

## Source Format

Each message entry in `scripts/i18n.js` should include:

- `context`: source file and line, using `file:line`.
- `en`: English source string and gettext `msgid`.
- `it`: Italian translation, preserving old Italian UI copy exactly when it was already present.
- `pt`: Portuguese translation.
- `notes`: optional glossary or translator guidance.

Keys must stay lowercase with underscores, for example `face_saved_status`.

## When Adding A New String

1. Add the string to `messages` in `scripts/i18n.js`.
2. Write the English copy first, because English is the baseline.
3. Add Italian and Portuguese translations in the same entry.
4. Add `context` with the best source reference, for example `scripts/main.js:120`.
5. Add `notes` if the string contains a technical term, product term, or ambiguous wording.
6. Replace the hardcoded UI/log/console string with `t('your_key')` in JavaScript, or add `data-i18n="your_key"` / `data-i18n-title="your_key"` / `data-i18n-aria-label="your_key"` / `data-i18n-alt="your_key"` in HTML.
7. Run:

   ```sh
   npm run i18n:extract
   ```

8. Review the updated `translations/ghostmaxxing.pot` and `translations/ghostmaxxing-summary.csv`.
9. Run the relevant tests before shipping.

## When Adding A New Language

1. Choose the locale code, using the short browser language code when possible, for example `fr` or `de`.
2. Add the locale code to `supportedLocales` in `scripts/i18n.js`.
3. Add the native language name to `localeNames`, for example `fr: 'Français'`.
4. Add a flag or compact visual identifier to `localeFlags`.
5. Add the new locale field to every entry in `messages`.
6. Make sure `normalizeLocale()` can resolve browser variants correctly, for example `pt-BR` to `pt`.
7. Run:

   ```sh
   npm run i18n:extract
   ```

8. Upload the refreshed `translations/ghostmaxxing.pot` to Crowdin.
9. Export/import completed Crowdin translations back into `scripts/i18n.js` or the future build pipeline.
10. Test the language selector in both `index.html` and `lab.html`.

## Language Selection Persistence

The language selector is shared by the homepage and the lab.

1. `index.html` loads `scripts/home.js`.
2. `lab.html` loads the main lab JavaScript, which also initializes i18n.
3. Both pages call `setupLocaleSelect()` from `scripts/i18n.js`.
4. When a user selects a language, `setLocale()` saves the selected locale in browser `localStorage`.
5. The storage key is `ghostmaxxing-locale`, exported as `LOCALE_STORAGE_KEY` in `scripts/i18n.js`.
6. When `lab.html` opens later, `scripts/i18n.js` reads `ghostmaxxing-locale` and applies the same language.
7. If no saved language exists, Ghostmaxxing tries the browser language.
8. If the browser language is unsupported, Ghostmaxxing falls back to English.

This means a user can choose `Italiano` on `index.html`, click into the lab, and
`lab.html` will open in Italian because both pages share the same origin-level
`localStorage` value.

## Extraction Workflow

Run:

```sh
npm run i18n:extract
```

This custom Node.js extractor reads `scripts/i18n.js` and generates:

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
