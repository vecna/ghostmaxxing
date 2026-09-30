# SEO and dissemination decisions

This note records the SEO implementation decisions, the source files that own
them, and what the generated site should contain. It follows the
`MILESTONE-seo-dissemination.md` brief: build a consistent search identity for
the distinctive name Ghostmaxxing, make the existing pages shareable, describe
each page with appropriate structured data, and make the crawler-facing files
part of the deployable site.

SEO metadata helps crawlers and social preview services understand the pages;
it does not guarantee ranking, rich results, or an accurate preview on every
platform. The project should describe experiments as conditional observations,
not promise that makeup or software defeats surveillance.

## Decisions

### One canonical site identity

`package.json` already declares `https://ghostmaxxing.vecna.eu/` as the
homepage, and the existing `robots.txt`, sitemap, and several pages use that
domain. The SEO metadata therefore uses it as the canonical origin; no new
domain was invented. Each indexable page points its canonical URL at its
preferred route, including directory routes such as `/projects/` and
`/references/`.

Titles use the pattern `Page — Ghostmaxxing`. The page name comes first so
search results and shared links identify what a visitor will see, while the
consistent project name consolidates the spelling and identity. Descriptions
and page titles pair the distinctive project name with findable subjects such
as face-recognition camouflage, adversarial makeup, face-recognition testing,
and computer vision.

### Social previews use a supported image

The pages use the existing
`images/social/ghostmaxxing-generic.jpg`, an absolute JPEG URL with the
1200×630 dimensions recorded in `images/social/cards-manifest.json`. This
choice is intentional: a public preview should name a fetchable image format
and dimensions, rather than rely on relative paths or assume that every
preview crawler handles the older SVG card. Open Graph and Twitter metadata
include a page title, description, canonical page URL where applicable, image,
and image alt text.

### JSON-LD describes the actual page and its source data

Each HTML page has one JSON-LD block with the Schema.org context, a page-
appropriate type, and publisher information for **NINA / Universal Digital
Union**. Page types follow the milestone where they fit:

- Homepage: `WebSite`, `Organization`, and `SoftwareApplication`. The app
  retains its historical alternate name `Ghòstati`, free offer, web platform,
  AGPL licence, repository, and feature descriptions.
- Lab: `WebApplication`, including browser requirements and local experiment
  features.
- About: `AboutPage` and the Ghostmaxxing project organization. Claudio Agosti
  is identified as founder based on the page's existing attribution.
- Report: `WebPage` and a `ContactPoint` for the separate NINA-operated
  GlobaLeaks submission node. The structured description expressly avoids
  implying that Ghostmaxxing itself operates that whistleblowing service.
- Genealogy: `CollectionPage` and an `ItemList` of the displayed archive marks.
- Projects and references: `CollectionPage` plus an `ItemList` generated from
  the underlying JSON catalogues. Research references use
  `ScholarlyArticle`; artistic and activism entries use `CreativeWork` rather
  than incorrectly labelling every archive item a scholarly paper.
- Functional documentation and generated API documentation: `TechArticle`.
  Other public and utility pages use suitable `WebPage` or `CollectionPage`
  descriptions.

The brief mentions `foundingLocation` and `memberOf` for the About page, but
those facts are not established by the page's copy, so they are not asserted.
Likewise, the Fediverse page describes actor handles and feeds, but no
independently verified actor profile URLs are available for `sameAs`; the page
does not fabricate them. The about copy calls Ghostmaxxing standalone while
NINA organizes whistleblowing processing and workshops, so publisher and
project are represented separately.

### Edit durable sources, not generated page output

The project, reference, and genealogy pages are rebuilt from their respective
inputs. SEO content is therefore added to their templates or generators, not
only to the generated HTML. The functional docs have a shared HTML shell in
their builder. The JSDoc theme has no configured site-shell template here, so
`enrich-jsdoc-seo.cjs` adds metadata immediately after JSDoc emits its HTML;
the enrichment is part of the `docs` command and is repeatable after a clean
rebuild.

## Source and file impacts

| Files | Responsibility |
|---|---|
| `index.html`, `about.html`, `lab.html`, `report.html`, `fediverse.html`, `workshops.html`, `loader.html`, `visual-styleguide.html` | Authored page titles, descriptions, canonical URLs, share-preview metadata, and page-level JSON-LD. The styleguide is explicitly `noindex, nofollow`. |
| `projects/templates/projects.template.html`, `projects/build-projects-page.js` | Durable projects-page metadata and a generated `ItemList` derived from `projects/PROJECTS.json`. |
| `references/templates/references.template.html`, `references/build-references-page.js` | Durable references-page metadata and an `ItemList` derived from `references/REFERENCES.json`, with research entries typed as `ScholarlyArticle`. |
| `scripts-dev/build-genealogy.py` | Generates genealogy metadata and JSON-LD from the same reference/project marks used in the chart. `genealogy.html` is an output, not the editing source. |
| `docs-src/en/pages.json`, `scripts-dev/build-functional-docs.cjs` | Page titles and descriptions, canonical routes, previews, and `TechArticle` data for functional docs. Generated `docs/` files should not be manually patched. |
| `scripts-dev/enrich-jsdoc-seo.cjs`, `package.json` | Adds SEO metadata after JSDoc generation. `docs`, and therefore `docs:rebuild`, run the enrichment step. |
| `codemap/codemap-template.html`, `scripts-dev/build-codemap-html.js` | Durable metadata for the generated, standalone code-map viewer. |
| `web-files/sitemap.xml`, `web-files/robots.txt` | Crawler-facing sitemap and its declared location. These files are deployment sources, not root-level files in this repository. |
| `scripts-dev/check-seo.cjs`, `package.json` | Checks required metadata, JSON-LD parsing and types, publisher identity, generated list counts, social-image properties, sitemap coverage, and robots-to-sitemap linkage. |
| `scripts-dev/README.md`, `images/social/FOLDER-DESCRIPTION.md` | Documents rebuild/install behavior and the social-card image role. |

