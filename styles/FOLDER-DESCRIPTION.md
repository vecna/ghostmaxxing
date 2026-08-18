# styles

This folder contains the design system and page styling for the static Ghostmaxxing site. The CSS is intentionally layered: a single shared stylesheet loads the font stack, tokens, reset, and reusable components, while individual pages add their own page-specific layout rules on top.

The architecture is described in the header comment of `styles/styles.css`: every page links the shared stylesheet first, then optionally one page stylesheet. The import order is the design system, and the CSS is not bundled at build time.

## Shared architecture

- `styles.css` — root import list. This is the main shared stylesheet the site loads on most pages. It imports the fonts, tokens, reset, and reusable component styles. It is the canonical layer-order file.
  - Included directly by: `index.html`, `genealogy.html`, `about.html`, `ghostyle-transfer.html`, `lab.html`, `loader.html`, `realtime.html`, `references/index.html`, `report.html`, `workshops.html`, `visual-styleguide.html`

- `tokens.css` — design tokens for the palette, type scale, spacing, border, and shared CSS custom properties. This is the source of the site-wide theme values.
  - Loaded by: `styles.css`

- `base.css` — global reset and baseline HTML/body rules. This is the lowest shared layer and should not know about page layout or a specific component.
  - Loaded by: `styles.css`

- `logo.css` — shared wordmark/logo styling and related brand presentation.
  - Loaded by: `styles.css`

- `cameras.css` — drawing and state rules for the camera icon fleet, iris states, and visual treatment of camera SVGs. This file is responsible for the appearance of the camera graphics, not their placement on the page.
  - Loaded by: `styles.css`

- `chrome.css` — the shared site header/footer chrome, including the common navigation structure and framing for content pages.
  - Loaded by: `styles.css`

- `prose.css` — typography and inline-link treatment for long-form content blocks, used when a page opts in to the `gm-prose` pattern.
  - Loaded by: `styles.css`

- `vendor/newsreader.css`, `vendor/atkinson.css`, `vendor/jetbrains-mono.css` — self-hosted font faces, loaded through the root stylesheet.
  - Loaded by: `styles.css`

## Page-specific styles

These files are linked directly by HTML pages and provide page layout or unique presentation.

- `index.css` — homepage-specific styling for the landing page.
  - Included by: `index.html`

- `genealogy.css` — genealogy page layout and presentation, especially the circular stamp and related visual composition.
  - Included by: `genealogy.html`

- `pages.css` — shared layout layer for content-style pages such as the editorial landing, about, report, transfer, references, workshops, and loader variants.
  - Included by: `about.html`, `ghostyle-transfer.html`, `lab.html`, `loader.html`, `references/index.html`, `report.html`, `workshops.html`

- `content-pages.css` — shared content-page styling for long-form editorial pages and generated reference pages.
  - Included by: `about.html`, `ghostyle-transfer.html`, `report.html`, `references/index.html`, `references/templates/references.template.html`, `workshops.html`

- `lab.css` — lab and live-analysis page styling; used for full-screen camera surfaces and tooling chrome.
  - Included by: `lab.html`, `realtime.html`

- `realtime.css` — realtime calibration/tracking demo styling.
  - Included by: `realtime.html`

- `loader.css` — behavior and layout for the loader/fixture-analysis page.
  - Included by: `loader.html`

- `references-list.css` — styling specific to the references list and generated reference pages.
  - Included by: `references/index.html`, `references/templates/references.template.html`

- `report-page.css` — report page-specific presentation.
  - Included by: `report.html`

## Summary of the CSS load pattern

Most pages follow this basic pattern:

- `styles.css` is the universal layer and is always linked first.
- One page stylesheet is then added only when the page needs unique layout or a page-specific composition.
- For the long-form content pages, `pages.css` and `content-pages.css` are often used together.
- For the lab UX, `lab.css` is the primary page layer and may be combined with a specific demo stylesheet such as `realtime.css`.

This makes the stylesheet folder a layered CSS system rather than a flat set of unrelated files: shared tokens and components first, page placement last, with the HTML deciding which page layer to attach.
