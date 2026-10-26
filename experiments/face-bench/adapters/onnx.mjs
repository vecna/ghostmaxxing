import { FaceEngine } from "../core.mjs";
const base = "/experiments/face-bench/";
export function nms(faces, threshold = 0.4) {
  const kept = [];
  for (const f of [...faces].sort((a, b) => b.confidence - a.confidence)) {
    if (
      kept.every((g) => {
        const a = f.box,
          b = g.box;
        const iw = Math.max(
            0,
            Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
          ),
          ih = Math.max(
            0,
            Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
          ),
          i = iw * ih;
        return i / (a.width * a.height + b.width * b.height - i) <= threshold;
      })
    )
      kept.push(f);
  }
  return kept;
}
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function tensor(ort, c, normalize) {
  const { width: w, height: h } = c;
  const d = c.getContext("2d").getImageData(0, 0, w, h).data,
    a = new Float32Array(3 * w * h);
  for (let i = 0; i < w * h; i++)
    for (let k = 0; k < 3; k++) a[k * w * h + i] = normalize(d[4 * i + k]);
  return new ort.Tensor("float32", a, [1, 3, h, w]);
}
// Least-squares similarity transform, using the native five-point alignment.
export function similarityTransform(src, dst) {
  if (src.length !== 5 || dst.length !== 5)
    throw Error("Five landmarks required");
  const mx = src.reduce((s, p) => s + p.x, 0) / 5,
    my = src.reduce((s, p) => s + p.y, 0) / 5,
    ux = dst.reduce((s, p) => s + p.x, 0) / 5,
    uy = dst.reduce((s, p) => s + p.y, 0) / 5;
  let den = 0,
    a = 0,
    b = 0;
  for (let i = 0; i < 5; i++) {
    const x = src[i].x - mx,
      y = src[i].y - my,
      u = dst[i].x - ux,
      v = dst[i].y - uy;
    den += x * x + y * y;
    a += x * u + y * v;
    b += x * v - y * u;
  }
  if (den < 1e-8) throw Error("Degenerate alignment");
  a /= den;
  b /= den;
  return [a, b, -b, a, ux - a * mx + b * my, uy - b * mx - a * my];
}
const target = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
].map(([x, y]) => ({ x, y }));
export class OnnxEngine extends FaceEngine {
  constructor(kind) {
    const arc = kind === "scrfd-arcface";
    super(
      kind,
      {
        landmarks: "five-point-2d",
        embeddings: true,
        templateKind: "face-identity",
      },
      {
        backend: "onnx-wasm",
        templateSpace: arc
          ? "insightface-w600k-mbf-112-cosine"
          : "opencv-sface-2021dec-112-cosine",
        preprocessing: arc
          ? "SCRFD RGB (x-127.5)/128, top-left letterbox 640; 5-point similarity alignment; ArcFace RGB (x-127.5)/127.5"
          : "YuNet BGR 640 square letterbox; 5-point similarity alignment; SFace RGB raw 112",
        assets: [
          base + "assets/" + (arc ? "scrfd.onnx" : "yunet.onnx"),
          base + "assets/" + (arc ? "arcface.onnx" : "sface.onnx"),
        ],
      },
    );
    this.arc = arc;
  }
  async load() {
    this.ort = await import(
      base + "node_modules/onnxruntime-web/dist/ort.min.mjs"
    );
    this.ort.env.wasm.wasmPaths = base + "node_modules/onnxruntime-web/dist/";
    this.ort.env.wasm.numThreads = 1;
    this.metadata.runtimeVersion = this.ort.env.versions;
    this.metadata.detectorThreshold = this.arc ? 0.5 : 0.6;
    this.metadata.nmsThreshold = 0.4;
    try {
      this.det = await this.ort.InferenceSession.create(
        this.metadata.assets[0],
        { executionProviders: ["wasm"] },
      );
      this.rec = await this.ort.InferenceSession.create(
        this.metadata.assets[1],
        { executionProviders: ["wasm"] },
      );
    } catch (e) {
      await this.dispose();
      throw Error(
        "ONNX loading failed; run npm run setup -- " +
          this.id +
          ". " +
          e.message,
      );
    }
  }
  async detect(frame) {
    const c = canvas(640, 640),
      ctx = c.getContext("2d");
    const scale = Math.min(640 / frame.width, 640 / frame.height),
      dw = Math.round(frame.width * scale),
      dh = Math.round(frame.height * scale);
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, 640, 640);
    ctx.drawImage(frame, 0, 0, dw, dh);
    let input = tensor(
      this.ort,
      c,
      this.arc ? (x) => (x - 127.5) / 128 : (x) => x,
    );
    if (!this.arc) {
      const a = input.data,
        n = 640 * 640;
      for (let i = 0; i < n; i++) {
        const r = a[i];
        a[i] = a[2 * n + i];
        a[2 * n + i] = r;
      }
    }
    const out = await this.det.run({ [this.det.inputNames[0]]: input });
    this.metadata.detectorOutputs = Object.fromEntries(
      Object.entries(out).map(([k, v]) => [k, v.dims]),
    );
    const faces = this.arc
      ? this.decodeSCRFD(out, scale)
      : this.decodeYuNet(out, scale);
    const kept = nms(faces);
    for (const f of kept) {
      f.template = null;
      if (kept.length !== 1) continue;
      try {
        const crop = canvas(112, 112),
          cx = crop.getContext("2d");
        cx.setTransform(...similarityTransform(f.points, target));
        cx.drawImage(frame, 0, 0);
        const r = await this.rec.run({
          [this.rec.inputNames[0]]: tensor(
            this.ort,
            crop,
            this.arc ? (x) => (x - 127.5) / 127.5 : (x) => x,
          ),
        });
        f.template = this.template(Object.values(r)[0].data);
      } catch (e) {
        f.templateError = e.message;
      }
    }
    return kept;
  }
  decodeSCRFD(out, scale) {
    const values = Object.values(out),
      faces = [];
    for (const stride of [8, 16, 32]) {
      const cells = (640 / stride) ** 2 * 2;
      const score = values.find(
          (t) => t.data.length === cells && t.dims.at(-1) === 1,
        ),
        box = values.find(
          (t) => t.data.length === cells * 4 && t.dims.at(-1) === 4,
        ),
        kps = values.find(
          (t) => t.data.length === cells * 10 && t.dims.at(-1) === 10,
        );
      if (!score || !box || !kps)
        throw Error("Unsupported SCRFD output layout");
      for (let i = 0; i < cells; i++) {
        if (score.data[i] < 0.5) continue;
        const x = (Math.floor(i / 2) % (640 / stride)) * stride,
          y = Math.floor(Math.floor(i / 2) / (640 / stride)) * stride;
        const b = Array.from(
          box.data.slice(i * 4, i * 4 + 4),
          (v) => v * stride,
        );
        faces.push({
          box: {
            x: (x - b[0]) / scale,
            y: (y - b[1]) / scale,
            width: (b[0] + b[2]) / scale,
            height: (b[1] + b[3]) / scale,
          },
          confidence: score.data[i],
          points: Array.from({ length: 5 }, (_, j) => ({
            x: (x + kps.data[i * 10 + j * 2] * stride) / scale,
            y: (y + kps.data[i * 10 + j * 2 + 1] * stride) / scale,
            name: [
              "left-eye",
              "right-eye",
              "nose",
              "left-mouth",
              "right-mouth",
            ][j],
          })),
          landmarkSchema: "five-point-2d",
        });
      }
    }
    return faces;
  }
  decodeYuNet(out, scale) {
    const faces = [];
    for (const stride of [8, 16, 32]) {
      const cls = out["cls_" + stride],
        obj = out["obj_" + stride],
        bbox = out["bbox_" + stride],
        kps = out["kps_" + stride];
      if (!cls || !obj || !bbox || !kps)
        throw Error("Unsupported YuNet output layout");
      for (let i = 0; i < cls.data.length; i++) {
        const confidence = Math.sqrt(
          Math.max(0, Math.min(1, cls.data[i])) *
            Math.max(0, Math.min(1, obj.data[i])),
        );
        if (confidence < 0.6) continue;
        const x = i % (640 / stride),
          y = Math.floor(i / (640 / stride)),
          b = bbox.data;
        const cx = (x + b[i * 4]) * stride,
          cy = (y + b[i * 4 + 1]) * stride,
          w = Math.exp(b[i * 4 + 2]) * stride,
          h = Math.exp(b[i * 4 + 3]) * stride;
        faces.push({
          box: {
            x: (cx - w / 2) / scale,
            y: (cy - h / 2) / scale,
            width: w / scale,
            height: h / scale,
          },
          confidence,
          landmarkSchema: "five-point-2d",
          points: Array.from({ length: 5 }, (_, j) => ({
            x: ((x + kps.data[i * 10 + j * 2]) * stride) / scale,
            y: ((y + kps.data[i * 10 + j * 2 + 1]) * stride) / scale,
            name: [
              "left-eye",
              "right-eye",
              "nose",
              "left-mouth",
              "right-mouth",
            ][j],
          })),
        });
      }
    }
    return faces;
  }
  async dispose() {
    await this.det?.release();
    await this.rec?.release();
    this.det = null;
    this.rec = null;
  }
}