`loader.html` has a localized document title. Its English, Italian, and
Portuguese values live in `lab-js/i18n.js`; keep the page-name-first title
pattern when changing those translations.

## Build and install behavior

From the repository root:

```sh
npm run docs:functional
npm run docs:rebuild
npm run update:projects
npm run update:references
npm run update:genealogy
npm run codemap
npm run check:seo
```

`npm run htmls` runs the generated-page steps, coverage, and SEO checks.
`npm run htmls:install` does the same, then invokes
`scripts-dev/install-client-interface.cjs`. That installer first clears
`../gstmxx-backend/client-interface/`; do not run it unless replacing that
sibling deployment directory is intended. It copies all root-level `.html`
files, including authored pages and generated `genealogy.html`, then copies
allow-listed directories such as `docs/`, `projects/`, and `references/`.
Crawler files from `web-files/` are copied to the deployed root via
`COPY_WEB_FILES`. If another root-served crawler file is introduced, add it
there too. There is no need to add normal page HTML files to the installer
allowlist because it discovers root-level HTML files automatically.

The sitemap currently lists the homepage, the public editorial/tool pages,
projects and references collections, genealogy, and selected public
documentation routes. It intentionally does not list internal utilities such
as the code map or the noindex visual styleguide. `/api/` and `/federation/`
remain excluded. `robots.txt` points at the canonical root sitemap.

## Expected result

For every page covered by `npm run check:seo`, the rendered HTML `<head>`
should contain:

1. One descriptive title ending in `— Ghostmaxxing`, and one non-empty
   description.
2. An absolute canonical URL on `https://ghostmaxxing.vecna.eu/`.
3. Open Graph title, description, page type, URL, and an absolute
   `image/jpeg` preview at
   `https://ghostmaxxing.vecna.eu/images/social/ghostmaxxing-generic.jpg`,
   declared as 1200×630 with alternative text.
4. A Twitter summary-large-image card using the same title, description,
   image, and alternative text.
5. Exactly one parseable Schema.org JSON-LD block, using the right page type
   and identifying NINA / Universal Digital Union as publisher.

Generated collection markup should match its data: the project list has one
entry per project, the reference list one per reference, and genealogy one
entry per chart mark. The JSON-LD count must equal the number of list items.
The sitemap should be well-formed XML, point only at intended public routes,
and contain the homepage, lab, about, report, collections, genealogy, and
functional docs routes.

`npm run check:seo` checks the current generated pages locally. It does not
call schema.org's remote validator or guarantee how a third-party crawler
renders a preview. Before launch, validate representative URLs with the
Schema Markup Validator and social preview debuggers after deployment, submit
the sitemap to Search Console, and verify the image can be fetched publicly.

During this implementation, the SEO check passed for 98 HTML pages and 19
sitemap URLs, and the sitemap parsed as XML. JSDoc, functional docs, projects,
references, genealogy, and the code map all rebuilt. The full unit-test run
also exposed an unrelated failure in `tests/unit/mark-ai-images.test.js`
(`Missing colour token --gm-bg`); its other reported tests passed. Since
`htmls` and `htmls:install` run coverage tests before the SEO check, resolve
that independent failure if it still occurs before expecting either full
pipeline to reach its final steps.

## References

- User-provided `MILESTONE-seo-dissemination.md` (Obsidian Vault): strategy,
  per-page structured-data guidance, crawler files, share previews, naming,
  and dissemination scope.
- Project deployment identity: `package.json` (`homepage`); crawler policy
  and routes: `web-files/robots.txt`, `web-files/sitemap.xml`.
- Open Graph protocol: <https://ogp.me/>.
- Schema.org type references: <https://schema.org/WebSite>,
  <https://schema.org/SoftwareApplication>,
  <https://schema.org/WebApplication>,
  <https://schema.org/AboutPage>,
  <https://schema.org/CollectionPage>,
  <https://schema.org/TechArticle>,
  <https://schema.org/ScholarlyArticle>,
  <https://schema.org/ContactPoint>.
- Google structured-data policies: <https://developers.google.com/search/docs/appearance/structured-data/sd-policies>.
- Sitemaps protocol: <https://www.sitemaps.org/protocol.html>.
