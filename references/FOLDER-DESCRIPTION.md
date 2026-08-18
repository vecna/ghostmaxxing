# references

This folder contains the curated reference dataset and the small toolkit that turns it into a static reference page.

Code2prompt includes only the source materials that are useful for chatbot review: JSON files, Markdown notes, and `templates/references.template.html`. The generated `index.html`, command-line JavaScript scripts, and prompt text are excluded.

The excluded scripts are maintenance tools. `validate-references.js` checks `REFERENCES.json` against `REFERENCES.schema.json`, required fields, enums, tags, duplicate slugs, and duplicate titles. `build-references-page.js` runs validation and fills placeholders in `templates/references.template.html` to regenerate the published reference page.

When updating references, edit `REFERENCES.json`, validate it, and regenerate the page. The generated page is not uploaded to the chatbot because the source JSON and template are the authoritative inputs.
