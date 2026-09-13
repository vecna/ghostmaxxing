import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// genealogy.html is generated from both datasets by scripts-dev/build-genealogy.py.
// These checks catch the two ways it goes stale: a dataset grew and the page was
// not rebuilt, or a mark points at a slug the destination page no longer renders.

const root = process.cwd();
const references = JSON.parse(fs.readFileSync(path.join(root, 'references/REFERENCES.json'), 'utf8')).references;
const projects = JSON.parse(fs.readFileSync(path.join(root, 'projects/PROJECTS.json'), 'utf8')).projects;

test.describe('Ghostmaxxing genealogy page', () => {
  test('draws one mark per reference and per project, in the chart that is visible', async ({ page }) => {
    await page.goto('/genealogy.html');
    await expect(page.getByRole('heading', { name: 'Genealogy of Face Surveillance' })).toBeVisible();

    // Two charts are in the DOM and exactly one is displayed at any width.
    const wide = page.locator('.gen-chart--wide');
    const narrow = page.locator('.gen-chart--narrow');
    await expect(wide).toBeVisible();
    await expect(narrow).toBeHidden();

    const expected = references.length + projects.length;
    await expect(wide.locator('a.gen-marklink')).toHaveCount(expected);
    await expect(narrow.locator('a.gen-marklink')).toHaveCount(expected);
    await expect(wide.locator('a.gen-marklink[href^="/references/#"]')).toHaveCount(references.length);
    await expect(wide.locator('a.gen-marklink[href^="/projects/#"]')).toHaveCount(projects.length);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(wide).toBeHidden();
    await expect(narrow).toBeVisible();
  });

  test('every mark links to an entry that exists on its destination page', async ({ page }) => {
    await page.goto('/genealogy.html');
    const hrefs = await page.locator('.gen-chart--wide a.gen-marklink').evaluateAll(
      (links) => links.map((a) => a.getAttribute('href'))
    );
    expect(hrefs.length).toBeGreaterThan(0);

    const byPage = new Map();
    for (const href of hrefs) {
      const [pagePath, slug] = href.split('#');
      if (!byPage.has(pagePath)) byPage.set(pagePath, new Set());
      byPage.get(pagePath).add(slug);
    }
    for (const [pagePath, slugs] of byPage) {
      await page.goto(pagePath);
      for (const slug of slugs) {
        await expect(page.locator(`[id="${slug}"]`), `${pagePath}#${slug}`).toHaveCount(1);
      }
    }
  });

  test('a mark reaches its project row and the row is highlighted', async ({ page }) => {
    await page.goto('/genealogy.html');
    const first = page.locator('.gen-chart--wide a.gen-marklink[href^="/projects/#"]').first();
    const href = await first.getAttribute('href');
    await first.click();
    await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    const row = page.locator(`[id="${href.split('#')[1]}"]`);
    await expect(row).toBeVisible();
    // projects-list.css paints the :target row cream so the reader can find it.
    expect(await row.evaluate((el) => el.matches(':target'))).toBe(true);
  });
});
