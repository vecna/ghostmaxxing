import { expect, test } from '@playwright/test';

const id = 'a1295f48-fd65-4d11-bb18-34b49d4cccb4';
const attempts = { total: 8, complete: 7, pruned: 1 };
const receivedAt = '2026-11-23T09:00:00.000Z';
const summary = { submissionId: id, receivedAt, preset: 'quick', attempts, recipeCount: 1, researchCount: 1, annotationCount: 1 };
const study = { title: 'Pose coverage study', url: 'https://example.org/pose-study' };
const annotations = [{ createdAt: receivedAt, research: study, note: 'Included in the exploratory analysis.' }];

test('browses the beta overview and opens a public submission by ID', async ({ page }) => {
   const total = { submissions: 1, recipes: 1, trials: 8, complete: 7, pruned: 1, linkedSubmissions: 1 };
   await page.route('**/api/fuzzer-results', (route) => route.fulfill({ json: { ok: true, total, items: [summary], nextBefore: null } }));
   await page.route(`**/api/fuzzer-results/${id}`, (route) => route.fulfill({ json: {
      ok: true, ...summary, annotations,
      result: {
         app: { version: '1.3.0' }, runtime: { backend: 'swiftshader' }, preset: 'quick', attempts,
         method: { matchThreshold: 0.6, geometryVersion: 2, atlas: { bin: 15 } },
         atlas: { imprints: 12, yaw: [-30, 30], pitch: [-10, 10] },
         recipes: [{ recipeId: 'deadbeef-g2', trials: 8, complete: 7, pruned: 1, aggregate: { lostRate: 0.2 },
            definition: { shape: 'line', count: 3, zones: ['eyes'], palette: {} }, plan: { seed: 23 }, best: null }],
         selectedGhostyles: [],
      },
   } }));
   await page.setViewportSize({ width: 390, height: 844 });
   await page.goto('/research.html');
   await expect(page.getByRole('dialog')).toBeVisible();
   await page.getByRole('button', { name: 'Close the beta notice and continue to the page' }).click();
   await expect(page.getByRole('heading', { name: 'Public Research' })).toBeVisible();
   await expect(page.locator('#research-totals')).toContainText('Completed trials');
   await page.getByRole('link', { name: id }).click();
   await expect(page).toHaveURL(new RegExp(`/research-submission.html\\?id=${id}$`));
   await page.getByRole('button', { name: 'Close the beta notice and continue to the page' }).click();
   await expect(page.getByRole('link', { name: study.title })).toHaveAttribute('href', study.url);
   await expect(page.getByText('Included in the exploratory analysis.')).toBeVisible();
   await expect(page.getByRole('heading', { name: 'Recipe 1 · deadbeef-g2' })).toBeVisible();
   await page.getByText('Recipe parameters and trial settings').click();
   await expect(page.getByText('eyes', { exact: true })).toBeVisible();
   expect(await page.locator('body').evaluate(body => body.scrollWidth)).toBe(390);
});

test('the Local Fuzzer keeps a public receipt and checks recorded research after reload', async ({ page }) => {
   const pagePath = '/scripts-dev/localfuzzer/public/';
   const jobId = 'fixture-job';
   const job = {
      id: jobId, label: 'Fixture run', status: 'done', preset: 'quick', video: { original: 'local.mp4' },
      steps: [], commands: [], summary: {
         generatedAt: receivedAt, threshold: 0.6, recipes: [], materialised: [],
         atlas: { imprints: 12, yaw: [-30, 30], pitch: [-10, 10], pxPerCm: 1, sharpnessMedian: 2, cleanScoreMean: 0.9, noiseFloor: { median: 0.1, p90: 0.2 } },
      },
   };
   const info = {
      tool: 'fixture', warnings: [], presets: { quick: { label: 'Quick', plan: { atlas: {}, cells: [] } } },
      feedback: { endpoint: 'http://localhost:8080/api/fuzzer-results', consentVersion: '2026-11-v2' },
   };
   await page.route('**/api/info', (route) => route.fulfill({ json: info }));
   await page.route('**/api/jobs', (route) => route.fulfill({ json: { jobs: [job] } }));
   await page.route(`**/api/jobs/${jobId}`, (route) => route.fulfill({ json: job }));
   await page.route(`**/api/jobs/${jobId}/log?*`, (route) => route.fulfill({ json: {} }));
   await page.route(`**/api/jobs/${jobId}/feedback`, (route) => {
      expect(route.request().postDataJSON()).toEqual({ consent: true, consentVersion: '2026-11-v2', selectedGhostyles: [] });
      return route.fulfill({ json: { submissionId: id } });
   });
   await page.route(`**/api/fuzzer-results/${id}`, (route) => route.fulfill({ json: { annotations } }));

   await page.goto(pagePath);
   await page.getByRole('button', { name: 'Open', exact: true }).click();
   await page.getByLabel(/I agree to publish/).check();
   const download = page.waitForEvent('download');
   await page.getByRole('button', { name: 'Publish results' }).click();
   expect((await download).suggestedFilename()).toBe(`ghostmaxxing-research-${id}.json`);
   await expect(page.getByRole('link', { name: `View submission ${id}` })).toHaveAttribute('href', `http://localhost:8080/research-submission.html?id=${id}`);
   await page.reload();
   await page.getByRole('button', { name: 'Open', exact: true }).click();
   await page.getByRole('button', { name: 'Check research use' }).click();
   await expect(page.getByText(/Linked research: Pose coverage study/)).toBeVisible();
});
