/** Isolate face-api recognition from the optional mesh loop in lab E2E.
 * face-api retains its real model, weights and normal inference backend.
 */
export async function prepareRealFaceApiLab(page, entryPath) {
  if (entryPath === '/lab-js/main.js') {
    // The optional mesh animation is unrelated to face-api recognition and
    // can block browser input while compiling/running MediaPipe in headless
    // environments. Its behaviour belongs to the overlay tests.
    await page.route('/lab-js/mediapipe-loop.js', (route) => route.fulfill({
      contentType: 'application/javascript', body: 'export {};',
    }));
    // Keep the separate ImageEmbedder real, with the CPU delegate.
    for (const modulePath of ['/lab-js/engine-3d.js']) {
      await page.route(modulePath, async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        if (!source.includes("delegate: 'GPU'")) {
          throw new Error(`Review the MediaPipe CPU test override: ${modulePath}`);
        }
        await route.fulfill({ response, body: source.replaceAll("delegate: 'GPU'", "delegate: 'CPU'") });
      });
    }
  }
}
