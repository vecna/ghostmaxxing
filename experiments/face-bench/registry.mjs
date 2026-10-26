import { FaceApiEngine, MediaPipeEngine } from "./adapters/baselines.mjs";
import { PicoEngine } from "./adapters/pico.mjs";
import { OnnxEngine } from "./adapters/onnx.mjs";
export const engines = [
  "face-api",
  "mediapipe",
  "pico",
  "scrfd-arcface",
  "yunet-sface",
  "visage",
];
export async function createEngine(id, options = {}) {
  if (id === "face-api") return new FaceApiEngine();
  if (id === "mediapipe") return new MediaPipeEngine();
  if (id === "pico") return new PicoEngine();
  if (["scrfd-arcface", "yunet-sface"].includes(id)) return new OnnxEngine(id);
  if (id === "visage") {
    if (!options.visageModule)
      throw Error(
        "VISAGE_SDK_REQUIRED: provide a licensed SDK adapter module implementing createEngine(). No substitute model is used.",
      );
    const { createEngine: factory } = await import(options.visageModule);
    const engine = await factory(options);
    if (
      engine.id !== "visage" ||
      !engine.capabilities ||
      !engine.metadata ||
      !engine.load ||
      !engine.detect ||
      !engine.reset ||
      !engine.dispose ||
      (engine.capabilities.embeddings && !engine.compare)
    )
      throw Error("Invalid Visage adapter contract");
    return engine;
  }
  throw Error("Unknown engine: " + id);
}
