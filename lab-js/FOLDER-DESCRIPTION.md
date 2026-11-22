# lab-js

The browser modules run directly as ES modules.

- `workshop/` runs the workshop Lab. Its recognition rules and eight-second history accept explicit inputs for unit tests. Its UI renders those results and switches landmark overlays.
- `ghostyle-player/` loads named Ghostyles, edits drafts, places 2D and UV paint on the camera, and runs the native brush. Its geometry uses face-api landmarks and MediaPipe FaceLandmarker.
- `ghostyle-transfer/` aligns still photos on the canonical face mesh, traces changed color regions and exports a vector Ghostyle. It uses the shared face archive for optional Lab references.
- `face-archive.js` stores numbered 128-dimensional face references shared by Lab and Realtime. `realtime/` manages a calibrated comparison session.
- `loader.js` and `video-loader/` run repeatable measurements on locally selected videos.
- `ghostyle3d-uv-renderer.js` projects Ghostyle textures onto a live mesh. `utils.js` provides shared drawing functions exposed by the Player through `window.gstmxx`. `Ghostmaxxing.d.ts` describes that API.
- `workshop/media.js`, `workshop/overlays.js`, `upload-consent.js`, and `i18n.js` provide shared browser media, overlays, clip consent, and translations.
