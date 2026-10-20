#!/usr/bin/env node
'use strict';

/**
 * Build the hand-authored, translatable functional documentation.
 *
 * Source fragments live under docs-src/<locale>/ and contain only the page
 * main content. This builder supplies shared site chrome and documentation
 * navigation, then writes static HTML under docs/. Generated JSDoc remains a
 * separate output under docs/jsdoc/.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(ROOT, 'docs-src', 'en');
const PAGE_INDEX = path.join(SOURCE_ROOT, 'pages.json');
const PROJECT_VERSION = '1.0.0';
const LAST_UPDATED = '15 October 2026';
const SITE_URL = 'https://ghostmaxxing.vecna.eu';
const SOCIAL_IMAGE = `${SITE_URL}/images/social/ghostmaxxing-generic.jpg`;

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function canonicalUrl(output) {
  const route = output.replace(/index\.html$/, '');
  return `${SITE_URL}/${route}`;
}

function jsonForScript(value) {
  return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

function current(section, candidate) {
  return section === candidate ? ' aria-current="page"' : '';
}

function siteHeader() {
  return `
  <!-- NAVIGATION: intentionally duplicated in pages and generators. See tutorials/navigation-maintenance.md. -->
<header class="gm-site-header">
  <a class="gm-site-wordmark" href="/" aria-label="Ghostmaxxing homepage">
    <img class="gm-site-wordmark__mark" src="/images/logo/mark-color.svg" width="40" height="40" alt="" aria-hidden="true">
    <span class="gm-site-wordmark__text"><span class="gm-site-wordmark__title">Ghostmaxxing</span><span class="gm-site-wordmark__sub">A public lab for testing camouflage</span></span>
  </a>
  <button class="gm-site-nav-toggle" type="button" aria-expanded="false" aria-controls="gmPrimaryNav" hidden>Menu</button>
  <nav class="gm-site-nav" id="gmPrimaryNav" aria-label="Primary">
<details class="gm-site-nav__group gm-site-nav__group--tools">
  <summary class="gm-site-nav__trigger" aria-controls="gmToolsMenu">Tools <span aria-hidden="true">▾</span></summary>
  <div class="gm-site-menu" id="gmToolsMenu"><ul>
  <li><a href="/lab.html">Camouflage lab</a><small>Apply Ghostyles and compare local results.</small></li>
  <li><a href="/loader.html">Video analyser</a><small>Analyse a recorded makeup video.</small></li>
  <li><a href="/realtime.html">Makeup Explorer</a><small>See how makeup changes face descriptors in real time.</small></li>
</ul></div>
</details>
<details class="gm-site-nav__group ">
  <summary class="gm-site-nav__trigger" aria-controls="gmExploreMenu">Explore <span aria-hidden="true">▾</span></summary>
  <div class="gm-site-menu" id="gmExploreMenu"><div><p class="gm-site-menu__kicker">Understand</p><ul>
  <li><a href="/about.html">About Ghostmaxxing</a></li>
  <li><a href="/genealogy.html">Genealogy</a></li>
  <li><a href="/references/">Research references</a></li>
  <li><a href="/projects/">Related projects</a></li>
</ul></div><div><p class="gm-site-menu__kicker">Use and contribute</p><ul>
  <li><a href="/docs/" aria-current="location">Documentation</a></li>
  <li><a href="/gallery.html">Gallery</a></li>
  <li><a href="/fediverse.html">Fediverse integration</a></li>
  <li><a href="https://github.com/vecna/ghostmaxxing">Source code ↗</a></li>
</ul></div></div>
</details>
<details class="gm-site-nav__group gm-site-nav__group--nina">
  <summary class="gm-site-nav__trigger" aria-controls="gmNinaMenu">Ghòstati! / NINA <span aria-hidden="true">▾</span></summary>
  <div class="gm-site-menu" id="gmNinaMenu"><div><p class="gm-site-menu__intro">Workshops, collective action and confidential reporting, organised by NINA’s Universal Union.</p><ul>
  <li><a href="https://sindacato.nina.watch/it/blog/">Union blog · Italiano ↗</a></li>
  <li><a href="https://sindacato.nina.watch/en/blog/">Union blog · English ↗</a></li>
  <li><a href="https://sindacato.nina.watch/en/initiatives/ghostati/">Ghòstati! initiative &amp; workshops ↗</a></li>
  <li><a href="https://sindacato.nina.watch/en/ghostati/report/">Confidential reporting at NINA ↗</a></li>
</ul></div></div>
</details>
  </nav>
  <a class="gm-site-cta" href="/lab.html">Open the lab</a>
</header>`;
}

function docsNav(section) {
  return `
  <nav class="docs-nav" aria-label="Documentation">
    <div class="docs-nav__inner">
      <a href="/docs/"${current(section, 'tools')}>Use the tools</a>
      <a href="/docs/understand/"${current(section, 'understand')}>Understand the results</a>
      <a href="/docs/glossary/"${current(section, 'glossary')}>Glossary</a>
      <a href="/docs/develop/"${current(section, 'develop')}>Build and inspect</a>
      <a href="/docs/maintain/"${current(section, 'maintain')}>Maintain the project</a>
    </div>
  </nav>`;
}

function siteFooter() {
  return `
  <!-- FOOTER: intentionally duplicated; update the generator copies too. -->
<footer class="gm-site-footer">
  <div class="gm-site-footer__pyre" data-mode="cropped"><img src="/images/motifs/pyre.svg" alt="" aria-hidden="true"></div>
  <img class="gm-site-footer__edge" src="/images/motifs/soil-edge.svg" alt="" aria-hidden="true">
  <div class="gm-site-footer__inner">
    <a class="gm-site-footer__brand" href="/"><img src="/images/logo/mark-ondark.svg" width="32" height="32" alt="" aria-hidden="true">Ghostmaxxing</a>
    <nav class="gm-site-footer__columns" aria-label="Footer">
<section><h2>Tools</h2><ul>
  <li><a href="/lab.html">Camouflage lab</a></li>
  <li><a href="/loader.html">Video analyser</a></li>
  <li><a href="/realtime.html">Makeup Explorer</a></li>
</ul></section>
<section><h2>Research</h2><ul>
  <li><a href="/genealogy.html">Genealogy</a></li>
  <li><a href="/references/">Research references</a></li>
  <li><a href="/projects/">Related projects</a></li>
</ul></section>
<section><h2>Project</h2><ul>
  <li><a href="/about.html">About Ghostmaxxing</a></li>
  <li><a href="/gallery.html">Gallery</a></li>
<li><a href="/docs/" aria-current="location">Documentation</a></li>
  <li><a href="/docs/jsdoc/">API reference</a></li>
  <li><a href="/fediverse.html">Fediverse integration</a></li>
  <li><a href="https://github.com/vecna/ghostmaxxing">Source code ↗</a></li>
  <li><a href="https://github.com/vecna/gstmxx-backend">Backend source ↗</a></li>
</ul></section>
<section><h2>Ghòstati! at NINA</h2><ul>
  <li><a href="https://sindacato.nina.watch/it/blog/">Union blog · Italiano ↗</a></li>
  <li><a href="https://sindacato.nina.watch/en/blog/">Union blog · English ↗</a></li>
  <li><a href="https://sindacato.nina.watch/en/initiatives/ghostati/">Ghòstati! initiative &amp; workshops ↗</a></li>
  <li><a href="https://sindacato.nina.watch/en/ghostati/report/">Confidential reporting at NINA ↗</a></li>
</ul></section>
    </nav>
    <p class="gm-site-footer__responsibility">Ghostmaxxing develops the software. Ghòstati!, part of <a href="https://sindacato.nina.watch/en/">NINA’s Universal Union ↗</a>, organises workshops and handles confidential reporting.</p>
  </div>
</footer>`;
}

function renderPage(page, body) {
  const mainClass = page.mainClass ? ` ${page.mainClass}` : '';
  const canonical = canonicalUrl(page.output);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${canonical}#article`,
    headline: page.title,
    description: page.description,
    url: canonical,
    inLanguage: 'en',
    articleSection: 'Documentation',
    author: {
      '@type': 'Person',
      '@id': 'https://me.vecna.eu/#vecna',
      name: 'Claudio Agosti',
      alternateName: 'vecna',
      url: 'https://me.vecna.eu/',
      sameAs: ['https://github.com/vecna', 'https://retro.pizza/@vecna'],
    },
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: 'Ghostmaxxing',
    },
  };
  return `<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <link rel="canonical" href="${canonical}" />
  <title>${escapeAttribute(page.title)}</title>
  <meta name="generator" content="Hand-coded with rage against the algorithm" />
  <meta name="description" content="${escapeAttribute(page.description)}" />
  <meta property="og:title" content="${escapeAttribute(page.title)}" />
  <meta property="og:description" content="${escapeAttribute(page.description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${SOCIAL_IMAGE}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Ghostmaxxing: test face-recognition camouflage in your browser." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttribute(page.title)}" />
  <meta name="twitter:description" content="${escapeAttribute(page.description)}" />
  <meta name="twitter:image" content="${SOCIAL_IMAGE}" />
  <meta name="twitter:image:alt" content="Ghostmaxxing: test face-recognition camouflage in your browser." />
  <script type="application/ld+json">
${jsonForScript(structuredData)}
  </script>
  <link rel="icon" type="image/svg+xml" href="/images/logo/mark-onlight.svg" />
  <link rel="stylesheet" href="/styles/styles.css" />
  <link rel="stylesheet" href="/styles/pages.css" />
  <link rel="stylesheet" href="/styles/content-pages.css" />
  <link rel="stylesheet" href="/styles/docs.css" />
  <script defer src="/pages-js/nav.js"></script>
</head>

<body>
${siteHeader()}
${docsNav(page.section)}
  <main class="editorial-homepage content-page docs-main${mainClass}">
    <div class="editorial-homepage__shell">
${body.trim()}
    </div>
  </main>
${siteFooter()}
</body>

</html>
`;
}

function main() {
  const pages = JSON.parse(fs.readFileSync(PAGE_INDEX, 'utf8'));
  const written = [];

  for (const page of pages) {
    const source = path.join(SOURCE_ROOT, page.source);
    const output = path.join(ROOT, page.output);
    if (!fs.existsSync(source)) throw new Error(`Missing documentation source: ${path.relative(ROOT, source)}`);
    const body = fs.readFileSync(source, 'utf8');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, renderPage(page, body), 'utf8');
    written.push(page.output);
  }

  process.stdout.write(`wrote ${written.length} functional documentation pages\n`);
  for (const file of written) process.stdout.write(`  ${file}\n`);
}

main();
