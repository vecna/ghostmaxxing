#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://ghostmaxxing.vecna.eu';
const IMAGE_URL = `${SITE_URL}/images/social/ghostmaxxing-generic.jpg`;
const DOC_PAGES_PATH = path.join(ROOT, 'docs-src', 'en', 'pages.json');
const REQUIRED_META = [
  ['property', 'og:title'],
  ['property', 'og:description'],
  ['property', 'og:type'],
  ['property', 'og:url'],
  ['property', 'og:image'],
  ['property', 'og:image:alt'],
  ['name', 'twitter:card'],
  ['name', 'twitter:title'],
  ['name', 'twitter:description'],
  ['name', 'twitter:image'],
  ['name', 'twitter:image:alt'],
];

function fail(message) {
  throw new Error(message);
}

function listHtmlFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listHtmlFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.html') ? [entryPath] : [];
  });
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/g)) {
    result[match[1].toLowerCase()] = match[3];
  }
  return result;
}

function getMeta(html, attribute, name) {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const values = attributes(tag[0]);
    if (values[attribute] === name) return values.content;
  }
  return undefined;
}

function collectTypedItems(value, type, items = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectTypedItems(item, type, items);
  } else if (value && typeof value === 'object') {
    if (value['@type'] === type) items.push(value);
    for (const item of Object.values(value)) collectTypedItems(item, type, items);
  }
  return items;
}

