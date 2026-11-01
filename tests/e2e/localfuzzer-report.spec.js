import { test, expect } from '@playwright/test';
import reportModule from '../../scripts-dev/ghostyle-fuzz/report.cjs';
import { readFileSync } from 'node:fs';

const { buildReportHtml } = reportModule;

function reportFixture() {
  const imprints = [
    { id: 0, t: 0, yaw: -5, pitch: 0, roll: 0, bin: [-1, 0], noise: 0.12, width: 160, height: 120 },
    { id: 1, t: 2, yaw: 5, pitch: 0, roll: 0, bin: [0, 0], noise: 0.15, width: 160, height: 120 },
  ];
  const trial = (recipeId, seed, distances) => {
    const rows = distances.map((distance, id) => ({
      id,
      t: imprints[id].t,
      yaw: imprints[id].yaw,
      pitch: 0,
      detection: distance === null ? 'lost' : 'ok',
      dAtlas: distance,
      dPair: distance === null ? null : distance + 0.05,
    }));
    const lost = distances.filter((value) => value === null).length;
    const descriptor = distances.filter((value) => value !== null && value >= 0.6).length;
    return {
      recipeId,
      seed,
      pruned: false,
      recipe: { name: recipeId, opacity: 0.8 },
      rows,
      coverage: 0.16,
      palette: { colours: [{ hex: '#101010', xterm: 233, deltaL: 55, deltaE: 42 }] },
      strokes: [{ colour: '#101010', colourIndex: 0, anchorPolygonPx: [[20, 20], [80, 20], [80, 35], [20, 35]], clippedShare: 0, regions: { eyes: 0.2, brows: 0, nose: 0, lips: 0 } }],
      scores: {
        imprints: distances.length,
        lost,
        lostRate: lost / distances.length,
        descriptorEscape: descriptor / distances.length,
        descriptorEscapeDetected: descriptor / (distances.length - lost),
        escapeRate: (lost + descriptor) / distances.length,
        worstCase: Math.min(...distances.filter((value) => value !== null)),
        allLost: false,
        medianMargin: 0.02,
      },
    };
  };
  return {
    threshold: 0.6,
    atlasArg: 'pose-atlas.json',
    anchorImage: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="120"/%3E',
    runs: [{ seed: 10 }],
    atlas: {
      source: { file: 'fixture.mp4', width: 160, height: 120, fps: 30, duration: 2 },
      imprints,
      anchorId: 0,
      config: { bin: 10 },
      presence: { gaps: [] },
      unrecognisedBins: [],
      skinSwatch: { hexForDisplay: '#b98065', lab: [61, 18, 16], lRange: [48, 73] },
    },
    trials: [
      trial('recipe-one', 10, [0.42, 0.72]),
      trial('recipe-one', 11, [null, 0.65]),
      trial('recipe-two', 20, [0.31, 0.68]),
      trial('recipe-two', 21, [0.48, null]),
    ],
  };
}

test('print view expands every recipe and explains visualizations once', async ({ page }) => {
  await page.setContent(buildReportHtml(reportFixture()));

  await expect(page.getByRole('link', { name: 'How to read this report' })).toHaveAttribute('href', 'https://ghostmaxxing.vecna.eu/docs/guides/localfuzzer-report.html');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));

  const printRecipes = page.locator('#printReport > .print-recipe');
  await expect(printRecipes).toHaveCount(2);
  await expect(printRecipes.nth(0)).toContainText('Recipe 1 of 2 · recipe-one');
  await expect(printRecipes.nth(1)).toContainText('Recipe 2 of 2 · recipe-two');
  await expect(printRecipes.nth(0).locator('.print-guide')).toHaveCount(8);
  await expect(printRecipes.nth(1).locator('.print-guide')).toHaveCount(0);
  const guideSource = readFileSync('docs-src/en/localfuzzer-report.body.html', 'utf8');
  const printedGuidance = await printRecipes.nth(0).locator('.print-guide p').allTextContents();
  for (const paragraph of printedGuidance) expect(guideSource).toContain(paragraph);
  await expect(printRecipes.locator('canvas')).toHaveCount(0);
  await expect(printRecipes.locator('img.print-canvas')).toHaveCount(2);

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#screenReport')).toBeHidden();
  await expect(page.locator('#printReport')).toBeVisible();
});
