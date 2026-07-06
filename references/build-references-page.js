#!/usr/bin/env node
'use strict';

/**
 * Regenerates references/index.html from REFERENCES.json + templates/references.template.html.
 *
 * Usage:
 *   node references/validate-references.js && node references/build-references-page.js
 *
 * What's static vs. generated:
 *   - templates/references.template.html holds the header, nav, intro copy, the
 *     "How to suggest a new entry" section, and the aside shell. Edit that file
 *     directly for wording/nav changes — this script never touches it, it only
 *     fills in the {{...}} placeholders it contains (including the one-time
 *     star icon sprite used for the relevance rating — swap the <path> there
 *     whenever you have a real icon; every star instance updates automatically).
 *   - Everything under {{REFERENCES_BODY}} is generated from REFERENCES.json
 *     every time this runs, grouped by type: peer-reviewed papers, art
 *     initiatives, advocacy efforts, then anything else.
 *
 * Two things are computed here rather than stored in the JSON, on purpose —
 * the JSON schema hasn't changed:
 *   - relevance stars (1-5): bucketed from the existing 1-100 "closeness"
 *     score, using the same five bands already defined in
 *     PROMPT-REFERENCES-UPDATE.txt's closeness rubric.
 *   - "only here" / "first seen" tag flags: computed once across the whole
 *     dataset (how many entries use a tag, and which entry used it earliest),
 *     so a tag chip can point out when it's rare or when this is the entry
 *     that introduced it, without needing clickable filtering.
 *
 * This script has no npm dependencies — plain Node + fs/path only.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REFERENCES_PATH = path.join(ROOT, 'references', 'REFERENCES.json');
const TEMPLATE_PATH = path.join(ROOT, 'references', 'templates', 'references.template.html');
const OUTPUT_PATH = path.join(ROOT, 'references', 'index.html');
const VALIDATOR_PATH = path.join(ROOT, 'references', 'validate-references.js');

const TESTABILITY_LABEL = {
  direct: 'Direct testability',
  partial: 'Partial testability',
  indirect: 'Indirect testability',
  contextual: 'Contextual reference',
  no: 'Not testable in-browser',
};

const LINK_LABELS = [
  ['canonical', 'Canonical'],
  ['paper', 'Paper'],
  ['project', 'Project'],
  ['code', 'Code'],
  ['video', 'Video'],
  ['doi', 'DOI'],
  ['arxiv', 'arXiv'],
];

// Order matters: this is both the display order of the sections in the page
// and the order of links in the "Jump to" nav.
const GROUP_DEFS = [
  { key: 'artistic', label: 'Art initiatives', anchor: 'group-artistic' },
  { key: 'activism', label: 'Advocacy efforts', anchor: 'group-activism' },
  { key: 'research', label: 'Peer-reviewed papers', anchor: 'group-research' },
];
// Anything whose "type" isn't one of the three above lands here. Empty today,
// but this keeps the page from silently dropping an entry if a new type
// value shows up later.
const OTHER_GROUP = { key: 'other', label: 'Other', anchor: 'group-other' };

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sortReferences(refs) {
  // Matches REFERENCES.json's own ordering_definition:
  // year desc, closeness desc, title asc.
  return [...refs].sort((a, b) => {
    if (a.closeness !== b.closeness) return b.closeness - a.closeness;
    if (a.year !== b.year) return b.year - a.year;
    return a.title.localeCompare(b.title);
  });
}

// closeness -> 1-5 stars, using the exact bands from the closeness rubric:
// 100 / 90-99 / 70-89 / 40-69 / 1-39. Five bands in, five stars out.
function relevanceStars(closeness) {
  if (closeness >= 100) return 5;
  if (closeness >= 90) return 4;
  if (closeness >= 70) return 3;
  if (closeness >= 40) return 2;
  return 1;
}

function starsHtml(closeness) {
  const n = relevanceStars(closeness);
  let icons = '';
  for (let i = 1; i <= 5; i++) {
    const empty = i > n;
    icons += `<svg class="star-icon${empty ? ' star-icon--empty' : ''}" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-star" xlink:href="#icon-star"></use></svg>`;
  }
  return `<span class="reference-relevance" title="Relevance ${n}/5 (source score ${esc(closeness)}/100)"><span class="sr-only">Relevance: ${n} out of 5</span>${icons}</span>`;
}

// One pass over the whole dataset: for every tag used in intervention/target/
// domain, how many entries use it (deduped per entry) and the earliest year
// it shows up in. Order-independent, so it doesn't matter that this runs
// before sorting/grouping.
function buildTagStats(refs) {
  const stats = new Map(); // tag -> { count, minYear }
  for (const ref of refs) {
    const tags = new Set([...ref.intervention, ...ref.target, ...ref.domain]);
    for (const tag of tags) {
      const entry = stats.get(tag) || { count: 0, minYear: Infinity };
      entry.count += 1;
      entry.minYear = Math.min(entry.minYear, ref.year);
      stats.set(tag, entry);
    }
  }
  return stats;
}

function tagRow(ref) {
  const level = ref.ghostati_testability.level;
  const parts = [
    `<span class="tag">${esc(ref.year)}</span>`,
    `<span class="tag">${esc(capitalize(ref.type))}</span>`,
    starsHtml(ref.closeness),
    `<span class="badge badge--${esc(level)}">${esc(TESTABILITY_LABEL[level] || level)}</span>`,
  ];
  return `<div class="reference-entry__meta">${parts.join('')}</div>`;
}

function topicTags(ref, tagStats) {
  const tags = [...new Set([...ref.intervention, ...ref.target, ...ref.domain])];
  const chips = tags
    .map((tag) => {
      const stat = tagStats.get(tag);
      const isUnique = stat.count === 1;
      const isFirstSeen = !isUnique && ref.year === stat.minYear;
      let cls = 'tag tag--topic';
      let flag = '';
      if (isUnique) {
        cls += ' tag--unique';
        flag = '<span class="tag__flag" title="Only this entry in the archive uses this tag">only here</span>';
      } else if (isFirstSeen) {
        cls += ' tag--new';
        flag = '<span class="tag__flag" title="Earliest entry in the archive using this tag">first seen</span>';
      }
      return `<span class="${cls}">${esc(tag.replace(/-/g, ' '))}${flag}</span>`;
    })
    .join('');
  return `<div class="reference-entry__meta reference-entry__meta--topics">${chips}</div>`;
}

function linksRow(ref) {
  const seen = new Set();
  const items = [];
  for (const [key, lbl] of LINK_LABELS) {
    const url = ref.links[key];
    if (url && !seen.has(url)) {
      seen.add(url);
      items.push(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${lbl}</a>`);
    }
  }
  if (items.length === 0) return '';
  return `<span class="reference-entry__links" aria-label="Links for ${esc(ref.title)}">${items.join(' &middot; ')}</span>`;
}

function entryHtml(ref, tagStats) {
  return `
          <article class="content-section reference-entry" id="${esc(ref.slug)}">
            ${tagRow(ref)}
            <h3>${esc(ref.title)}</h3>
            <p class="reference-entry__authors">${esc(ref.author.join(', '))}</p>
            <p>${esc(ref.description)}</p>
            ${topicTags(ref, tagStats)}
            <span class="reference-entry__assessment">
              <!-- <summary>Full assessment</summary> -->
              <dl class="reference-entry__facts">
                <div class="reference-entry__fact">
                  <dt>Demonstrated</dt>
                  <dd>${esc(ref.demonstrated)}</dd>
                </div>
                <div class="reference-entry__fact">
                  <dt>Why it matters for Ghostmaxxing</dt>
                  <dd>${esc(ref.ghostati_relevance)}</dd>
                </div>
                <div class="reference-entry__fact">
                  <dt>Ghostmaxxing testability</dt>
                  <dd>${esc(ref.ghostati_testability.reason)}</dd>
                </div>
                <div class="reference-entry__fact">
                  <dt>Limits</dt>
                  <dd>${esc(ref.limitations)}</dd>
                </div>
              </dl>
            </span>
            <p>
              <span class="reference-entry__citation">${esc(ref.citation)} &middot; ${esc(ref.reproducibility.replace(/-/g, ' '))}</span>
              ${linksRow(ref)}
            </p>
          </article>`;
}

function groupKeyFor(ref) {
  return GROUP_DEFS.some((d) => d.key === ref.type) ? ref.type : OTHER_GROUP.key;
}

function buildReferencesBody(sortedRefs, tagStats) {
  const buckets = new Map();
  for (const ref of sortedRefs) {
    const key = groupKeyFor(ref);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(ref);
  }

  const chunks = [];
  const activeGroups = [];
  for (const def of [...GROUP_DEFS, OTHER_GROUP]) {
    const items = buckets.get(def.key) || [];
    if (items.length === 0) continue; // don't render (or link to) empty sections
    activeGroups.push({ ...def, count: items.length });
    chunks.push(
      `<h3 class="reference-group" id="${def.anchor}">${esc(def.label)} <span class="reference-group__count">(${items.length})</span></h3>`
    );
    chunks.push('<div class="reference-group__list">');
    for (const ref of items) chunks.push(entryHtml(ref, tagStats));
    chunks.push('</div>');
  }

  return { body: chunks.join('\n'), groups: activeGroups };
}

function main() {
  // Fail loudly rather than generate a page from a broken/incomplete JSON.
  try {
    execFileSync('node', [VALIDATOR_PATH], { stdio: 'inherit', cwd: ROOT });
  } catch (err) {
    console.error('\nvalidate-references.js failed — fix REFERENCES.json before building the page.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(REFERENCES_PATH, 'utf8'));
  const refs = sortReferences(data.references);
  const tagStats = buildTagStats(refs);

  const years = refs.map((r) => r.year);
  const yearMin = Math.min(...years);
  const yearMax = Math.max(...years);
  const nResearch = refs.filter((r) => r.type === 'research').length;
  const nArtistic = refs.filter((r) => r.type === 'artistic').length;
  const nActivism = refs.filter((r) => r.type === 'activism').length;
  const nOther = refs.length - nResearch - nArtistic - nActivism;

  const { body, groups } = buildReferencesBody(refs, tagStats);
  const groupNav = groups.map((g) => `<a href="#${g.anchor}">${esc(g.label)}</a>`).join('\n            ');

  const statsParts = [
    `${refs.length} references`,
    `${nResearch} peer-reviewed`,
    `${nArtistic} art`,
    `${nActivism} advocacy`,
  ];
  if (nOther > 0) statsParts.push(`${nOther} other`);
  statsParts.push(`${yearMin}&ndash;${yearMax}`);
  const statsLine = statsParts.join(' &middot; ');

  let html = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  html = html
    .replace(/{{REFERENCE_COUNT}}/g, String(refs.length))
    .replace(/{{YEAR_MIN}}/g, String(yearMin))
    .replace(/{{YEAR_MAX}}/g, String(yearMax))
    .replace('{{STATS_LINE}}', statsLine)
    .replace('{{REFERENCES_BODY}}', body)
    .replace('{{GROUP_NAV}}', groupNav);

  fs.writeFileSync(OUTPUT_PATH, html);
  console.log(
    `Wrote ${path.relative(ROOT, OUTPUT_PATH)}: ${refs.length} entries across ${groups.length} group(s) (${groups
      .map((g) => `${g.label}: ${g.count}`)
      .join(', ')}).`
  );
}

main();
