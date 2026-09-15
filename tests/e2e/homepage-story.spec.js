import { test, expect } from '@playwright/test';

// The homepage story carousel, and the camera stage that used to occupy its
// slot and now runs on /about.html.
//
// The three things worth protecting here are the three that would silently
// stop working: the carousel must open on the second card (the whole point of
// the opening position), the page must never scroll sideways underneath it,
// and a card must not be reachable only by JavaScript.

test.describe('Ghostmaxxing homepage story', () => {
  test('opens on the second card and keeps every card in the document', async ({ page }) => {
    await page.goto('/index.html');

    const cards = page.locator('.story__card');
    await expect(cards).toHaveCount(8);
    await expect(page.getByRole('heading', { name: 'One Ghostyle, three faces.' })).toBeVisible();

    // Card 2 is the one that carries the proposition for a reader who never
    // swipes, so landing on it is a behaviour, not a detail.
    const current = page.locator('.story__dot.is-current');
    await expect(current).toHaveCount(1);
    await expect(page.locator('.story__dot')).toHaveCount(8);
    const index = await page.locator('.story__dot').evaluateAll(
      (dots) => dots.findIndex((dot) => dot.classList.contains('is-current')),
    );
    expect(index).toBe(1);

    // Every caption is real text, not baked into the image.
    await expect(page.locator('.story__card').nth(1).locator('.story__text'))
      .toContainText('threshold');
  });

  test('advances with the dots and the arrows', async ({ page }) => {
    await page.goto('/index.html');
    const dots = page.locator('.story__dot');

    await page.locator('.story__arrow[data-story-step="1"]').click();
    await expect(dots.nth(2)).toHaveClass(/is-current/);

    await dots.nth(5).click();
    await expect(dots.nth(5)).toHaveClass(/is-current/);

    await page.locator('.story__arrow[data-story-step="-1"]').click();
    await expect(dots.nth(4)).toHaveClass(/is-current/);
  });

  test('never scrolls the page sideways, at any width', async ({ page }) => {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/index.html');
      await page.evaluate(() => window.scrollTo(600, 0));
      expect(await page.evaluate(() => window.scrollX), `page slid sideways at ${width}px`).toBe(0);
    }
  });

  test('works without JavaScript: all eight cards stay readable', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/index.html');
    await expect(page.locator('.story__card')).toHaveCount(8);
    // The controls are built by story.js and stay hidden without it, rather
    // than sitting there doing nothing.
    await expect(page.locator('#storyControls')).toBeHidden();
    await expect(page.locator('.story__track')).toBeVisible();
    await context.close();
  });
});

test.describe('The camera stage after its move', () => {
  test('is gone from the homepage and running on the about page', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#camStage')).toHaveCount(0);

    await page.goto('/about.html');
    await expect(page.locator('#camStage')).toBeVisible();
    // pages-js/camera-stage.js builds the field from the <template>s; an empty
    // field means the script or the templates did not travel with the markup.
    await expect(page.locator('#camField .cam-spot').first()).toBeVisible();
    expect(await page.locator('#camField .cam-spot').count()).toBeGreaterThan(5);
  });

  test('offers the three archives under the field', async ({ page }) => {
    await page.goto('/about.html');
    const routes = page.locator('.about-route');
    await expect(routes).toHaveCount(3);
    await expect(routes.nth(0)).toHaveAttribute('href', '/genealogy.html');
    await expect(routes.nth(1)).toHaveAttribute('href', '/projects/');
    await expect(routes.nth(2)).toHaveAttribute('href', '/references/');
  });
});
