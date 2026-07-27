#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.resolve(ROOT, '..', 'gstmxx-backend', 'client-interface');
const KEEP_FILE = '.keep';

// Chosen to match runtime/webroot needs while keeping source and tests out.
const COPY_DIRS = [
  'images',
  'styles',
  'scripts',
  'references',
  'ghostyles',
  'docs',
  'data',
];

const COPY_FILES = [
  'sitemap.xml',
  'ghostyles.json',
  'index.html',
  'about.html',
  'lab.html',
  'realtime.html',
  'loader.html',
  'report.html',
  'robots.txt',
  'llms.txt'
];

function cleanTargetDir(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(targetDir)) {
    fs.rmSync(path.join(targetDir, entry), { recursive: true, force: true });
  }

  fs.writeFileSync(path.join(targetDir, KEEP_FILE), '\n', 'utf8');
}

function copyEntry(relPath) {
  const from = path.join(ROOT, relPath);
  const to = path.join(TARGET, relPath);

  if (!fs.existsSync(from)) {
    console.warn(`[install] skip missing: ${relPath}`);
    return;
  }

  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
    console.log(`[install] copied dir: ${relPath}`);
    return;
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`[install] copied file: ${relPath}`);
}

function copyTopLevelHtmlFiles() {
  const htmlFiles = fs
    .readdirSync(ROOT)
    .filter((name) => name.toLowerCase().endsWith('.html'))
    .sort();

  for (const fileName of htmlFiles) {
    copyEntry(fileName);
  }
}

function main() {
  cleanTargetDir(TARGET);
  console.log(`[install] target cleaned and initialized: ${TARGET}`);

  copyTopLevelHtmlFiles();

  for (const relPath of COPY_FILES) copyEntry(relPath);
  for (const relPath of COPY_DIRS) copyEntry(relPath);

  console.log('[install] completed.');
}

main();
