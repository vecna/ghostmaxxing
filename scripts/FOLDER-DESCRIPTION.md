# scripts

This folder contains the browser runtime JavaScript for Ghostmaxxing. The app is a static ES-module site with no production bundling step, so these files are loaded directly by `lab.html`, `index.html`, `loader.html`, `ghostyle-transfer.html`, `realtime.html`, and support pages.

The main lab runtime is coordinated by `main.js`, with `state.js` holding shared mutable state and the `gstmxxEvents` event bus. Camera lifecycle and recording live in `camera.js`; DOM lookup and UI status helpers live in `dom.js`; project constants, local model URLs, thresholds, and upload settings live in `config.js`.

Face analysis is split across several modules. `engine.js` owns the primary face-api 2D detector, landmarks, descriptors, matching, and composite Ghostyle checks. `engine-3d.js` owns the experimental MediaPipe ImageEmbedder path. `mediapipe-loop.js` streams 478-point face landmarks for UV overlays, while `auto-find-loop.js`, `bbox-overlay.js`, `landmark-analysis.js`, `analyze-panel.js`, and `face-thumbnails.js` provide live readouts, result classification, explanations, and local thumbnails.

Ghostyle execution is handled by `ghostyles-manager.js` for 2D plugin loading and by `plugins3d-loader.js` plus `ghostyle3d-uv-renderer.js` for UV/3D rendering. `utils.js` supplies geometry, canvas, logging, and public helper functions exposed to plugin authors through `window.gstmxx`. `Ghostmaxxing.d.ts` documents that public API for editor support.

Standalone page scripts include `home.js` for homepage i18n wiring, `loader.js` for repeatable MP4/video fixture analysis, `realtime.js` for the calibration/tracking demo, `transfer.js` for the Ghostyle transfer lab, `ghostutter.js` for the optional Ghostutter mark runtime, `mobile-ui.js` for legacy mobile drawer/fullscreen controls, `export-makeup.js` for PNG clipboard/share export, and `upload-consent.js` for the local clip consent and receipt flow.

`scripts/i18n.js` is intentionally excluded from code2prompt output. It is the runtime localization catalog containing the English baseline plus Italian and Portuguese translations. The project has localization support via `initI18n()`, `applyI18n()`, and `setupLocaleSelect()`, with the selected locale stored in `localStorage` under `ghostmaxxing-locale`; the message catalog itself is omitted from prompt uploads by policy.
