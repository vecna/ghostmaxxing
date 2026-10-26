import { runExperiment } from "./bench.mjs";
import { drawDiagnostics } from "./overlay.mjs";
const $ = (id) => document.getElementById(id);
let result, controller;
window.faceBench = { run: runExperiment };
$("run").onclick = async () => {
  const a = $("reference").files[0],
    b = $("probe").files[0];
  if (!a || !b) {
    $("status").textContent = "Select both videos.";
    return;
  }
  const urls = [URL.createObjectURL(a), URL.createObjectURL(b)];
  controller = new AbortController();
  $("run").disabled = true;
  $("cancel").disabled = false;
  $("download").disabled = true;
  $("result").textContent = "";
  $("frames").textContent = "";
  $("status").textContent = "Loading model and hashing assets…";
  try {
    const overlayFile = $("overlay").files[0],
      overlay = overlayFile ? JSON.parse(await overlayFile.text()) : null;
    result = await runExperiment(
      {
        engine: $("engine").value,
        reference: urls[0],
        probe: urls[1],
        referenceName: a.name,
        probeName: b.name,
        fps: Number($("fps").value),
        maxFrames: Number($("maxFrames").value),
        galleryLimit: Number($("galleryLimit").value),
        overlay,
      },
      ({ phase, row, frame, faces }) => {
        drawDiagnostics($("preview"), frame, faces);
        const tr = document.createElement("tr");
        for (const v of [
          phase,
          row.timestamp.toFixed(2),
          row.status,
          row.proximity?.best?.toFixed(4) ?? "—",
          row.proximity?.topKMedian?.toFixed(4) ?? "—",
        ]) {
          const td = document.createElement("td");
          td.textContent = v;
          tr.append(td);
        }
        $("frames").append(tr);
        $("status").textContent =
          `${phase} ${row.timestamp.toFixed(2)}s — ${row.status}${row.proximity ? " — " + row.proximity.topKMedian.toFixed(4) : ""}`;
      },
      controller.signal,
    );
    $("result").textContent = JSON.stringify(
      {
        reference: result.reference.summary,
        probe: result.probe.summary,
        gallery: result.galleryTimestamps.length,
        model: result.metadata.model,
      },
      null,
      2,
    );
    $("download").disabled = false;
    $("status").textContent = "Complete";
  } catch (e) {
    $("status").textContent = e.message;
  } finally {
    urls.forEach(URL.revokeObjectURL);
    $("run").disabled = false;
    $("cancel").disabled = true;
  }
};
$("cancel").onclick = () => controller?.abort();
$("download").onclick = () => {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = "face-bench-" + result.metadata.engine + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
};
