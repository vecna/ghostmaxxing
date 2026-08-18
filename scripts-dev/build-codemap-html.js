#!/usr/bin/env node
/**
 * build-codemap-html.js — inline codemap.json into the standalone viewer.
 * Usage: node scripts-dev/build-codemap-html.js [codemap.json] [codemap.html]
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const src = process.argv[2] || path.join(ROOT, 'codemap', 'codemap.json');
const out = process.argv[3] || path.join(ROOT, 'codemap', 'codemap.html');
const tpl = fs.readFileSync(path.join(ROOT, 'codemap', 'codemap-template.html'), 'utf8');
const data = fs.readFileSync(src, 'utf8');

fs.writeFileSync(out, tpl.replace('/*__CODEMAP__*/ null', data));
console.log(`codemap viewer -> ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, self-contained)`);
