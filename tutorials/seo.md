# SEO and link-preview guide

This file defines the public identity, page metadata and validation rules for Ghostmaxxing. Metadata must describe the linked page plainly. It must not make claims that the page does not support.

## Public identity

- Canonical origin: `https://ghostmaxxing.vecna.eu/`
- Project name: Ghostmaxxing
- Historical application name: Ghòstati
- Author: Claudio Agosti
- Author nickname: vecna
- Author homepage: `https://me.vecna.eu/`
- Author profile: `https://github.com/vecna`
- Source repository: `https://github.com/vecna/ghostmaxxing`

Use one stable Person node for the author:

```json
{
  "@type": "Person",
  "@id": "https://me.vecna.eu/#vecna",
  "name": "Claudio Agosti",
  "alternateName": "vecna",
  "url": "https://me.vecna.eu/",
  "sameAs": ["https://github.com/vecna", "https://retro.pizza/@vecna"]
}
```

NINA is not the publisher or owner of the full project. NINA is the organization for which vecna developed the initial concept. NINA is currently responsible for the workshops and for the separate whistleblowing/leaking platform. Reflect that limited responsibility on `workshops.html` and `report.html`; do not assign NINA as publisher of the lab, archives, documentation or other project pages.

## Titles and descriptions

Titles use `Page — Ghostmaxxing`, with the page name first. Descriptions say what the visitor will find. Prefer a short noun phrase or direct sentence. Avoid slogans, rhetorical questions, promises, superlatives and claims of protection.

Open Graph and Twitter descriptions may be shorter than the search description. They should still describe the specific page, not Ghostmaxxing in general.

Examples:

- Projects: “Clothing, makeup, masks, light and other projects aimed at computer vision.”
- References: “Research, artworks and campaigns about face-recognition camouflage.”
- Genealogy: “A timeline linking face-reading systems to documented research, artworks and projects.”

## Preview images

Preview images are absolute, fetchable 1200×630 JPEG files. Open Graph and Twitter must use the same file, dimensions, MIME type and page-specific alt text.

| Page group | Image |
|---|---|
| Default pages and documentation | `images/social/ghostmaxxing-generic.jpg` |
| Projects catalogue | `images/social/ghostmaxxing-glasses.jpg` |
| Reference archive | `images/social/ghostmaxxing-canopy.jpg` |
| Genealogy | `images/social/ghostmaxxing-pole.jpg` |
| Community gallery | `images/social/ghostmaxxing-gallery.jpg` |

The source list and generation notes live in `images/social/cards-manifest.json` and `images/social/FOLDER-DESCRIPTION.md`. New preview assets belong in `images/social/` or `images/preview/`; never overwrite an unrelated source image in `images/`. Record the source and generation method, and update `scripts-dev/check-seo.cjs` when adding a page-specific card.

## Structured data

Every indexed page has exactly one parseable Schema.org JSON-LD block.

- Homepage: `WebSite`, the author `Person`, and `SoftwareApplication`.
- Lab and loader: `WebApplication` with vecna as author.
- About: `AboutPage`, the Ghostmaxxing `Project`, and vecna as author.
- Projects, references and genealogy: `CollectionPage` and generated `ItemList`, with vecna as author.
- Gallery: `CollectionPage` with an `ImageGallery`, vecna as author, and links to the gallery RSS feed and ActivityPub actor.
- Functional and API documentation: `TechArticle`, with vecna as author.
- Workshops: `CollectionPage`, with NINA as the responsible publisher or organizer. Vecna may remain credited as the project author.
- Report: `WebPage` and `ContactPoint`, with NINA identified as operator of the separate GlobaLeaks submission service. Do not imply that Ghostmaxxing receives or operates submissions.
- Other project pages: the closest accurate page type, with vecna as author.

Research references use `ScholarlyArticle`; artistic and activist records use `CreativeWork`. Generated `ItemList.numberOfItems` must match the generated entries.

Do not add affiliations, locations, organization membership, service ownership or social profiles unless they are established facts.

## Durable sources

Edit generators and templates, then rebuild generated output.

| Output | Source |
|---|---|
| `projects/index.html` | `projects/templates/projects.template.html`, `projects/build-projects-page.js`, `projects/PROJECTS.json` |
| `references/index.html` | `references/templates/references.template.html`, `references/build-references-page.js`, `references/REFERENCES.json` |
| `genealogy.html` | `scripts-dev/build-genealogy.py` plus the projects and references datasets |
| `docs/**` | `docs-src/en/pages.json`, `docs-src/en/*.body.html`, `scripts-dev/build-functional-docs.cjs` |
| `docs/jsdoc/**` | JSDoc output followed by `scripts-dev/enrich-jsdoc-seo.cjs` |
| `codemap/codemap.html` | `codemap/codemap-template.html`, `scripts-dev/build-codemap-html.js` |

Root HTML pages are authored directly. `loader.html` also has localized title and description strings in `lab-js/i18n.js`.

## Crawler files

`web-files/sitemap.xml` and `web-files/robots.txt` are deployment sources. The sitemap lists canonical public routes and omits internal utilities. The installer copies these files to the deployed root. Add new public routes to the sitemap and keep the robots sitemap URL canonical.

## Build and validation

From the repository root:

```sh
npm run update:projects
npm run update:references
npm run update:genealogy
npm run docs:functional
npm run docs:rebuild
npm run codemap
npm run check:seo
```

`npm run check:seo` verifies required metadata, canonical URLs, JSON-LD, page-specific preview images, image dimensions, generated list counts, sitemap coverage and the robots-to-sitemap link. It does not guarantee how an external service will cache or render a preview. After deployment, test representative URLs with a Schema.org validator and the relevant social preview debuggers.

`npm run htmls:install` replaces the sibling backend client interface before copying the site. Run it only when that deployment replacement is intended.

## External references

- Open Graph protocol: <https://ogp.me/>
- Schema.org: <https://schema.org/>
- Google structured-data policies: <https://developers.google.com/search/docs/appearance/structured-data/sd-policies>
- Sitemaps protocol: <https://www.sitemaps.org/protocol.html>
