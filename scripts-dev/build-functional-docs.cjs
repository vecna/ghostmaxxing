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

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function current(section, candidate) {
  return section === candidate ? ' aria-current="page"' : '';
}

function siteHeader() {
  return `
  <header class="gm-site-header">
    <a class="gm-site-wordmark" href="/" aria-label="Ghostmaxxing homepage">
      <img class="gm-site-wordmark__mark" src="/images/logo/mark-color.svg" width="40" height="40" alt="" aria-hidden="true" />
      <span class="gm-site-wordmark__text">
        <span class="gm-site-wordmark__title">Ghostmaxxing</span>
        <span class="gm-site-wordmark__sub">A public lab for testing camouflage</span>
      </span>
    </a>
    <nav class="gm-site-nav" aria-label="Primary">
      <div class="gm-site-nav__group">
        <button class="gm-site-nav__trigger" aria-expanded="false" aria-controls="gmSiteMenu">Know more <span aria-hidden="true">&#9662;</span></button>
        <div class="gm-site-menu" id="gmSiteMenu">
          <div>
            <p class="gm-site-menu__kicker">Informative</p>
            <ul>
              <li><a href="/about.html">Vision &amp; about</a></li>
              <li><a href="/genealogy.html">The genealogy of the read</a></li>
              <li><a href="/report.html">Report a deployment</a></li>
              <li><a href="/workshops.html">Workshops</a></li>
            </ul>
          </div>
          <div>
            <p class="gm-site-menu__kicker">Technology</p>
            <ul>
              <li><a href="/lab.html">Open the lab &#8599;</a></li>
              <li><a href="/ghostyle-transfer.html">Ghostyle transfer</a></li>
              <li><a href="/references/">References archive</a></li>
              <li><a href="/docs/" aria-current="page">Docs</a></li>
              <li><a href="https://github.com/vecna/ghostmaxxing">Code</a></li>
            </ul>
          </div>
        </div>
      </div>
      <a class="gm-site-chip" href="/fediverse.html">in the Fediverse</a>
      <a class="gm-site-cta" href="/report.html">Leak to us &#8599;</a>
    </nav>
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
  <footer class="gm-site-footer">
    <div class="gm-site-footer__pyre" data-mode="cropped">
      <img src="/images/motifs/pyre.svg" alt="" aria-hidden="true" />
    </div>
    <img class="gm-site-footer__edge" src="/images/motifs/soil-edge.svg" alt="" aria-hidden="true" />
    <div class="gm-site-footer__row">
      <a class="docs-footer-mark" href="/">
        <img src="/images/logo/mark-ondark.svg" alt="" aria-hidden="true" />
        <span>Ghostmaxxing</span>
      </a>
      <div class="gm-site-footer__links">
        <a href="/docs/">Documentation</a>
        <a href="/docs/jsdoc/">API reference</a>
        <a href="https://github.com/vecna/ghostmaxxing">Code</a>
        <a href="/loader.html">Video Loader</a>
      </div>
    </div>
  </footer>`;
}

function renderPage(page, body) {
  const mainClass = page.mainClass ? ` ${page.mainClass}` : '';
  return `<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${escapeAttribute(page.title)}</title>
  <meta name="generator" content="Hand-coded with rage against the algorithm" />
  <meta name="description" content="${escapeAttribute(page.description)}" />
  <meta property="og:title" content="${escapeAttribute(page.title.replace(' | Ghostmaxxing', ''))} | Ghostmaxxing" />
  <meta property="og:description" content="${escapeAttribute(page.description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="/images/social-card.svg" />
  <meta name="twitter:card" content="summary_large_image" />
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
