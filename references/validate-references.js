#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REFERENCES_PATH = path.join(ROOT, 'references', 'REFERENCES.json');
const TESTABILITY = new Set(['direct', 'partial', 'indirect', 'contextual', 'no']);
const TYPES = new Set(['artistic', 'research', 'activism']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isUrl(value) {
  return typeof value === 'string' && /^https?:\/\//.test(value);
}

function isTag(value) {
  return typeof value === 'string' && /^[a-z0-9-]+$/.test(value);
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function validateReferences(data) {
  const errors = [];
  const warnings = [];

  assert(data && typeof data === 'object', 'REFERENCES.json must contain an object.', errors);
  assert(Array.isArray(data.references), 'references must be an array.', errors);
  assert(data.language === 'en', 'language must be "en".', errors);

  const tagDefs = data.tag_definitions || {};
  const allowed = {
    intervention: new Set(tagDefs.intervention || []),
    target: new Set(tagDefs.target || []),
    domain: new Set(tagDefs.domain || [])
  };

  const slugs = new Set();
  const titles = new Set();
  const refs = Array.isArray(data.references) ? data.references : [];

  refs.forEach((ref, index) => {
    const label = ref && ref.slug ? ref.slug : `entry #${index + 1}`;
    assert(ref && typeof ref === 'object', `${label}: must be an object.`, errors);
    if (!ref || typeof ref !== 'object') return;

    assert(typeof ref.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ref.slug), `${label}: invalid slug.`, errors);
    if (slugs.has(ref.slug)) errors.push(`${label}: duplicate slug.`);
    slugs.add(ref.slug);

    assert(typeof ref.title === 'string' && ref.title.trim().length > 0, `${label}: missing title.`, errors);
    const titleKey = String(ref.title || '').trim().toLowerCase();
    if (titleKey) {
      if (titles.has(titleKey)) warnings.push(`${label}: duplicate normalized title detected: ${ref.title}`);
      titles.add(titleKey);
    }

    assert(Array.isArray(ref.author) && ref.author.length > 0, `${label}: author must be a non-empty array.`, errors);
    assert(Number.isInteger(ref.year) && ref.year >= 1900 && ref.year <= 2100, `${label}: year must be an integer.`, errors);
    assert(isUrl(ref.link), `${label}: link must be an absolute http(s) URL.`, errors);
    assert(TYPES.has(ref.type), `${label}: type must be artistic, research, or activism.`, errors);
    assert(Number.isInteger(ref.closeness) && ref.closeness >= 1 && ref.closeness <= 100, `${label}: closeness must be an integer from 1 to 100.`, errors);

    ['description', 'demonstrated', 'ghostati_relevance', 'limitations', 'reproducibility', 'citation'].forEach((field) => {
      assert(typeof ref[field] === 'string' && ref[field].trim().length > 0, `${label}: missing ${field}.`, errors);
    });

    assert(ref.ghostati_testability && TESTABILITY.has(ref.ghostati_testability.level), `${label}: invalid ghostati_testability.level.`, errors);
    assert(ref.ghostati_testability && typeof ref.ghostati_testability.reason === 'string' && ref.ghostati_testability.reason.trim().length > 0, `${label}: missing ghostati_testability.reason.`, errors);

    ['intervention', 'target', 'domain'].forEach((field) => {
      assert(Array.isArray(ref[field]) && ref[field].length > 0, `${label}: ${field} must be a non-empty array.`, errors);
      (ref[field] || []).forEach((tag) => {
        assert(isTag(tag), `${label}: ${field} contains invalid tag "${tag}".`, errors);
        if (allowed[field].size && !allowed[field].has(tag)) {
          errors.push(`${label}: ${field} tag "${tag}" is not declared in tag_definitions.${field}.`);
        }
      });
    });

    assert(ref.links && typeof ref.links === 'object', `${label}: links object is required.`, errors);
    if (ref.links && typeof ref.links === 'object') {
      ['canonical', 'paper', 'project', 'code', 'video', 'doi', 'arxiv'].forEach((field) => {
        assert(Object.prototype.hasOwnProperty.call(ref.links, field), `${label}: links.${field} is required, use null if unknown.`, errors);
        const value = ref.links[field];
        assert(value === null || isUrl(value), `${label}: links.${field} must be null or an absolute http(s) URL.`, errors);
      });
    }
  });

  const newest = [...refs].sort((a, b) => (b.year - a.year) || (b.closeness - a.closeness) || String(a.title).localeCompare(String(b.title)));
  refs.forEach((ref, index) => {
    if (newest[index] && newest[index].slug !== ref.slug) {
      warnings.push('references are not in default newest-first order; build output will sort them.');
      return;
    }
  });

  return { errors, warnings };
}

function main() {
  const data = readJson(REFERENCES_PATH);
  const { errors, warnings } = validateReferences(data);

  warnings.forEach((warning) => console.warn(`warning: ${warning}`));

  if (errors.length) {
    errors.forEach((error) => console.error(`error: ${error}`));
    process.exit(1);
  }

  console.log(`REFERENCES.json OK (${data.references.length} references).`);
}

if (require.main === module) main();

module.exports = { validateReferences };
