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
    await expect(cards).toHaveCount(9);

    // Card 2 is the one that carries the proposition for a reader who never
    // swipes, so landing on it is a behaviour, not a detail.
    const current = page.locator('.story__dot.is-current');
    await expect(current).toHaveCount(1);
    await expect(page.locator('.story__dot')).toHaveCount(9);
    const index = await page.locator('.story__dot').evaluateAll(
      (dots) => dots.findIndex((dot) => dot.classList.contains('is-current')),
    );
    expect(index).toBe(1);
    await expect(page.locator('#story-card-2')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.story__card[aria-current="true"]')).toHaveCount(1);

    // Check the physical scroll position as well as the controls: story-card-2
    // must actually occupy the centre, with story-card-1 behind it.
    await expect.poll(() => page.locator('#storyTrack').evaluate((track) => {
      const midpoint = track.getBoundingClientRect().left + track.clientWidth / 2;
      return Array.from(track.querySelectorAll('.story__card')).reduce((nearest, card) => {
        const box = card.getBoundingClientRect();
        const gap = Math.abs(box.left + box.width / 2 - midpoint);
        return gap < nearest.gap ? { id: card.id, gap } : nearest;
      }, { id: '', gap: Infinity }).id;
    })).toBe('story-card-2');

    // Every caption is real text, not baked into the image.
    await expect(page.locator('.story__card').nth(1).locator('.story__text'))
      .toContainText('cannot even find a face');
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

  test('reopens on story-card-2 after a reload from another card', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/index.html');

    await page.locator('.story__dot').nth(6).click();
    await expect(page.locator('#story-card-7')).toHaveAttribute('aria-current', 'true');

    await page.reload();
    await expect(page.locator('#story-card-2')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.story__card[aria-current="true"]')).toHaveCount(1);
  });

  test('advances by clicking the visible side previews', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/index.html');
      const track = page.locator('#storyTrack');
      const dots = page.locator('.story__dot');
      const box = await track.boundingBox();
      expect(box).not.toBeNull();

      // The carousel opens on card 2. Its neighbouring cards remain visible
      // as narrow slices at the left and right edges of the track.
      await page.mouse.click(box.x + 4, box.y + 30);
      await expect(dots.nth(0)).toHaveClass(/is-current/);
      await expect(page.locator('#story-card-1 .story__state')).toHaveText('Define a baseline');

      await page.goto('/index.html');
      const resetBox = await track.boundingBox();
      expect(resetBox).not.toBeNull();
      await page.mouse.click(resetBox.x + resetBox.width - 4, resetBox.y + 30);
      await expect(dots.nth(2)).toHaveClass(/is-current/);

      await page.mouse.click(resetBox.x + 4, resetBox.y + 30);
      await expect(dots.nth(1)).toHaveClass(/is-current/);
    }
  });

  test('moves with left and right arrow keys before and after interaction', async ({ page }) => {
    await page.goto('/index.html');
    const track = page.locator('#storyTrack');
    const dots = page.locator('.story__dot');

    await expect(track).toHaveAttribute('tabindex', '0');
    await expect(page.locator('body')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(dots.nth(2)).toHaveClass(/is-current/);

    await page.keyboard.press('ArrowLeft');
    await expect(dots.nth(1)).toHaveClass(/is-current/);

    await track.focus();
    await page.keyboard.press('ArrowRight');
    await expect(dots.nth(2)).toHaveClass(/is-current/);

    // Keyboard navigation must keep working when a control owns the focus.
    const next = page.locator('.story__arrow[data-story-step="1"]');
    await next.focus();
    await page.keyboard.press('ArrowRight');
    await expect(dots.nth(3)).toHaveClass(/is-current/);

    await dots.nth(5).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(dots.nth(2)).toHaveClass(/is-current/);
  });

  test('never scrolls the page sideways, at any width', async ({ page }) => {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/index.html');
      await page.evaluate(() => window.scrollTo(600, 0));
      expect(await page.evaluate(() => window.scrollX), `page slid sideways at ${width}px`).toBe(0);
    }
  });

  test('works without JavaScript: all nine cards stay readable', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/index.html');
    await expect(page.locator('.story__card')).toHaveCount(9);
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
    const routes = page.locator('#camStage .btn-final');
    await expect(routes).toHaveCount(3);
    await expect(routes.nth(0)).toHaveAttribute('href', '/genealogy.html');
    await expect(routes.nth(1)).toHaveAttribute('href', '/projects/');
    await expect(routes.nth(2)).toHaveAttribute('href', '/references/');
  });
});
