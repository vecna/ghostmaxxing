import { chromium } from "playwright";
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { startServer } from "./server.mjs";
const argv = process.argv.slice(2),
  args = {};
for (let i = 0; i < argv.length; i++) {
  const key = argv[i].replace(/^--/, "");
  if (key === "headed") args.headed = true;
  else {
    if (!argv[i + 1] || argv[i + 1].startsWith("--"))
      throw Error("Missing argument " + key);
    args[key] = argv[++i];
  }
}
if (!args.reference || !args.probe) {
  console.error(
    "node runner.mjs --engine face-api --reference /path/a.mp4 --probe /path/b.mp4 --out /path/result.json [--headed] [--fps 2] [--max-frames 300] [--gallery-limit 40] [--overlay file.json] [--visage-module /local/adapter.mjs]",
  );
  process.exit(1);
}
const inputs = {
  "/__input/reference": path.resolve(args.reference),
  "/__input/probe": path.resolve(args.probe),
};
await Promise.all(Object.values(inputs).map((p) => readFile(p)));
const { server, url } = await startServer(inputs);
let browser;
try {
  browser = await chromium.launch({
    headless: !args.headed,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: [
      "--use-angle=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
    ],
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("Browser:", e.message));
  await page.goto(url + "/experiments/face-bench/");
  await page.waitForFunction(() => !!window.faceBench);
  await page.exposeFunction("benchProgress", (r) =>
    console.log(`${r.phase} ${r.timestamp.toFixed(2)}s ${r.status}`),
  );
  const config = {
    engine: args.engine || "face-api",
    reference: url + "/__input/reference",
    probe: url + "/__input/probe",
    referenceName: path.basename(args.reference),
    probeName: path.basename(args.probe),
    fps: Number(args.fps || 2),
    maxFrames: Number(args["max-frames"] || 300),
    galleryLimit: Number(args["gallery-limit"] || 40),
    visageModule: args["visage-module"],
    overlay: args.overlay
      ? JSON.parse(await readFile(args.overlay, "utf8"))
      : null,
  };
  await page.evaluate((config) => {
    document.getElementById("engine").value = config.engine;
    document.getElementById("fps").value = config.fps;
    document.getElementById("maxFrames").value = config.maxFrames;
  }, config);
  const result = await page.evaluate(
    async (config) =>
      window.faceBench.run(config, async ({ phase, row, frame, faces }) => {
        const { drawDiagnostics } = await import("./overlay.mjs");
        drawDiagnostics(document.getElementById("preview"), frame, faces);
        document.getElementById("status").textContent =
          `${phase} ${row.timestamp}s ${row.status}`;
        await window.benchProgress({
          phase,
          timestamp: row.timestamp,
          status: row.status,
        });
      }),
    config,
  );
  const out = path.resolve(args.out || `result-${config.engine}.json`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(result, null, 2) + "\n");
  if (args.screenshot)
    await page.screenshot({ path: args.screenshot, fullPage: true });
  console.log(
    JSON.stringify(
      { out, reference: result.reference.summary, probe: result.probe.summary },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
