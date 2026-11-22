# tests/e2e

This folder contains Playwright end-to-end tests for browser-facing flows.

The tests exercise complementary-project generation and category filtering, cultural-reference page rendering and archive navigation, the generated genealogy chart (one mark per reference and per project, every mark resolving to an entry on its destination page), the homepage story carousel (eight cards, opening on the second, readable without JavaScript, and never scrolling the page sideways) together with the camera stage in its new home on the about page, loader behavior, overlay mode behavior, and face-matching workflows against the static app served locally.

These files are excluded from code2prompt because they are browser test implementation detail, but the project keeps them as regression coverage for user-visible flows.

The Workshop UI tests load known archive records and model responses to exercise
the verdicts, identity changes, overlays, About, and the clip consent flow.
The face-matching integration test also runs the actual face-api models on
`workshop-sequence.webm` to save two faces and observe a blank frame. Realtime's
camera baseline test opens the Workshop Lab to verify the shared ID and preview.

`ghostyle-transfer.spec.js` exercises local photo loading, preview, JavaScript export and shared Lab face references with the bundled models.
