import { createEngine } from "./registry.mjs";
import {
  schedule,
  selectGallery,
  proximityWithEngine,
  summary,
} from "./core.mjs";
import { applyOverlay } from "./overlay.mjs";
async function sha(bytes) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
async function fingerprintAssets(engine) {
  const result = {};
  for (const url of engine.metadata.assets || []) {
    const r = await fetch(url);
    if (!r.ok)
      throw Error(
        "Missing asset " +
          url +
          " (" +
          r.status +
          "). Run setup for the selected engine.",
      );
    result[url] = await sha(await r.arrayBuffer());
  }
  return result;
}
function once(target, event, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(event, ok);
      target.removeEventListener("error", bad);
    };
    const ok = () => {
        cleanup();
        resolve();
      },
      bad = () => {
        cleanup();
        reject(Error("Video decoding failed"));
      },
      timer = setTimeout(() => {
        cleanup();
        reject(Error("Timed out waiting for " + event));
      }, timeout);
    target.addEventListener(event, ok, { once: true });
    target.addEventListener("error", bad, { once: true });
  });
}
export async function openVideo(url) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const ready = once(video, "loadeddata");
  video.src = url;
  video.load();
  try {
    await ready;
  } catch (e) {
    video.removeAttribute("src");
    video.load();
    throw e;
  }
  if (!video.videoWidth || !Number.isFinite(video.duration))
    throw Error("Video has no decodable finite duration");
  return video;
}
async function frameAt(video, time, maxWidth) {
  if (Math.abs(video.currentTime - time) > 1e-6) {
    const ready = once(video, "seeked");
    video.currentTime = time;
    await ready;
  }
  const frame = document.createElement("canvas"),
    ratio = Math.min(1, maxWidth / video.videoWidth);
  frame.width = Math.round(video.videoWidth * ratio);
  frame.height = Math.round(video.videoHeight * ratio);
  frame.getContext("2d").drawImage(video, 0, 0, frame.width, frame.height);
  return frame;
}
export async function runExperiment(config, onFrame = () => {}, signal) {
  const options = {
    fps: 2,
    maxFrames: 300,
    galleryLimit: 40,
    topK: 5,
    maxWidth: 960,
    ...config,
  };
  if (
    !Number.isInteger(options.topK) ||
    options.topK < 1 ||
    !Number.isInteger(options.maxWidth) ||
    options.maxWidth < 32
  )
    throw Error("Invalid comparison/frame settings");
  const engine = await createEngine(options.engine, options),
    videos = [];
  const start = performance.now();
  try {
    engine.metadata.assetSha256 = await fingerprintAssets(engine);
    if (engine.metadata.templateSpace)
      engine.metadata.templateSpace +=
        ":" +
        (await sha(
          new TextEncoder().encode(
            JSON.stringify({
              assets: engine.metadata.assetSha256,
              preprocessing: engine.metadata.preprocessing,
            }),
          ),
        ));
    const loadStart = performance.now();
    await engine.load();
    const loadMs = performance.now() - loadStart;
    const reference = await openVideo(options.reference);
    videos.push(reference);
    const probe = await openVideo(options.probe);
    videos.push(probe);
    const referenceTimes = schedule(
        reference.duration,
        options.fps,
        options.maxFrames,
      ),
      probeTimes = schedule(probe.duration, options.fps, options.maxFrames);
    // Warm-up excluded from measurements; reset to avoid hidden temporal state.
    await engine.detect(await frameAt(reference, 0, options.maxWidth));
    await engine.reset();
    const metadata = {
      schemaVersion: "face-bench/0.1",
      engine: engine.id,
      capabilities: engine.capabilities,
      model: engine.metadata,
      loadMs,
      browser: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      webgpuAvailable: !!navigator.gpu,
      settings: {
        fps: options.fps,
        maxFrames: options.maxFrames,
        galleryLimit: options.galleryLimit,
        topK: options.topK,
        maxWidth: options.maxWidth,
        overlay: options.overlay || null,
      },
      inputs: {
        reference: {
          name: options.referenceName || "reference",
          duration: reference.duration,
          width: reference.videoWidth,
          height: reference.videoHeight,
          scheduledFrames: referenceTimes.length,
          capped:
            referenceTimes.length < Math.ceil(reference.duration * options.fps),
        },
        probe: {
          name: options.probeName || "probe",
          duration: probe.duration,
          width: probe.videoWidth,
          height: probe.videoHeight,
          scheduledFrames: probeTimes.length,
          capped: probeTimes.length < Math.ceil(probe.duration * options.fps),
        },
      },
    };
    async function collect(video, times, phase, gallery = []) {
      const rows = [];
      await engine.reset();
      for (const timestamp of times) {
        if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
        const frame = await frameAt(video, timestamp, options.maxWidth);
        if (phase === "probe")
          applyOverlay(
            frame.getContext("2d"),
            frame.width,
            frame.height,
            options.overlay,
          );
        const pixels = frame
          .getContext("2d")
          .getImageData(0, 0, frame.width, frame.height);
        const frameSha256 = await sha(pixels.data);
        let faces = [],
          error = null,
          status;
        const begun = performance.now();
        try {
          faces = await engine.detect(frame);
          status =
            faces.length === 0
              ? "no-face"
              : faces.length > 1
                ? "multiple-faces"
                : !engine.capabilities.embeddings
                  ? "detected-only"
                  : faces[0].template
                    ? "template-extracted"
                    : faces[0].templateError
                      ? "alignment-or-template-failed"
                      : "no-template";
        } catch (e) {
          status = "inference-error";
          error = e.message;
        }
        const row = {
          timestamp,
          decodedTimestamp: video.currentTime,
          frameSha256,
          width: frame.width,
          height: frame.height,
          elapsedMs: performance.now() - begun,
          status,
          faceCount: faces.length,
          faces: faces.map(({ template, ...face }) => face),
          error,
        };
        if (status === "template-extracted") {
          row.template = faces[0].template;
          if (phase === "probe") {
            if (gallery.length) {
              row.proximity = await proximityWithEngine(
                engine,
                row.template,
                gallery,
                options.topK,
              );
              row.status = "compared";
            } else row.status = "no-reference-templates";
          }
        }
        rows.push(row);
        await onFrame({ phase, row, frame, faces });
      }
      return rows;
    }
    const a = await collect(reference, referenceTimes, "reference"),
      gallery = selectGallery(a, options.galleryLimit);
    const b = await collect(probe, probeTimes, "probe", gallery);
    return {
      metadata,
      galleryTimestamps: gallery.map((r) => r.timestamp),
      reference: { summary: summary(a), frames: a },
      probe: { summary: summary(b), frames: b },
      totalMs: performance.now() - start,
    };
  } finally {
    for (const v of videos) {
      v.removeAttribute("src");
      v.load();
    }
    await engine.dispose();
  }
}
