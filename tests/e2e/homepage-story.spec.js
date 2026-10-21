import { test, expect } from '@playwright/test';

// The homepage story carousel, and the camera stage that used to occupy its
// slot and now runs on /about.html.
//
// The three things worth protecting here are the three that would silently
// stop working: the carousel must open on the second card (the whole point of
// the opening position), the page must never scroll sideways underneath it,
// and a card must not be reachable only by JavaScript.

test.describe('Ghostmaxxing homepage story', () => {
  test('presents the lab and realtime view as primary tools', async ({ page }) => {
    await page.goto('/index.html');

    await expect(page.locator('a.home-tool[href="/lab.html"]')).toBeVisible();
    await expect(page.locator('a.home-tool[href="/realtime.html"]')).toBeVisible();
  });

  test('opens on the second card and keeps every card in the document', async ({ page }) => {
    await page.goto('/index.html');

    const cards = page.locator('.story__card');
    await expect(cards).toHaveCount(10);

    // Card 2 is the one that carries the proposition for a reader who never
    // swipes, so landing on it is a behaviour, not a detail.
    const current = page.locator('.story__dot.is-current');
    await expect(current).toHaveCount(1);
    await expect(page.locator('.story__dot')).toHaveCount(10);
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
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/index.html');
    const dots = page.locator('.story__dot');

    await page.locator('.story__arrow[data-story-step="1"]').click();
    await expect(dots.nth(2)).toHaveClass(/is-current/);

    await dots.nth(5).click();
    await expect(dots.nth(5)).toHaveClass(/is-current/);

    await page.locator('.story__arrow[data-story-step="-1"]').click();
    await expect(dots.nth(4)).toHaveClass(/is-current/);
  });

  for (const width of [390, 1440, 1920, 2560]) {
    test(`keeps the penultimate card selected at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/index.html');

      const dots = page.locator('.story__dot');
      const penultimate = page.locator('.story__card').nth(-2);
      await dots.nth(-2).click();

      // The controls update before the browser finishes snapping. Inspect
      // the actual card position as well, then allow the scroll listener
      // to settle: it must not silently switch to the final outreach card.
      await expect.poll(() => penultimate.evaluate((card) => {
        const track = card.parentElement;
        const trackBox = track.getBoundingClientRect();
        const cardBox = card.getBoundingClientRect();
        return Math.abs(cardBox.left + cardBox.width / 2 -
          (trackBox.left + track.clientLeft + track.clientWidth / 2));
      })).toBeLessThan(1);
      await page.waitForTimeout(250);
      await expect(penultimate).toHaveAttribute('aria-current', 'true');
      await expect(dots.nth(-2)).toHaveClass(/is-current/);

      await page.locator('[data-story-step="1"]').click();
      await expect(page.locator('.story__card').last()).toHaveAttribute('aria-current', 'true');
      await page.waitForTimeout(250);
      await page.locator('[data-story-step="-1"]').click();
      await expect(penultimate).toHaveAttribute('aria-current', 'true');
      await expect.poll(() => penultimate.evaluate((card) => {
        const track = card.parentElement;
        const box = track.getBoundingClientRect();
        const cardBox = card.getBoundingClientRect();
        return Math.abs(cardBox.left + cardBox.width / 2 -
          (box.left + track.clientLeft + track.clientWidth / 2));
      })).toBeLessThan(1);
    });
  }

  test('settles on the penultimate card after smooth scrolling on a wide screen', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/index.html');
    await page.locator('.story__dot').nth(-2).click();

    await expect.poll(() => page.locator('.story__card').nth(-2).evaluate((card) => {
      const track = card.parentElement;
      const box = track.getBoundingClientRect();
      const cardBox = card.getBoundingClientRect();
      return Math.abs(cardBox.left + cardBox.width / 2 -
        (box.left + track.clientLeft + track.clientWidth / 2));
    })).toBeLessThan(1);
    await page.waitForTimeout(300);
    await expect(page.locator('.story__card').nth(-2)).toHaveAttribute('aria-current', 'true');
  });

  test('keeps its height while lazy-loaded portraits enter the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/index.html');

    const track = page.locator('#storyTrack');
    const dots = page.locator('.story__dot');
    const cards = page.locator('.story__card');
    const initialHeight = await track.evaluate((element) => element.getBoundingClientRect().height);

    for (let index = 0; index < await dots.count(); index += 1) {
      await dots.nth(index).click();
      const image = cards.nth(index).locator('.story__image');
      if (await image.count()) {
        await expect.poll(() => image.evaluate(
          (element) => element.complete && element.naturalWidth > 0,
        )).toBe(true);
      }

      const height = await track.evaluate((element) => element.getBoundingClientRect().height);
      expect(
        Math.abs(height - initialHeight),
        `carousel height changed after card ${index + 1} loaded`,
      ).toBeLessThan(1);
    }
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

  test('offers working English outreach links on the final card', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const destinations = [
      'https://sindacato.nina.watch/en/blog/ghostati-new-software/',
      'https://sindacato.nina.watch/en/blog/ghostati-workshop-october-2026/',
      'https://sindacato.nina.watch/en/blog/ghostati-workshop-may-2026/',
      'https://sindacato.nina.watch/en/ghostati/report/',
    ];
    // Test actual navigation without depending on an external service.
    await page.route('https://sindacato.nina.watch/**', (route) => route.fulfill({
      contentType: 'text/html', body: '<h1>External destination</h1>',
    }));

    for (const destination of destinations) {
      await page.goto('/index.html');
      await page.locator('.story__dot').last().click();
      const finalCard = page.locator('.story__card').last();
      await expect(finalCard).toHaveAttribute('aria-current', 'true');
      await expect(finalCard.locator('.story__image')).toHaveCount(0);
      await expect(finalCard.locator('a')).toHaveCount(destinations.length);
      await expect(finalCard).toContainText("NINA's Universal Union");
      await finalCard.locator(`a[href="${destination}"]`).click();
      await expect(page).toHaveURL(destination);
    }
  });

  test('does not intercept an outreach link in a side preview', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/index.html');
    const destination = 'https://sindacato.nina.watch/en/ghostati/report/';
    await page.route(destination, (route) => route.fulfill({
      contentType: 'text/html', body: '<h1>Reporting guidance</h1>',
    }));
    await page.locator('.story__dot').nth(-2).click();
    // A partial preview can expose a link before the card is current.
    // Dispatch directly so this checks event delegation without auto-scrolling
    // the locator into view and changing which card is selected first.
    await page.locator(`.story__outro a[href="${destination}"]`).dispatchEvent('click');
    await expect(page).toHaveURL(destination);
  });

  test('keeps the final card readable and within the viewport on a small screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/index.html');
    await page.locator('.story__dot').last().click();
    const finalCard = page.locator('.story__card').last();
    await expect(finalCard).toHaveAttribute('aria-current', 'true');
    expect(await finalCard.locator('.story__outro').evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    )).toBe(true);
    for (const link of await finalCard.locator('a').all()) {
      await expect(link).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

  test('works without JavaScript: all ten cards stay readable', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/index.html');
    await expect(page.locator('.story__card')).toHaveCount(10);
    await expect(page.locator('.story__outro a')).toHaveCount(4);
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
