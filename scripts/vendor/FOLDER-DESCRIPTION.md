# scripts/vendor

This folder contains third-party browser runtime assets mirrored into the repository so local demos and workshops can avoid network requests to external model and library hosts.

The files come from face-api.js, MediaPipe Tasks Vision, face-api model weights, MediaPipe model files, and the local refresh helper `fetch-sources.sh`. They are used by the detection, recognition, landmarking, and MediaPipe/3D paths at runtime.

`face-api.js` is loaded as a classic script before the ES modules that call the global `faceapi` object. The model shards and manifests provide TinyFaceDetector, 68-point landmarks, recognition descriptors, age/gender, and expression models. `tasks-vision@0.10.35.js`, `face_landmarker.task`, `mobilenet_v3_small.tflite`, and the nested `wasm/` runtime support the MediaPipe face-landmark and ImageEmbedder paths.

These files are excluded from code2prompt because they are vendored libraries, model weights, WASM support files, and generated manifests. Their exact source URLs and refresh rules are documented in `scripts/vendor/README.md` in the repository, but only this summary and the nested folder description are uploaded to the chatbot.
