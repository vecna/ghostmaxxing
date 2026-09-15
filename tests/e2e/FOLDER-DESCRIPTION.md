# tests/e2e

This folder contains Playwright end-to-end tests for browser-facing flows.

The tests exercise complementary-project generation and category filtering, cultural-reference page rendering and archive navigation, the generated genealogy chart (one mark per reference and per project, every mark resolving to an entry on its destination page), the homepage story carousel (eight cards, opening on the second, readable without JavaScript, and never scrolling the page sideways) together with the camera stage in its new home on the about page, loader behavior, overlay mode behavior, and face-matching workflows against the static app served locally.

These files are excluded from code2prompt because they are browser test implementation detail, but the project keeps them as regression coverage for user-visible flows.

Loader and overlay tests intercept the current `/lab-js/vendor/` runtime URLs
so their model stubs actually run. The face-matching test uses the real vendored
models and `tests/fixtures/mock-face.y4m`; because this fixture moves, it asserts
a recognised identity below the current threshold rather than an exact zero
distance. Its subsequent non-match UI assertion uses a synthetic event, not a
claim that the video evades recognition.
