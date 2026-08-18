Vendor asset inventory for third-party runtime files.

Use `lab-js/vendor/fetch-sources.sh` to refresh the assets it manages.

## Library bundles

| Local file | Source URL | Upstream version/reference | Notes |
|---|---|---|---|
| `face-api.js` | `https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js` | floating (no `@x.y.z` in URL) | Main `faceapi` browser bundle used by pages and transfer tool. |
| `tasks-vision@0.10.35.js` | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35` | `0.10.35` | ESM bundle imported by 3D/embedder paths. |

## URLs synced by `fetch-sources.sh`

### face-api.js model assets

Source reference for this block is currently `justadudewhohacks/face-api.js-models@master`.

| Local file | Source URL |
|---|---|
| `face_landmark_68_model-weights_manifest.json` | `https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_landmark_68/face_landmark_68_model-weights_manifest.json` |
| `face_recognition_model-weights_manifest.json` | `https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_recognition/face_recognition_model-weights_manifest.json` |
| `age_gender_model-weights_manifest.json` | `https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/age_gender_model/age_gender_model-weights_manifest.json` |
| `face_expression_model-weights_manifest.json` | `https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_expression/face_expression_model-weights_manifest.json` |
| `tiny_face_detector_model-shard1` | `https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/tiny_face_detector/tiny_face_detector_model-shard1` |
| `face_landmark_68_model-shard1` | `https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_landmark_68/face_landmark_68_model-shard1` |
| `face_recognition_model-shard1` | `https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_recognition/face_recognition_model-shard1` |
| `face_recognition_model-shard2` | `https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_recognition/face_recognition_model-shard2` |
| `face_expression_model-shard1` | `https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_expression/face_expression_model-shard1` |
| `age_gender_model-shard1` | `https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/age_gender_model/age_gender_model-shard1` |

### MediaPipe Tasks Vision runtime (`0.10.35`)

| Local file | Source URL |
|---|---|
| `wasm/vision_wasm_internal.js` | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_internal.js` |
| `wasm/vision_wasm_internal.wasm` | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_internal.wasm` |

### MediaPipe model files

| Local file | Source URL | Version segment |
|---|---|---|
| `face_landmarker.task` | `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` | `float16/1` |
| `mobilenet_v3_small.tflite` | `https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite` | `float32/1` |

## Update rule

When any source URL or version segment above changes, re-run `lab-js/vendor/fetch-sources.sh` and verify runtime no longer requests third-party hosts.
