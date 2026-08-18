# lab-js/vendor/wasm

This folder contains the WebAssembly runtime support files for MediaPipe Tasks Vision.

The files come from the `@mediapipe/tasks-vision@0.10.35` package and are loaded by MediaPipe-backed face-landmarking and embedding code paths when the app runs locally. `config.js` exposes the local URL used by `mediapipe-loop.js` and the experimental 3D/visual-embedding runtime.

They are excluded from code2prompt because they are vendored generated runtime assets, not project-authored source code.
