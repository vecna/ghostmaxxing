#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const i18nPath = path.join(root, 'scripts', 'i18n.js');
const translationsDir = path.join(root, 'translations');
const potPath = path.join(translationsDir, 'ghostmaxxing.pot');
const csvPath = path.join(translationsDir, 'ghostmaxxing-summary.csv');

function extractMessages(source) {
   const marker = 'export const messages = ';
   const start = source.indexOf(marker);
   if (start === -1) throw new Error('messages export not found');

   const bodyStart = start + marker.length;
   const bodyEnd = source.indexOf('\n};', bodyStart);
   if (bodyEnd === -1) throw new Error('messages object terminator not found');

   const objectSource = source.slice(bodyStart, bodyEnd + 2);
   return vm.runInNewContext(`(${objectSource})`, {}, { timeout: 1000 });
}

function escapePo(value) {
   return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
}

function escapeCsv(value) {
   const stringValue = String(value ?? '');
   return `"${stringValue.replace(/"/g, '""')}"`;
}

function sourceRefs(context) {
   return String(context || 'scripts/i18n.js')
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean);
}

function buildPot(messages) {
   const today = new Date().toISOString().slice(0, 10);
   const lines = [
      '# Ghostmaxxing translation template.',
      '# CopyLeft (C) 2026 vecna.eu',
      '# This file is distributed under the same license as the Ghostmaxxing package (AGPL-3).',
      '#',
      'msgid ""',
      'msgstr ""',
      '"Project-Id-Version: Ghostmaxxing 0.1.0\\n"',
      `"POT-Creation-Date: ${today}\\n"`,
      '"Language-Team: NotYetExisting <translators at vecna dot eu>\\n"',
      '"Content-Type: text/plain; charset=UTF-8\\n"',
      '',
   ];

   for (const [key, entry] of Object.entries(messages)) {
      if (entry.notes) lines.push(`#. ${entry.notes}`);
      lines.push(`#. key: ${key}`);
      lines.push(`#. it: ${entry.it}`);
      for (const ref of sourceRefs(entry.context)) lines.push(`#: ${ref}`);
      lines.push(`msgid "${escapePo(entry.en)}"`);
      lines.push('msgstr ""');
      lines.push('');
   }

   return `${lines.join('\n')}`;
}

function buildCsv(messages) {
   const rows = [
      ['string key', 'context (file:line)', 'Italian', 'English', 'Portuguese'],
      ...Object.entries(messages).map(([key, entry]) => [
         key,
         entry.context || '',
         entry.it,
         entry.en,
         entry.pt,
      ]),
   ];

   return `${rows.map((row) => row.map(escapeCsv).join('|')).join('\n')}\n`;
}

fs.mkdirSync(translationsDir, { recursive: true });
const messages = extractMessages(fs.readFileSync(i18nPath, 'utf8'));
fs.writeFileSync(potPath, buildPot(messages));
fs.writeFileSync(csvPath, buildCsv(messages));
console.log(`Wrote ${Object.keys(messages).length} strings to ${path.relative(root, potPath)} and ${path.relative(root, csvPath)}.`);
