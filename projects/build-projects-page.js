#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(__dirname, 'PROJECTS.json');
const TEMPLATE_PATH = path.join(__dirname, 'templates', 'projects.template.html');
const OUTPUT_PATH = path.join(__dirname, 'index.html');
const VALIDATOR_PATH = path.join(__dirname, 'validate-projects.js');
const SITE_URL = 'https://ghostmaxxing.vecna.eu';

function structuredData(projects) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/projects/#webpage`,
    name: 'Related projects — Ghostmaxxing',
    description: 'A catalogue of clothing, makeup, masks, light and other projects tested or proposed against computer vision.',
    url: `${SITE_URL}/projects/`,
    inLanguage: 'en',
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: 'Ghostmaxxing',
    },
    author: {
      '@type': 'Person',
      '@id': 'https://me.vecna.eu/#vecna',
      name: 'Claudio Agosti',
      alternateName: 'vecna',
      url: 'https://me.vecna.eu/',
      sameAs: ['https://github.com/vecna'],
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: projects.length,
      itemListElement: projects.map((project, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'CreativeWork',
          name: project.name,
          url: project.url,
          description: project.description,
          datePublished: String(project.year),
          keywords: project.target.join(', '),
          image: `${SITE_URL}${project.image.src}`,
        },
      })),
    },
  }, null, 2).replace(/</g, '\\u003c');
}

const ACCESS_LABELS = {
  commercial: 'Commercial',
  'free-diy': 'Open DIY',
  'free-method': 'Open method',
  exhibition: 'Touring artwork',
  'collective-practice': 'Collective practice',
  prototype: 'Prototype',
  'research-prototype': 'Research prototype',
  artwork: 'Artwork'
};

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function titleCase(value) {
  return String(value).split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function renderFilters(categories) {
  const buttons = [
    '<button type="button" class="projects-filter is-active" data-project-filter="all" aria-pressed="true">All approaches</button>',
    ...categories.map((category) =>
      `<button type="button" class="projects-filter" data-project-filter="${esc(category.id)}" aria-pressed="false">${esc(category.label)}</button>`
    )
  ];
  return buttons.join('\n          ');
}

function renderLinks(project) {
  const links = [
    `<a class="project-link project-link--main" href="${esc(project.url)}" target="_blank" rel="noopener noreferrer">Visit project &#8599;</a>`,
    ...project.links.map((link) =>
      `<a class="project-link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label)} &#8599;</a>`
    )
  ];
  return links.join('\n                ');
}

// Each row carries id="<slug>" so genealogy.html can link a mark straight to
// its project (/projects/#slug), the way reference marks already reach
// /references/#slug. The year is the first public showing, the same value the
// genealogy chart places the mark at.
function renderRows(projects, categoryMap) {
  return projects.map((project) => {
    const category = categoryMap.get(project.category);
    return `
          <tr class="project-row" id="${esc(project.slug)}" data-project-category="${esc(project.category)}">
            <td class="project-row__media">
              <figure>
                <img src="${esc(project.image.src)}" alt="${esc(project.image.alt)}" width="720" height="480" loading="lazy" decoding="async" />
                <figcaption>Image: <a href="${esc(project.image.source_url)}" target="_blank" rel="noopener noreferrer">${esc(project.image.credit)}</a></figcaption>
              </figure>
            </td>
            <td class="project-row__project">
              <p class="project-row__category">${esc(category.label)}</p>
              <h2><a href="${esc(project.url)}" target="_blank" rel="noopener noreferrer">${esc(project.name)}</a></h2>
              <p class="project-row__state">${esc(ACCESS_LABELS[project.access] || titleCase(project.access))} &middot; ${esc(titleCase(project.status))} &middot; <time datetime="${esc(project.year)}">${esc(project.year)}</time></p>
            </td>
            <td class="project-row__description">
              <p>${esc(project.description)}</p>
              <div class="project-row__links">
                ${renderLinks(project)}
              </div>
            </td>
          </tr>`;
  }).join('\n');
}

function main() {
  try {
    execFileSync(process.execPath, [VALIDATOR_PATH], { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.error('\nvalidate-projects.js failed — fix PROJECTS.json and its local images before building.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const categoryMap = new Map(data.categories.map((category) => [category.id, category]));
  const projects = [...data.projects].sort((a, b) => a.name.localeCompare(b.name));
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  html = html
    .replace(/{{LAST_UPDATED}}/g, esc(data.last_updated))
    .replace(/{{PROJECT_COUNT}}/g, String(projects.length))
    .replace('{{CATEGORY_FILTERS}}', renderFilters(data.categories))
    .replace('{{PROJECT_ROWS}}', renderRows(projects, categoryMap))
    .replace('{{SEO_STRUCTURED_DATA}}', structuredData(projects));

  fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} with ${projects.length} projects.`);
}

main();
