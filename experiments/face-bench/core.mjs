// Framework-independent data and comparison contract. Image coordinates are pixels.
export function validateVector(v) {
  if (!v?.length || !Array.from(v).every(Number.isFinite))
    throw new Error("Invalid template vector");
  if (!Array.from(v).some((x) => x !== 0))
    throw new Error("Zero template vector");
}
export function compareTemplates(a, b) {
  if (
    a.space !== b.space ||
    a.metric !== b.metric ||
    a.values.length !== b.values.length
  )
    throw new Error("Incompatible template spaces");
  validateVector(a.values);
  validateVector(b.values);
  let dot = 0,
    aa = 0,
    bb = 0,
    sq = 0;
  for (let i = 0; i < a.values.length; i++) {
    const x = a.values[i],
      y = b.values[i];
    dot += x * y;
    aa += x * x;
    bb += y * y;
    sq += (x - y) ** 2;
  }
  return a.metric === "euclidean"
    ? Math.sqrt(sq)
    : Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb)));
}
export function median(xs) {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y),
    m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
export function proximity(query, gallery, topK = 5) {
  if (!gallery.length) throw new Error("No reference templates");
  const rows = gallery.map((g) => ({
    timestamp: g.timestamp,
    score: compareTemplates(query, g.template),
  }));
  const higherIsCloser = query.metric !== "euclidean";
  rows.sort((a, b) => (higherIsCloser ? b.score - a.score : a.score - b.score));
  return {
    metric: query.metric,
    higherIsCloser,
    best: rows[0].score,
    bestReferenceTimestamp: rows[0].timestamp,
    topK: Math.min(topK, rows.length),
    topKMedian: median(rows.slice(0, topK).map((r) => r.score)),
  };
}
export function schedule(duration, fps = 2, maxFrames = 300) {
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(fps) ||
    fps <= 0 ||
    !Number.isInteger(maxFrames) ||
    maxFrames < 1
  )
    throw new Error("Invalid sampling settings");
  return Array.from(
    { length: Math.min(maxFrames, Math.ceil(duration * fps)) },
    (_, i) => i / fps,
  ).filter((t) => t < duration);
}
export function selectGallery(rows, limit = 40) {
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error("Invalid gallery limit");
  const valid = rows.filter((r) => r.status === "template-extracted");
  if (valid.length <= limit) return valid;
  return Array.from(
    { length: limit },
    (_, i) => valid[Math.floor((i * valid.length) / limit)],
  );
}
export function summary(rows) {
  const states = {};
  for (const r of rows) states[r.status] = (states[r.status] || 0) + 1;
  return {
    frames: rows.length,
    states,
    detectionRate: rows.length
      ? rows.filter((r) => r.faceCount > 0).length / rows.length
      : null,
    comparisonMedian: median(
      rows.filter((r) => r.proximity).map((r) => r.proximity.topKMedian),
    ),
    inferenceMedianMs: median(rows.map((r) => r.elapsedMs)),
  };
}
export class FaceEngine {
  constructor(id, capabilities, metadata = {}) {
    this.id = id;
    this.capabilities = capabilities;
    this.metadata = metadata;
  }
  template(values, metric = "cosine") {
    validateVector(values);
    return {
      space: this.metadata.templateSpace,
      metric,
      values: Array.from(values),
      kind: this.capabilities.templateKind,
    };
  }
  compare(a, b) {
    return compareTemplates(a, b);
  }
  async reset() {} // Each adapter uses independent IMAGE calls, not temporal tracking.
  async dispose() {}
}
// Commercial SDKs may expose opaque templates and asynchronous native matchers.
// Keep their format inside the adapter; only score direction crosses the bridge.
export async function proximityWithEngine(engine, query, gallery, topK = 5) {
  if (!gallery.length) throw Error("No reference templates");
  const higherIsCloser =
    query.metric === "native-sdk"
      ? engine.metadata.higherIsCloser
      : query.metric !== "euclidean";
  if (typeof higherIsCloser !== "boolean")
    throw Error("Native matcher must declare higherIsCloser");
  const rows = [];
  for (const g of gallery) {
    if (query.space !== g.template.space || query.metric !== g.template.metric)
      throw Error("Incompatible template spaces");
    const score = await engine.compare(query, g.template);
    if (!Number.isFinite(score))
      throw Error("Matcher returned a non-finite score");
    rows.push({ timestamp: g.timestamp, score });
  }
  rows.sort((a, b) => (higherIsCloser ? b.score - a.score : a.score - b.score));
  return {
    metric: query.metric,
    higherIsCloser,
    best: rows[0].score,
    bestReferenceTimestamp: rows[0].timestamp,
    topK: Math.min(topK, rows.length),
    topKMedian: median(rows.slice(0, topK).map((r) => r.score)),
  };
}
