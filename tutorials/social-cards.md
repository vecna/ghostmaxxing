# Ghostmaxxing social cards

Extract this ZIP at the repository root. Four ready-to-use JPEG cards are included,
all 1200 × 630 pixels, using the deployed Newsreader Bold (700), orange palette,
and existing Ghostmaxxing SVG illustrations.

Then update the documentation in your current checkout:

```sh
node scripts-dev/build-social-cards.cjs --update-docs
```

This updates `scripts-dev/README.md`, `scripts-dev/FOLDER-DESCRIPTION.md`, and
`images/social/FOLDER-DESCRIPTION.md`. It preserves all existing text outside its
managed sections and can be run repeatedly. The ZIP deliberately does not
replace those files with the older GitHub copies, since your changes are unpushed.
The three files must already exist, as they do in the inspected repository.

## Edit and export

Edit `scripts-dev/social-cards.html`. All four cards share the same font family
and weight. The wordmark is 100px; the main copy is 78px (70px on the longer generic
card). Artwork positions, sizes, colours and text can be adjusted in that page.
The illustrations are embedded snapshots; later icon edits elsewhere will not
change them automatically. Font and stylesheet paths use the existing checkout.

To export element screenshots on your machine:

```sh
npm ci
npm run prepare:e2e
node scripts-dev/build-social-cards.cjs
```

Optional:

```sh
node scripts-dev/build-social-cards.cjs --only generic
node scripts-dev/build-social-cards.cjs --format png
node scripts-dev/build-social-cards.cjs --output /tmp/ghostmaxxing-cards
```

The script starts a temporary local server, waits for the self-hosted font,
checks dimensions and text overflow, and captures each card element. Only selected
outputs are overwritten. `cards-manifest.json` describes the latest export.
To preview manually, serve your repository and visit `/scripts-dev/social-cards.html`;
add `?card=glasses`, `pole`, `canopy`, or `generic` to show one card.

Validation: JavaScript syntax and documentation preservation/idempotence were
checked. The supplied JPEGs were rendered with a local Canvas/SVG renderer using
the same font, copy and artwork, and visually inspected. They are not Playwright
screenshots: the available browser's security policy blocked the local page.
The Playwright export path therefore remains untested here. Browser text rendering
may differ slightly from these supplied files.

## Use in link previews

The generic card is the default suggestion. Replace the existing image metadata
in each intended public page or its generating template with:

```html
<meta property="og:image" content="https://ghostmaxxing.vecna.eu/images/social/ghostmaxxing-generic.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Ghostmaxxing: test face-recognition camouflage in your browser.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://ghostmaxxing.vecna.eu/images/social/ghostmaxxing-generic.jpg">
<meta name="twitter:image:alt" content="Ghostmaxxing: test face-recognition camouflage in your browser.">
```

Use `ghostmaxxing-glasses.jpg`, `ghostmaxxing-pole.jpg`, or `ghostmaxxing-canopy.jpg`
for the other cards, with corresponding alt text. Keep page-specific titles,
descriptions, canonical URLs and `og:url` values. Replace old image tags rather
than appending competing entries. Deploy the JPEGs along with the metadata changes.
Adding these files alone does not switch existing Open Graph tags to the new cards.
No current public-page HTML is overwritten by this package.

## Sitemap

`sitemap.xml` replaces the root sitemap with the 17 public URLs verified from
the deployed homepage and documentation navigation on 9 September 2026. All returned
HTTP 200 and did not declare a robots `noindex` meta tag during this check.
It includes the current nested documentation routes and references page.

`workshops.html` is excluded because the live page declares `noindex`.
Generated `/docs/jsdoc/`, `/coverage/`, and `/codemap/` output is excluded from this
curated public-page sitemap, as is the new maintainer-only social-card HTML page.
No speculative `lastmod` dates are included. If Workshops becomes indexable,
add its canonical URL after removing the page's `noindex` directive.

The sitemap represents the deployed pages, not unshared local changes. Reconcile
it with any generator that normally writes your sitemap before the next build.
