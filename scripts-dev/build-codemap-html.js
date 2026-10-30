#!/usr/bin/env node
/**
 * build-codemap-html.js — inline codemap.json into the script-map viewer.
 *
 * The viewer (codemap/codemap-template.html) renders one flowchart per
 * maintainer script from the JSON that build-codemap.js produces. It loads
 * Mermaid from a CDN at view time; without it the page falls back to a text
 * rendering of the same flow.
 *
 * Usage: node scripts-dev/build-codemap-html.js [codemap.json] [codemap.html]
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MARKER = '/*__CODEMAP__*/ null';

const src = process.argv[2] || path.join(ROOT, 'codemap', 'codemap.json');
const out = process.argv[3] || path.join(ROOT, 'codemap', 'codemap.html');
const tpl = fs.readFileSync(path.join(ROOT, 'codemap', 'codemap-template.html'), 'utf8');
const data = fs.readFileSync(src, 'utf8');

if (!tpl.includes(MARKER)) {
   console.error(`codemap viewer: marker ${MARKER} not found in codemap-template.html`);
   process.exit(1);
}
// "</script>" inside the JSON would end the inline script early.
const safe = data.replace(/<\//g, '<\\/');
fs.writeFileSync(out, tpl.replace(MARKER, safe));
console.log(`codemap viewer -> ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