function checkHtml(filePath, canonicalUrls) {
  const relative = path.relative(ROOT, filePath);
  const html = fs.readFileSync(filePath, 'utf8');
  const head = html.match(/<head\b[^>]*>[\s\S]*?<\/head>/i)?.[0];
  if (!head) fail(`${relative}: missing <head>`);

  const title = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  if (!title || !title.endsWith('— Ghostmaxxing')) fail(`${relative}: title must end in "— Ghostmaxxing"`);

  const description = getMeta(head, 'name', 'description');
  if (!description?.trim()) fail(`${relative}: missing meta description`);

  const canonicalTag = head.match(/<link\b[^>]*>/gi)?.find((tag) => attributes(tag).rel === 'canonical');
  const canonical = canonicalTag && attributes(canonicalTag).href;
  if (!canonical || !canonical.startsWith(`${SITE_URL}/`)) fail(`${relative}: missing absolute canonical URL on ${SITE_URL}`);
  if (canonicalUrls.has(canonical)) fail(`${relative}: duplicate canonical URL ${canonical}`);
  canonicalUrls.add(canonical);

  for (const [attribute, name] of REQUIRED_META) {
    if (!getMeta(head, attribute, name)?.trim()) fail(`${relative}: missing ${attribute}="${name}"`);
  }
  if (getMeta(head, 'property', 'og:image') !== IMAGE_URL) fail(`${relative}: expected the supported 1200x630 JPEG social card`);
  if (getMeta(head, 'property', 'og:image:type') !== 'image/jpeg') fail(`${relative}: og:image:type must be image/jpeg`);
  if (getMeta(head, 'property', 'og:image:width') !== '1200' || getMeta(head, 'property', 'og:image:height') !== '630') {
    fail(`${relative}: social-card dimensions must be 1200x630`);
  }

  const structuredScripts = [...head.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (structuredScripts.length !== 1) fail(`${relative}: expected exactly one JSON-LD block, found ${structuredScripts.length}`);
  let structuredData;
  try {
    structuredData = JSON.parse(structuredScripts[0][1]);
  } catch (error) {
    fail(`${relative}: invalid JSON-LD: ${error.message}`);
  }
  if (structuredData['@context'] !== 'https://schema.org' || (!structuredData['@type'] && !structuredData['@graph'])) {
    fail(`${relative}: JSON-LD requires schema.org context and a type`);
  }
  const publisher = collectTypedItems(structuredData, 'Organization')
    .some((organization) => organization.name === 'NINA / Universal Digital Union' && organization.url === 'https://nina.watch/');
  if (!publisher) fail(`${relative}: JSON-LD must include the specified NINA / Universal Digital Union publisher`);

  const requiredTypes = {
    'index.html': ['WebSite', 'Organization', 'SoftwareApplication'],
    'lab.html': ['WebApplication'],
    'about.html': ['AboutPage', 'Organization'],
    'report.html': ['WebPage', 'ContactPoint'],
    'genealogy.html': ['CollectionPage', 'ItemList'],
    'projects/index.html': ['CollectionPage', 'ItemList'],
    'references/index.html': ['CollectionPage', 'ItemList', 'ScholarlyArticle'],
  }[relative];
  if (requiredTypes) {
    for (const type of requiredTypes) {
      if (collectTypedItems(structuredData, type).length === 0) fail(`${relative}: JSON-LD is missing required type ${type}`);
    }
  }
  for (const itemList of collectTypedItems(structuredData, 'ItemList')) {
    if (itemList.numberOfItems !== itemList.itemListElement?.length) {
      fail(`${relative}: JSON-LD ItemList count does not match its generated entries`);
    }
  }
  if (relative === 'index.html') {
    const application = collectTypedItems(structuredData, 'SoftwareApplication')[0];
    if (application.alternateName !== 'Ghòstati') fail('index.html: SoftwareApplication must retain the historical Ghòstati alternate name');
    if (!Array.isArray(application.applicationCategory) ||
        !['EducationalApplication', 'SecurityApplication'].every((category) => application.applicationCategory.includes(category))) {
      fail('index.html: SoftwareApplication must describe both educational and security categories');
    }
    if (application.offers?.price !== '0' || !application.license?.includes('AGPL-3.0-or-later')) {
      fail('index.html: SoftwareApplication must state its free offer and AGPL-3.0-or-later licence');
    }
    if (!application.sameAs?.includes('https://github.com/vecna/ghostmaxxing')) {
      fail('index.html: SoftwareApplication must link to its source repository');
    }
  }
}

function main() {
  const docsPages = JSON.parse(fs.readFileSync(DOC_PAGES_PATH, 'utf8'));
  const pagePaths = [
    'index.html',
    'about.html',
    'lab.html',
    'report.html',
    'fediverse.html',
    'workshops.html',
    'loader.html',
    'genealogy.html',
    'visual-styleguide.html',
    'projects/index.html',
    'references/index.html',
    'codemap/codemap.html',
    ...docsPages.map((page) => page.output),
  ].map((relative) => path.join(ROOT, relative));
  const jsdocDir = path.join(ROOT, 'docs', 'jsdoc');
  const jsdocPages = listHtmlFiles(jsdocDir);
  if (jsdocPages.length === 0) fail('No generated JSDoc HTML was found; run npm run docs:rebuild first.');
  pagePaths.push(...jsdocPages);

  const canonicalUrls = new Set();
  for (const filePath of pagePaths) {
    if (!fs.existsSync(filePath)) fail(`Missing generated or authored HTML page: ${path.relative(ROOT, filePath)}`);
    checkHtml(filePath, canonicalUrls);
  }

  const sitemap = fs.readFileSync(path.join(ROOT, 'web-files', 'sitemap.xml'), 'utf8');
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
  if (sitemapUrls.length === 0) fail('web-files/sitemap.xml contains no <loc> entries');
  if (sitemapUrls.some((url) => /\/(?:api|federation)\//i.test(new URL(url).pathname))) {
    fail('web-files/sitemap.xml must exclude /api/ and /federation/');
  }
  const requiredSitemapUrls = [
    `${SITE_URL}/`,
    `${SITE_URL}/lab.html`,
    `${SITE_URL}/about.html`,
    `${SITE_URL}/report.html`,
    `${SITE_URL}/projects/`,
    `${SITE_URL}/references/`,
    `${SITE_URL}/genealogy.html`,
    `${SITE_URL}/docs/`,
    ...docsPages.map((page) => {
      const route = page.output.replace(/index\.html$/, '');
      return `${SITE_URL}/${route}`;
    }),
  ];
  for (const url of requiredSitemapUrls) {
    if (!sitemapUrls.includes(url)) fail(`web-files/sitemap.xml is missing ${url}`);
  }
  const robots = fs.readFileSync(path.join(ROOT, 'web-files', 'robots.txt'), 'utf8');
  if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) fail('web-files/robots.txt must point to the canonical sitemap URL');

  const imagePath = path.join(ROOT, new URL(IMAGE_URL).pathname.slice(1));
  if (!fs.existsSync(imagePath)) fail(`Social preview image is missing: ${path.relative(ROOT, imagePath)}`);
  process.stdout.write(`SEO checks passed for ${pagePaths.length} HTML pages and ${sitemapUrls.length} sitemap URLs.\n`);
}

main();
