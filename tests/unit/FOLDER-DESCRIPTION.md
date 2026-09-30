# tests/unit

This folder contains Vitest unit tests for the browser modules in `lab-js/`.

The tests cover camera setup, local storage, DOM helpers, rendering utilities, engine behavior, MediaPipe loop logic, Ghostyle loading, upload consent, export helpers, and TypeScript declaration expectations.

Unit tests normally use one test file per production file. A small number of older, unusually large modules keep a second test file because their scenarios require incompatible hoisted module mocks; each such file carries a comment explaining that isolation boundary. Mocks stay beside the test that owns them: sharing `vi.mock()` declarations through a global include would make every test load the same dependency graph, hide its actual collaborators, and prevent those isolated mock configurations. Reusable data or DOM builders may still be shared when they do not alter module loading.

Tests assert each behavior at its public boundary. Branch cases are kept only when they produce a distinct result or side effect; tests are not added solely to execute the same source line again.

These files are excluded from code2prompt because they are test implementation detail, but the top-level tests folder summary tells the chatbot the unit test suite exists and how it is run.

`mark-ai-images.test.js` uses temporary images to verify visible JPEG/PNG marking, byte-preserving repeat runs, dry-run and error handling. It imports the maintainer tool from `scripts-dev/` and uses the existing node-canvas dependency.
