# scripts-dev/ghostyle-fuzz

Support files of `scripts-dev/ghostyle-fuzz.cjs`, the random-trial search for
Ghostyles over the head poses of one video. Documentation:
`tutorials/ghostyle-fuzz.md`.

- `fuzz-core.mjs` — pure helpers shared by the browser and Node, no DOM and no
  models: seeded RNG, CIELAB and CIEDE2000, the xterm-256 palette pool and
  contrast palette, polygon geometry, MediaPipe landmark sets, pose from the
  transformation matrix, iris scale, anchor-to-UV baking, trial drawing,
  distances, scores, Pareto front, recipe validation and the generated
  Ghostyle source. Unit tests: `tests/unit/ghostyle-fuzz-core.test.js`.
- `harness.html`, `harness.js` — the page Playwright drives. No lab UI and no
  render loop; it exposes `window.fuzz` (scan, analyse, skin swatch, load
  atlas, control, run trial, materialise) and uses the lab's vendored face-api,
  MediaPipe and `ghostyle3d-uv-renderer.js`.
- `report.cjs` — builds the self-contained `report.html` from the atlas and
  `trials.ndjson`.
- `recipes/` — recipes. `three-bands.json`: three 5 × 2 cm bands at 80 %
  opacity, four colours of maximum luminance contrast with the skin;
  `four-lines.json`: four 6 × 1 cm lines at 90 %. The others vary one thing at
  a time around three-bands: shape at equal painted area (`one-long-band`,
  `six-thin-lines`, `ten-hairlines`, `two-patches`), opacity and colour
  (`three-bands-opaque`, `-any-colour`, `-perceptual`, `-white`, `-black`),
  placement (`three-bands-no-overlap`, `nose-bands`, `eye-bands`,
  `no-eyes-bands`, `forehead-cheeks-lines`). See tutorials/ghostyle-fuzz.md §4.1.
- `run-samples.sh` — builds the atlases of several videos under one root and
  runs a small matrix of recipes and options on each with paired seeds, then
  `report` and `compare`; packs the logs for sharing.

Outputs go to `scratch/fuzz/<video-stem>/` by default, which git ignores.
