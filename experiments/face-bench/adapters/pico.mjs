import { FaceEngine } from "../core.mjs";
export class PicoEngine extends FaceEngine {
  constructor() {
    super(
      "pico",
      { landmarks: false, embeddings: false, templateKind: null },
      {
        backend: "javascript-cpu",
        assets: [
          "/experiments/face-bench/assets/pico.js",
          "/experiments/face-bench/assets/facefinder",
        ],
        preprocessing:
          "RGB luminance; pico cascade; q>50; no temporal accumulation",
      },
    );
  }
  async load() {
    if (!globalThis.pico) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "./assets/pico.js";
        s.onload = resolve;
        s.onerror = () => reject(new Error("Run npm run setup -- pico"));
        document.head.append(s);
      });
    }
    const r = await fetch("./assets/facefinder");
    if (!r.ok) throw new Error("Missing pico facefinder: run setup");
    this.classify = pico.unpack_cascade(new Int8Array(await r.arrayBuffer()));
  }
  async detect(frame) {
    const { width, height } = frame;
    const rgba = frame.getContext("2d").getImageData(0, 0, width, height).data,
      pixels = new Uint8Array(width * height);
    for (let i = 0; i < pixels.length; i++)
      pixels[i] =
        (2 * rgba[i * 4] + 7 * rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 10;
    const found = pico.cluster_detections(
      pico.run_cascade(
        { pixels, nrows: height, ncols: width, ldim: width },
        this.classify,
        {
          shiftfactor: 0.1,
          minsize: 40,
          maxsize: Math.min(width, height),
          scalefactor: 1.1,
        },
      ),
      0.2,
    );
    return found
      .filter((d) => d[3] > 50)
      .map(([y, x, size, confidence]) => ({
        box: { x: x - size / 2, y: y - size / 2, width: size, height: size },
        confidence,
        points: [],
        landmarkSchema: null,
        template: null,
      }));
  }
}
