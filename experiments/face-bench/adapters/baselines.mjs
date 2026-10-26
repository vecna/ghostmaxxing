import { FaceEngine } from "../core.mjs";
const vendor = "/lab-js/vendor/";
export class FaceApiEngine extends FaceEngine {
  constructor() {
    super(
      "face-api",
      {
        landmarks: "faceapi-68-2d",
        embeddings: true,
        templateKind: "face-identity",
      },
      {
        templateSpace: "faceapi-vendored-recognition-128-l2",
        backend: "webgl",
        preprocessing:
          "TinyFaceDetector 416/0.5; native 68-point alignment; full-frame detection",
        assets: [
          "face-api.js",
          "tiny_face_detector_model-weights_manifest.json",
          "tiny_face_detector_model-shard1",
          "face_landmark_68_model-weights_manifest.json",
          "face_landmark_68_model-shard1",
          "face_recognition_model-weights_manifest.json",
          "face_recognition_model-shard1",
          "face_recognition_model-shard2",
        ].map((f) => vendor + f),
      },
    );
  }
  async load() {
    const f = globalThis.faceapi;
    if (!f) throw new Error("Vendored face-api was not loaded");
    const loads = await Promise.allSettled([
      f.nets.tinyFaceDetector.loadFromUri(vendor),
      f.nets.faceLandmark68Net.loadFromUri(vendor),
      f.nets.faceRecognitionNet.loadFromUri(vendor),
    ]);
    const failed = loads.find((r) => r.status === "rejected");
    if (failed) {
      await this.dispose();
      throw failed.reason;
    }
    this.options = new f.TinyFaceDetectorOptions({
      inputSize: 416,
      scoreThreshold: 0.5,
    });
    this.metadata.backend = f.tf.getBackend();
    this.metadata.runtimeVersion = f.tf.version;
  }
  async detect(frame) {
    const r = await faceapi
      .detectAllFaces(frame, this.options)
      .withFaceLandmarks()
      .withFaceDescriptors();
    return r.map((f) => ({
      box: {
        x: f.detection.box.x,
        y: f.detection.box.y,
        width: f.detection.box.width,
        height: f.detection.box.height,
      },
      confidence: f.detection.score,
      landmarkSchema: "faceapi-68-2d",
      points: f.landmarks.positions.map((p, i) => ({
        x: p.x,
        y: p.y,
        name: String(i),
      })),
      template: this.template(f.descriptor, "euclidean"),
    }));
  }
  async dispose() {
    const nets = globalThis.faceapi?.nets;
    nets?.tinyFaceDetector.dispose();
    nets?.faceLandmark68Net.dispose();
    nets?.faceRecognitionNet.dispose();
  }
}
export class MediaPipeEngine extends FaceEngine {
  constructor() {
    super(
      "mediapipe",
      {
        landmarks: "mediapipe-478-relative-3d",
        embeddings: true,
        templateKind: "generic-image-similarity",
      },
      {
        templateSpace: "mediapipe-mobilenetv3-small-full-frame-cosine",
        backend: "CPU",
        preprocessing:
          "FaceLandmarker IMAGE gating; MobileNetV3 Small embedding of FULL frame, matching lab engine-3d semantics; not biometric recognition",
        assets: [
          vendor + "face_landmarker.task",
          vendor + "mobilenet_v3_small.tflite",
          vendor + "tasks-vision@0.10.35.js",
          vendor + "wasm/vision_wasm_internal.wasm",
        ],
      },
    );
  }
  async load() {
    const { FaceLandmarker, ImageEmbedder, FilesetResolver } = await import(
      "/lab-js/vendor/tasks-vision@0.10.35.js"
    );
    const fs = await FilesetResolver.forVisionTasks(vendor + "wasm");
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(fs, {
        baseOptions: {
          modelAssetPath: vendor + "face_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        numFaces: 4,
      });
      this.embedder = await ImageEmbedder.createFromOptions(fs, {
        baseOptions: {
          modelAssetPath: vendor + "mobilenet_v3_small.tflite",
          delegate: "CPU",
        },
        runningMode: "IMAGE",
      });
    } catch (e) {
      await this.dispose();
      throw e;
    }
  }
  async detect(frame) {
    const result = this.landmarker.detect(frame);
    return result.faceLandmarks.map((l) => {
      const points = l.map((p, i) => ({
        x: p.x * frame.width,
        y: p.y * frame.height,
        z: p.z,
        name: String(i),
      }));
      const xs = points.map((p) => p.x),
        ys = points.map((p) => p.y);
      return {
        box: {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        },
        confidence: null,
        landmarkSchema: "mediapipe-478-relative-3d",
        points,
        template:
          result.faceLandmarks.length === 1
            ? this.template(
                this.embedder.embed(frame).embeddings[0].floatEmbedding,
              )
            : null,
      };
    });
  }
  async dispose() {
    this.landmarker?.close();
    this.embedder?.close();
    this.landmarker = null;
    this.embedder = null;
  }
}
