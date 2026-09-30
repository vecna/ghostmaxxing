#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'docs', 'jsdoc');
const SITE_URL = 'https://ghostmaxxing.vecna.eu';
const SOCIAL_IMAGE = `${SITE_URL}/images/social/ghostmaxxing-generic.jpg`;
const DESCRIPTION = 'Generated technical API documentation for Ghostmaxxing, a browser-based lab for studying face-recognition systems and camouflage experiments.';
const IMAGE_ALT = 'Ghostmaxxing: test face-recognition camouflage in your browser.';

function listHtmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listHtmlFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.html') ? [entryPath] : [];
  });
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, '\'')
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)));
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setMeta(head, attribute, name, content) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${escapedName}["'])[^>]*>\\s*`, 'gi');
  const tag = `<meta ${attribute}="${name}" content="${escapeHtml(content)}" />\n  `;
  return head.replace(existing, '').replace(/<\/head>/i, `${tag}</head>`);
}

function enrich(filePath) {
  const relative = path.relative(OUTPUT_DIR, filePath).split(path.sep).join('/');
  const encodedPath = relative.split('/').map(encodeURIComponent).join('/');
  const route = encodedPath.replace(/index\.html$/, '');
  const canonical = `${SITE_URL}/docs/jsdoc/${route}`;
  let html = fs.readFileSync(filePath, 'utf8');
  const headMatch = html.match(/<head\b[^>]*>[\s\S]*?<\/head>/i);
  const titleMatch = headMatch?.[0].match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!headMatch || !titleMatch) {
    throw new Error(`Generated JSDoc page has no head or title: ${path.relative(ROOT, filePath)}`);
  }

  const plainTitle = decodeHtml(titleMatch[1].replace(/<[^>]*>/g, '').trim())
    .replace(/\s*[|—-]\s*Ghostmaxxing$/i, '')
    .trim();
  const title = `${plainTitle} — Ghostmaxxing`;
  const escapedTitle = escapeHtml(title);
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${canonical}#article`,
    headline: title,
    description: DESCRIPTION,
    url: canonical,
    inLanguage: 'en',
    articleSection: 'API reference',
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
  }, null, 2).replace(/</g, '\\u003c');

  let head = headMatch[0].replace(titleMatch[0], `<title>${escapedTitle}</title>`);
  head = head.replace(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>\s*/gi, '');
  head = head.replace(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>\s*/gi, '');
  head = head.replace(/<head\b[^>]*>/i, `$&\n  <link rel="canonical" href="${canonical}" />`);

  for (const [attribute, name, content] of [
    ['name', 'description', DESCRIPTION],
    ['property', 'og:title', title],
    ['property', 'og:description', DESCRIPTION],
    ['property', 'og:type', 'article'],
    ['property', 'og:url', canonical],
    ['property', 'og:image', SOCIAL_IMAGE],
    ['property', 'og:image:type', 'image/jpeg'],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['property', 'og:image:alt', IMAGE_ALT],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', DESCRIPTION],
    ['name', 'twitter:image', SOCIAL_IMAGE],
    ['name', 'twitter:image:alt', IMAGE_ALT],
  ]) {
    head = setMeta(head, attribute, name, content);
  }
  head = head.replace('</head>', `<script type="application/ld+json">\n${structuredData}\n  </script>\n</head>`);
  html = html.replace(headMatch[0], head);
  fs.writeFileSync(filePath, html);
}

function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    throw new Error(`JSDoc output directory is missing: ${path.relative(ROOT, OUTPUT_DIR)}. Run npm run docs first.`);
  }
  const files = listHtmlFiles(OUTPUT_DIR);
  if (files.length === 0) throw new Error('JSDoc generated no HTML pages.');
  for (const filePath of files) enrich(filePath);
  process.stdout.write(`Added canonical URLs, share previews and TechArticle data to ${files.length} JSDoc pages.\n`);
}

main();
