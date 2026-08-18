import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function extractGhostmaxxingKeysFromMain(mainSource) {
  const assignMatch = mainSource.match(/window\.gstmxx\s*=\s*\{([\s\S]*?)\n\};/);
  if (!assignMatch) {
    throw new Error('window.gstmxx assignment not found in lab-js/main.js');
  }

  const block = assignMatch[1];
  const keys = new Set();

  for (const rawLine of block.split('\n')) {
    if (!/^ {3}[^ ]/.test(rawLine)) continue;

    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;

    const getterSetter = line.match(/^(?:get|set)\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (getterSetter) {
      keys.add(getterSetter[1]);
      continue;
    }

    const keyedProperty = line.match(/^([A-Za-z_$][\w$]*)\s*:/);
    if (keyedProperty) {
      keys.add(keyedProperty[1]);
    }
  }

  return keys;
}

function extractGhostmaxxingKeysFromDts(dtsSource) {
  const ifaceMatch = dtsSource.match(/export interface GhostmaxxingApi\s*\{([\s\S]*?)\n\}/);
  if (!ifaceMatch) {
    throw new Error('GhostmaxxingApi interface not found in lab-js/Ghostmaxxing.d.ts');
  }

  const block = ifaceMatch[1];
  const keys = new Set();

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('*') || line.startsWith('/')) continue;

    const method = line.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if (method) {
      keys.add(method[1]);
      continue;
    }

    const property = line.match(/^([A-Za-z_$][\w$]*)\s*:/);
    if (property) {
      keys.add(property[1]);
    }
  }

  return keys;
}

describe('Ghostmaxxing.d.ts smoke', () => {
  it('declares every key exposed on window.gstmxx in main.js', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const root = path.resolve(here, '..', '..');
    const mainPath = path.join(root, 'lab-js', 'main.js');
    const dtsPath = path.join(root, 'lab-js', 'Ghostmaxxing.d.ts');

    const mainSource = fs.readFileSync(mainPath, 'utf8');
    const dtsSource = fs.readFileSync(dtsPath, 'utf8');

    const runtimeKeys = extractGhostmaxxingKeysFromMain(mainSource);
    const declaredKeys = extractGhostmaxxingKeysFromDts(dtsSource);

    const missing = [...runtimeKeys].filter((key) => !declaredKeys.has(key));
    expect(missing).toEqual([]);
  });
});
