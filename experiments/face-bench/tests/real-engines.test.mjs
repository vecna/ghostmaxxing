// Opt-in: npm run test:browser. Uses repository fixture and downloaded assets.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  fixture = path.resolve(cwd, "../../tests/fixtures/face-descriptor.webm");
function command(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["runner.mjs", ...args], {
      cwd,
      env: process.env,
    });
    let output = "";
    p.stdout.on("data", (d) => (output += d));
    p.stderr.on("data", (d) => (output += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(output) : reject(Error(output)),
    );
  });
}
const enabled = process.env.FACE_BENCH_BROWSER_TESTS === "1";
for (const [engine, dimensions] of [
  ["face-api", 128],
  ["mediapipe", 1024],
  ["pico", 0],
  ["scrfd-arcface", 512],
  ["yunet-sface", 128],
]) {
  test(
    "real browser inference: " + engine,
    { skip: !enabled, timeout: 120000 },
    async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "face-bench-"));
      try {
        const out = path.join(dir, "result.json");
        await command([
          "--engine",
          engine,
          "--reference",
          fixture,
          "--probe",
          fixture,
          "--max-frames",
          "1",
          "--out",
          out,
        ]);
        const result = JSON.parse(await readFile(out));
        const a = result.reference.frames[0],
          b = result.probe.frames[0];
        assert.equal(a.faceCount, 1);
        assert.equal(a.frameSha256, b.frameSha256);
        if (dimensions) {
          assert.equal(a.template.values.length, dimensions);
          assert.equal(b.status, "compared");
          assert.ok(Number.isFinite(b.proximity.best));
        } else {
          assert.equal(a.status, "detected-only");
          assert.equal(b.status, "detected-only");
          assert.equal(b.proximity, undefined);
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
}
test(
  "probe overlay reaches detector pixels and no-face stays distinct from zero similarity",
  { skip: !enabled, timeout: 120000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "face-bench-overlay-"));
    try {
      const overlay = path.join(dir, "overlay.json"),
        out = path.join(dir, "out.json");
      await writeFile(
        overlay,
        JSON.stringify({
          polygons: [
            {
              fill: "#000",
              points: [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
              ],
            },
          ],
        }),
      );
      await command([
        "--engine",
        "yunet-sface",
        "--reference",
        fixture,
        "--probe",
        fixture,
        "--max-frames",
        "1",
        "--overlay",
        overlay,
        "--out",
        out,
      ]);
      const r = JSON.parse(await readFile(out));
      assert.equal(r.reference.frames[0].status, "template-extracted");
      assert.equal(r.probe.frames[0].status, "no-face");
      assert.equal(r.probe.frames[0].proximity, undefined);
      assert.notEqual(
        r.reference.frames[0].frameSha256,
        r.probe.frames[0].frameSha256,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
test(
  "visible-page workflow accepts two files and exposes JSON download",
  { skip: !enabled, timeout: 120000 },
  async () => {
    const { chromium } = await import("playwright"),
      { startServer } = await import("../server.mjs");
    const { server, url } = await startServer();
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          "--use-angle=swiftshader",
          "--enable-webgl",
          "--ignore-gpu-blocklist",
        ],
      });
      const page = await browser.newPage();
      await page.goto(url + "/experiments/face-bench/");
      await page.selectOption("#engine", "yunet-sface");
      await page.setInputFiles("#reference", fixture);
      await page.setInputFiles("#probe", fixture);
      await page.fill("#maxFrames", "1");
      await page.click("#run");
      await page.waitForFunction(
        () => document.getElementById("status").textContent === "Complete",
        {},
        { timeout: 90000 },
      );
      assert.equal(await page.locator("#frames tr").count(), 2);
      assert.equal(await page.locator("#download").isEnabled(), true);
      assert.ok(
        (await page.locator("#result").textContent()).includes("compared"),
      );
      const download = page.waitForEvent("download");
      await page.click("#download");
      assert.match((await download).suggestedFilename(), /yunet-sface.*json/);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
