# scripts/vendor

This folder contains third-party browser runtime assets mirrored into the repository so local demos and workshops can avoid network requests to external model and library hosts.

The files come from face-api.js, MediaPipe Tasks Vision, face-api model weights, MediaPipe model files, and the local refresh helper `foca.sh`. They are used by the detection, recognition, landmarking, and MediaPipe/3D paths at runtime.

These files are excluded from code2prompt because they are vendored libraries, model weights, WASM support files, and generated manifests. Their exact source URLs and refresh rules are documented in `scripts/vendor/README.md` in the repository, but only this summary is uploaded to the chatbot.
