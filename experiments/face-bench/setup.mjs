// Download only model families requested by the user; record provenance and hashes.
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url)),
  assets = path.join(root, "assets");
await mkdir(assets, { recursive: true });
const zoo =
  "https://media.githubusercontent.com/media/opencv/opencv_zoo/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/";
const insight =
  "https://huggingface.co/immich-app/buffalo_s/resolve/0ff1751885575e62e084dff70549ce24a11fa5dc/";
const groups = {
  pico: [
    [
      "pico.js",
      "https://raw.githubusercontent.com/nenadmarkus/picojs/afffa50ec4134a47005f2cbf8112eaa69f65f37e/pico.js",
      "MIT",
    ],
    [
      "facefinder",
      "https://raw.githubusercontent.com/nenadmarkus/pico/master/rnt/cascades/facefinder",
      "See pico upstream license",
    ],
  ],
  "scrfd-arcface": [
    [
      "scrfd.onnx",
      insight + "detection/model.onnx",
      "InsightFace pretrained models: non-commercial research; commercial license separately",
    ],
    [
      "arcface.onnx",
      insight + "recognition/model.onnx",
      "InsightFace pretrained models: non-commercial research; commercial license separately",
    ],
  ],
  "yunet-sface": [
    [
      "yunet.onnx",
      zoo + "face_detection_yunet/face_detection_yunet_2023mar.onnx",
      "See OpenCV Zoo face_detection_yunet LICENSE",
    ],
    [
      "sface.onnx",
      zoo + "face_recognition_sface/face_recognition_sface_2021dec.onnx",
      "See OpenCV Zoo face_recognition_sface LICENSE",
    ],
  ],
};
let manifest = {};
try {
  manifest = JSON.parse(
    await readFile(path.join(assets, "manifest.json"), "utf8"),
  );
} catch {}
const expected = JSON.parse(
  await readFile(path.join(root, "models.lock.json"), "utf8"),
);
const requested = process.argv.slice(2);
for (const key of requested.length ? requested : Object.keys(groups)) {
  if (!groups[key]) throw Error("Unknown asset group " + key);
  for (const [name, url, license] of groups[key]) {
    const dest = path.join(assets, name);
    let bytes;
    try {
      bytes = await readFile(dest);
      if (!bytes.length) throw Error("Empty");
    } catch {
      console.log("Downloading " + name);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok) throw Error(`${response.status} ${name}`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 100) throw Error("Invalid model download " + name);
      await writeFile(dest + ".partial", bytes);
      await rename(dest + ".partial", dest);
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (expected[name]?.sha256 !== sha256)
      throw Error("Asset changed unexpectedly: " + name);
    manifest[name] = { source: url, sha256, bytes: bytes.length, license };
    await writeFile(
      path.join(assets, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    console.log(name + " " + bytes.length + " bytes " + sha256);
  }
}
