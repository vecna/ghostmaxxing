import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const referencesPath = path.resolve(process.cwd(), 'references/REFERENCES.json');

function loadReferenceCount() {
  const data = JSON.parse(fs.readFileSync(referencesPath, 'utf8'));
  expect(Array.isArray(data.references)).toBeTruthy();
  return data.references.length;
}

test.describe('Ghostmaxxing References page', () => {
  test('renders one generated entry for each reference in REFERENCES.json', async ({ page }) => {
    const expectedReferenceCount = loadReferenceCount();

    await page.goto('/references/index.html');

    await expect(page.getByRole('heading', { name: 'A working genealogy of face-recognition camouflage.' })).toBeVisible();
    await expect(page.locator('#references-list .reference-entry')).toHaveCount(expectedReferenceCount);
  });
});
