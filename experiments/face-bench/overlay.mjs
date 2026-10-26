// A generic image-space intervention, not a Ghostyle onDraw/paintUV adapter.
export function applyOverlay(ctx, width, height, overlay) {
  if (!overlay) return;
  for (const polygon of overlay.polygons || []) {
    if (!polygon.points?.length) continue;
    ctx.save();
    ctx.fillStyle = polygon.fill || "#000";
    ctx.beginPath();
    polygon.points.forEach(([x, y], i) => {
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        x > 1 ||
        y < 0 ||
        y > 1
      )
        throw Error("Overlay points must be normalized [0,1]");
      if (i) ctx.lineTo(x * width, y * height);
      else ctx.moveTo(x * width, y * height);
    });
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
export function drawDiagnostics(canvas, frame, faces) {
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(frame, 0, 0);
  for (const face of faces) {
    const b = face.box;
    ctx.strokeStyle = "#00e5a8";
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.width, b.height);
    ctx.fillStyle = "#ff5f8f";
    for (const p of face.points || []) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
