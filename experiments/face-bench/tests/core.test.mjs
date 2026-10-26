import test from "node:test";
import assert from "node:assert/strict";
import {
  compareTemplates,
  proximity,
  schedule,
  selectGallery,
  summary,
} from "../core.mjs";
import { similarityTransform, nms } from "../adapters/onnx.mjs";
const t = (values, metric = "cosine", space = "test") => ({
  values,
  metric,
  space,
});
test("reject mixed template domains and invalid vectors", () => {
  assert.throws(() =>
    compareTemplates(t([1, 0]), t([1, 0], "cosine", "other")),
  );
  assert.throws(() => compareTemplates(t([0, 0]), t([1, 0])));
  assert.throws(() => compareTemplates(t([NaN, 0]), t([1, 0])));
});
test("ranking honors opposite directions of L2 and cosine", () => {
  for (const metric of ["cosine", "euclidean"]) {
    const q = t([1, 0], metric),
      g = [
        { timestamp: 0, template: t([0, 1], metric) },
        { timestamp: 2, template: t([1, 0], metric) },
      ];
    assert.equal(proximity(q, g, 1).bestReferenceTimestamp, 2);
  }
});
test("schedule and gallery caps retain deterministic chronological samples", () => {
  assert.deepEqual(schedule(1.1, 2), [0, 0.5, 1]);
  assert.deepEqual(schedule(60, 2, 3), [0, 0.5, 1]);
  assert.throws(() => schedule(Infinity));
  const rows = Array.from({ length: 10 }, (_, timestamp) => ({
    timestamp,
    status: "template-extracted",
  }));
  assert.deepEqual(
    selectGallery(rows, 3).map((r) => r.timestamp),
    [0, 3, 6],
  );
  assert.equal(
    summary([{ status: "inference-error", faceCount: 0, elapsedMs: 5 }])
      .comparisonMedian,
    null,
  );
});
test("five-point least-squares alignment recovers a known rotation/scale", () => {
  const src = [
    [1, 0],
    [0, 1],
    [2, 2],
    [0, 3],
    [4, 1],
  ].map(([x, y]) => ({ x, y }));
  const dst = src.map((p) => ({
    x: 2 * p.x - 3 * p.y + 5,
    y: 3 * p.x + 2 * p.y + 7,
  }));
  const got = similarityTransform(src, dst);
  [2, 3, -3, 2, 5, 7].forEach((x, i) =>
    assert.ok(Math.abs(got[i] - x) < 1e-10),
  );
  assert.throws(() => similarityTransform(Array(5).fill({ x: 0, y: 0 }), dst));
});
test("NMS keeps spatially distinct faces, suppresses overlap", () => {
  const a = { box: { x: 0, y: 0, width: 20, height: 20 }, confidence: 0.9 },
    b = { box: { x: 1, y: 1, width: 20, height: 20 }, confidence: 0.8 },
    c = { box: { x: 50, y: 50, width: 20, height: 20 }, confidence: 0.7 };
  assert.deepEqual(nms([b, c, a]), [a, c]);
});
test("SCRFD decoding distinguishes scores from boxes at overlapping tensor sizes", async () => {
  const { OnnxEngine } = await import("../adapters/onnx.mjs");
  const out = {};
  for (const stride of [8, 16, 32]) {
    const n = (640 / stride) ** 2 * 2;
    out["score" + stride] = { dims: [n, 1], data: new Float32Array(n) };
    out["bbox" + stride] = {
      dims: [n, 4],
      data: new Float32Array(n * 4).fill(2),
    };
    out["kps" + stride] = { dims: [n, 10], data: new Float32Array(n * 10) };
  }
  out.score16.data[0] = 0.9;
  const found = new OnnxEngine("scrfd-arcface").decodeSCRFD(out, 1);
  assert.equal(found.length, 1);
  assert.equal(found[0].box.width, 64);
  assert.equal(found[0].box.height, 64);
});
test("opaque SDK templates can use an asynchronous native comparison", async () => {
  const { proximityWithEngine } = await import("../core.mjs");
  const engine = {
    metadata: { higherIsCloser: true },
    compare: async (a, b) => (a.bytes[0] === b.bytes[0] ? 100 : 5),
  };
  const native = (n) => ({ space: "sdk-v1", metric: "native-sdk", bytes: [n] });
  const r = await proximityWithEngine(
    engine,
    native(4),
    [
      { timestamp: 1, template: native(3) },
      { timestamp: 2, template: native(4) },
    ],
    1,
  );
  assert.equal(r.best, 100);
  assert.equal(r.bestReferenceTimestamp, 2);
  await assert.rejects(() =>
    proximityWithEngine(engine, native(4), [
      { timestamp: 0, template: { ...native(4), space: "other" } },
    ]),
  );
});
