#!/usr/bin/env bash
set -euo pipefail

# Sync all third-party runtime assets into scripts/vendor.
# Run from scripts/vendor or from repo root.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
mkdir -p wasm

fetch() {
  local url="$1"
  local out="$2"
  echo "[vendor] $out"
  curl -fL "$url" -o "$out"
}

# face-api.js model shards and manifests (source ref is currently 'master').
fetch "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_landmark_68/face_landmark_68_model-weights_manifest.json" "face_landmark_68_model-weights_manifest.json"
fetch "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_recognition/face_recognition_model-weights_manifest.json" "face_recognition_model-weights_manifest.json"
fetch "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/age_gender_model/age_gender_model-weights_manifest.json" "age_gender_model-weights_manifest.json"
fetch "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_expression/face_expression_model-weights_manifest.json" "face_expression_model-weights_manifest.json"
fetch "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/tiny_face_detector/tiny_face_detector_model-shard1" "tiny_face_detector_model-shard1"
fetch "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_landmark_68/face_landmark_68_model-shard1" "face_landmark_68_model-shard1"
fetch "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_recognition/face_recognition_model-shard1" "face_recognition_model-shard1"
fetch "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_recognition/face_recognition_model-shard2" "face_recognition_model-shard2"
fetch "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_expression/face_expression_model-shard1" "face_expression_model-shard1"
fetch "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/age_gender_model/age_gender_model-shard1" "age_gender_model-shard1"

# MediaPipe Tasks Vision @ 0.10.35 runtime files.
fetch "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_internal.js" "wasm/vision_wasm_internal.js"
fetch "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_internal.wasm" "wasm/vision_wasm_internal.wasm"

# MediaPipe model files used by this app.
fetch "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" "face_landmarker.task"
fetch "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite" "mobilenet_v3_small.tflite"

# face-api library bundle is intentionally separate from this script:
# scripts/vendor/face-api.js comes from https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js
