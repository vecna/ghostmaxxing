import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const projectsPath = path.resolve(process.cwd(), 'projects/PROJECTS.json');

function loadProjects() {
  return JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
}

test.describe('Ghostmaxxing complementary projects page', () => {
  test('renders the catalogue and filters it by one strategy', async ({ page }) => {
    const data = loadProjects();
    const category = data.categories[0];
    const expected = data.projects.filter((project) => project.category === category.id).length;

    await page.goto('/projects/');
    await expect(page.getByRole('heading', { name: 'Camouflage projects' })).toBeVisible();
    await expect(page.locator('.project-row')).toHaveCount(data.projects.length);

    await page.getByRole('button', { name: category.label }).click();
    await expect(page.locator('.project-row:visible')).toHaveCount(expected);
    await expect(page.locator('#projects-visible-count')).toHaveText(String(expected));
  });

  test('offers cultural references as the second-level destination', async ({ page }) => {
    await page.goto('/projects/');
    await expect(page.getByRole('navigation', { name: 'Related research' }).getByRole('link', { name: 'Cultural references' })).toHaveAttribute('href', '/references/');
  });
});
