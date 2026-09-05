# lab-js

This folder contains the browser runtime JavaScript for Ghostmaxxing. The app is a static ES-module site with no production bundling step, so these files are loaded directly by the lab, loader, transfer, and related pages.

The `index.html` and other informational/support page scripts are in `../pages-js`.

The main lab runtime is coordinated by `main.js`, with `state.js` holding shared mutable state and the `gstmxxEvents` event bus. Camera lifecycle and recording live in `camera.js`; DOM lookup and UI status helpers live in `dom.js`; project constants, local model URLs, thresholds, and upload settings live in `config.js`.

Face analysis is split across several modules. `engine.js` owns the primary face-api 2D detector, landmarks, descriptors, matching, and composite Ghostyle checks. `engine-3d.js` owns the experimental MediaPipe ImageEmbedder path. `mediapipe-loop.js` streams 478-point face landmarks for UV overlays, while `auto-find-loop.js`, `bbox-overlay.js`, `landmark-analysis.js`, `analyze-panel.js`, and `face-thumbnails.js` provide live readouts, result classification, explanations, and local thumbnails.

Ghostyle execution is handled by `ghostyles-manager.js` for 2D plugin loading and by `plugins3d-loader.js` plus `ghostyle3d-uv-renderer.js` for UV/3D rendering. `utils.js` supplies geometry, canvas, logging, and public helper functions exposed to plugin authors through `window.gstmxx`. `Ghostmaxxing.d.ts` documents that public API for editor support.

Standalone page scripts include `loader.js` for repeatable MP4/video fixture analysis, `transfer.js` for the Ghostyle transfer lab, `mobile-ui.js` for mobile drawer/fullscreen controls, `lab-ui.js` for shared lab-page UI wiring, `export-makeup.js` for PNG clipboard/share export, and `upload-consent.js` for the local clip consent and receipt flow.

`lab-js/i18n.js` is intentionally excluded from code2prompt output. It is the runtime localization catalog containing the English baseline plus Italian and Portuguese translations. The project has localization support via `initI18n()`, `applyI18n()`, and `setupLocaleSelect()`, with the selected locale stored in `localStorage` under `ghostmaxxing-locale`; the message catalog itself is omitted from prompt uploads by policy.
