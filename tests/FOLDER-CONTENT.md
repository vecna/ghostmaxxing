# tests

This folder contains the automated test suite for Ghostmaxxing.

Unit tests live in `tests/unit/`, browser end-to-end tests live in `tests/e2e/`, and reusable media fixtures live in `tests/fixtures/`. The test stack is Vitest for unit tests, Playwright for browser flows, JSDOM for DOM simulation, and node-canvas for canvas-related fixtures.

The tests are excluded from code2prompt to keep uploads compact, but they are present and maintained. Run `npm run test:unit` for unit coverage, `npm run test:e2e` for browser flows, or `npm test` for both.
