# tests/fixtures/docs-transfer

Optional image fixtures used only by
`scripts-dev/capture-doc-screenshots.cjs` to document the completed
`ghostyle-transfer.html` workflow.

Add these three consented, non-sensitive images:

| Filename | Required content |
| --- | --- |
| `before.jpg` | The source face before the Ghostyle is applied. |
| `after.jpg` | The same source face, pose, crop, and lighting after the Ghostyle is applied. |
| `target.jpg` | A different target frame or face that will receive the extracted pattern. |

Keep the source pair tightly aligned. A plain background, frontal pose, even
lighting, and clearly visible face produce the most legible documentation.
Remove audio, GPS/EXIF, and unrelated people before committing media.

If these files are absent, screenshot generation remains successful for the
Lab, Loader, and empty Transfer workbench. The completed Transfer result is
listed as skipped in the generated manifest.
