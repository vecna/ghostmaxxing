# Ghostyle Authoring Guide

**Project:** Ghostmaxxing  
**Recommended path in repository:** `docs/GHOSTYLE_AUTHORING.md`  
**Audience:** people and AI agents creating, reviewing, or maintaining Ghostyles  
**Status:** first practical authoring guide, aligned with the July 2026 Ghostmaxxing MVP direction

---

## 1. What this document is for

A **Ghostyle** is a JavaScript module that draws a face-anchored visual pattern inside the Ghostmaxxing web app. A Ghostyle can be:

- a **2D overlay** drawn directly on the video/canvas layer using face-api landmarks;
- a **UV/3D overlay** drawn into a canonical face texture and warped onto the MediaPipe face mesh;
- a **hybrid Ghostyle** that exports both callbacks in the same file.

This document is the first page contributors should read before generated JSDoc. JSDoc is useful as API reference, but this file explains the practical contract, file shape, review expectations, and current project decisions.

The canonical example remains:

```text
ghostyles/00-template.js
```

That file should stay very heavily commented. It is not only a test plugin; it is executable documentation.

---

## 2. Current runtime assumptions

Ghostmaxxing is currently a static browser application. The main webcam app is:

```text
lab.html
```

The site pages around the app are:

```text
index.html
about.html
report.html
```

Ghostyles are currently loaded from:

```text
ghostyles.json
ghostyles/*.js
```

The current manifest shape is intentionally simple:

```json
[
  { "id": "00-template", "url": "ghostyles/00-template.js" }
]
```

The project direction is to keep this file machine-editable and eventually make it richer by generating metadata from Ghostyle headers. The loader should not require humans to duplicate the same metadata in two places.

---

## 3. Naming and public API direction

Ghostmaxxing is the active project name.

Old names may still exist in code during migration:

```js
window.gstmxx
window.gstmxx
```

The desired short public API name is:

```js
window.gstmxx
```

During the migration, plugin examples should use a compatibility alias:

```js
const G = window.gstmxx || window.gstmxx || window.gstmxx;
```

After the runtime migration is complete, examples can be simplified to:

```js
const G = window.gstmxx;
```

---

## 4. Minimal Ghostyle

A Ghostyle is an ES module. It must export at least one render callback:

- `onDraw(ctx, landmarks, box)` for 2D/pixel-space drawing;
- `paintUV(ctx, params, helpers)` for UV/3D drawing.

A minimal 2D Ghostyle:

```js
/**
 * ==Ghostyle==
 * @name         Minimal 2D Example
 * @version      0.1.0
 * @author       Your Name
 * @release_date 2026-07-02
 * @description  Minimal pixel-space example that draws a small mark near the left eye.
 * ==/Ghostyle==
 */

const G = window.gstmxx || window.gstmxx || window.gstmxx;

export function onDraw(ctx, landmarks, box) {
  const leftEye = landmarks.getLeftEye();
  const center = G.avgPoint(leftEye);

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.arc(center.x, center.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
```

A minimal UV/3D Ghostyle:

```js
/**
 * ==Ghostyle==
 * @name         Minimal UV Example
 * @version      0.1.0
 * @author       Your Name
 * @release_date 2026-07-02
 * @description  Minimal UV-space example that draws a horizontal band on the face texture.
 * ==/Ghostyle==
 */

export function paintUV(ctx) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(w * 0.2, h * 0.38, w * 0.6, h * 0.08);
  ctx.restore();
}
```

A hybrid Ghostyle exports both callbacks:

```js
export function onDraw(ctx, landmarks, box) {
  // 2D/pixel-space drawing.
}

export function paintUV(ctx, params, helpers) {
  // UV/3D texture drawing.
}
```

Hybrid Ghostyles are valid and encouraged when they help compare 2D and 3D behavior.

---

## 5. Header metadata

Each Ghostyle should start with a structured header:

```js
/**
 * ==Ghostyle==
 * @name         Smokey Eyes
 * @version      2.0.0
 * @author       NINA
 * @release_date 2026-07-02
 * @description  Short human-readable explanation of the visual pattern.
 * ==/Ghostyle==
 */
```

Current required tags:

| Tag | Required | Meaning |
|---|---:|---|
| `@name` | yes | Human-readable display name. |
| `@description` | yes | One-sentence explanation. |
| `@release_date` | recommended | ISO date, useful for generated manifests. |
| `@version` | recommended | Semver-style plugin version. |
| `@author` | recommended | Person, collective, or project name. |

Proposed future tags, not yet enforced:

| Tag | Possible values | Why it matters |
|---|---|---|
| `@capability` | `2d`, `uv`, `hybrid` | Can be generated from exports, but explicit metadata helps review. |
| `@technique` | free text | Example: `cv-dazzle`, `orbit-disruption`, `contour`, `texture-stripes`. |
| `@surface` | free text | Example: `eyes`, `brows`, `cheeks`, `full-face`, `uv-skin`. |
| `@intensity` | `low`, `medium`, `high` | Helps users choose between subtle and expressive patterns. |
| `@review_status` | `experimental`, `workshop-tested`, `reference` | Helps decide what appears prominently in the gallery. |
| `@license` | SPDX string | Useful if third-party authors submit plugins. |

The manifest generator can eventually read these tags and update `ghostyles.json` automatically.

---

## 6. 2D callback: `onDraw(ctx, landmarks, box)`

Use `onDraw` when you want to draw directly on the live video canvas using face-api style landmarks.

Signature:

```js
export function onDraw(ctx, landmarks, box) {}
```

Arguments:

| Argument | Meaning |
|---|---|
| `ctx` | Canvas 2D rendering context for the overlay layer. |
| `landmarks` | face-api landmark object with methods such as `getLeftEye()`, `getRightEye()`, `getNose()`, `getMouth()`, `getJawOutline()`. |
| `box` | Optional face bounding box `{ x, y, width, height }`. |

Useful API helpers exposed by the runtime include:

```js
G.avgPoint(points)
G.point(x, y)
G.lerp(a, b, t)
G.scaleFrom(center, point, scale)
G.drawClosedPath(ctx, points, fillStyle, strokeStyle, lineWidth)
G.drawOpenPath(ctx, points, strokeStyle, lineWidth, dashed)
G.drawLabel(ctx, text, x, y)
G.expandEyePolygon(eye, eyebrow, scale, eyebrowLift)
G.clipLeftHalf(ctx, landmarks)
G.clipRightHalf(ctx, landmarks)
```

Use the helper functions before writing raw geometry. They make plugins shorter and more consistent.

### 2D best practices

- Keep `onDraw` synchronous. It runs in the hot render path.
- Always wrap drawing in `ctx.save()` / `ctx.restore()`.
- Avoid direct landmark indexing unless you know the exact structure. Prefer getters and helpers.
- Be tolerant of missing landmarks. If data is incomplete, return early.
- Do not perform network requests inside `onDraw`.
- Do not allocate large images, arrays, or canvases every frame unless necessary.
- Do not mutate global runtime state unless the API explicitly documents it.

---

## 7. UV/3D callback: `paintUV(ctx, params, helpers)`

Use `paintUV` when you want to draw onto a canonical texture that is later warped onto the MediaPipe face mesh.

Signature:

```js
export function paintUV(ctx, params, helpers) {}
```

Arguments:

| Argument | Meaning |
|---|---|
| `ctx` | Canvas 2D context of the UV texture. |
| `params` | Current parameter values derived from `export const params = [...]`. |
| `helpers` | Optional helper object supplied by the UV renderer. |

The coordinate system is not video pixels. It is the plugin texture:

```js
const w = ctx.canvas.width;
const h = ctx.canvas.height;
const u = x / w;
const v = y / h;
```

The UV renderer takes the texture produced by `paintUV` and maps it onto the detected face mesh.

### UV best practices

- Think in normalized face texture space, not screen coordinates.
- Keep important content away from the extreme edges of the texture unless you intend it to wrap or clip.
- Make alpha/transparency explicit.
- Use simple loops carefully; per-pixel operations can be expensive.
- Use declared `params` for user-tunable values instead of hard-coding everything.
- Avoid reading undeclared parameter names. The renderer may warn when a plugin reads a param it did not declare.

---

## 8. Parameters

UV plugins can expose controls by exporting `params`:

```js
export const params = [
  { name: 'angle', type: 'range', label: 'Angle', min: 0, max: Math.PI, step: 0.01, default: 0.37 },
  { name: 'alpha', type: 'range', label: 'Opacity', min: 0, max: 1, step: 0.01, default: 0.4 },
  { name: 'gap', type: 'bool', label: 'Transparent gap', default: true },
  { name: 'mode', type: 'select', label: 'Mode', options: ['stripe', 'chevron'], default: 'chevron' },
  { name: 'color1', type: 'color', label: 'Color 1', default: '#ffffff' }
];
```

Supported parameter types:

| Type | Expected fields |
|---|---|
| `range` | `min`, `max`, `step`, `default` |
| `bool` | `default` |
| `select` | `options`, `default` |
| `color` | `default` as CSS color string |

Parameter names should be stable. If you rename a parameter, old URLs, saved experiments, or screenshots may become harder to interpret.

---

## 9. Manifest entry

To include a Ghostyle in the app, add it to `ghostyles.json`:

```json
[
  { "id": "my-ghostyle", "url": "ghostyles/my-ghostyle.js" }
]
```

ID conventions:

- lowercase;
- hyphen-separated;
- stable once published;
- no spaces;
- no project-name prefix unless needed.

Good:

```text
uv-stripes
soft-contour
cv-dazzle-1
```

Avoid:

```text
New Plugin FINAL
plugin_test_3
GhostmaxxingSuperThing
```

Future direction: a script should parse headers and update `ghostyles.json` with richer metadata. Until then, keep the manifest simple and correct.

---

## 10. Validation

Run the plugin validator before opening a pull request:

```bash
npm run validate-plugin -- ghostyles/my-ghostyle.js
```

The current validator checks:

- presence of the `==Ghostyle==` header;
- required tags such as `@name` and `@description`;
- valid `@release_date` when present;
- at least one render callback: `onDraw` or `paintUV`;
- risky patterns such as async drawing or direct landmark access without guards.

Validation is not proof of visual quality. It only catches obvious structural problems.

---

## 11. Review checklist for accepting a Ghostyle

A Ghostyle is acceptable for the MVP if:

- it has a valid header;
- it exports `onDraw`, `paintUV`, or both;
- it appears in `ghostyles.json` with a stable ID;
- it does not load remote code, fonts, images, or models;
- it does not make network requests;
- it does not access the camera, microphone, storage, cookies, or DOM directly;
- it does not block the render loop;
- it handles missing landmarks or inactive 3D state without throwing;
- it is visually legible in the app;
- it has a short description of the technique or visual idea;
- it passes the validator.

A Ghostyle can be rejected or hidden from the default gallery if:

- it is too slow on ordinary laptops or phones;
- it is visually indistinguishable from an existing plugin;
- it is too fragile across lighting/camera conditions;
- it relies on undocumented runtime internals;
- it contains unrelated political slogans, branding, tracking, or external assets;
- it is not useful for either workshop play, visual exploration, or adversarial testing.

---

## 12. Security and distribution decisions

For the MVP, Ghostmaxxing should not support arbitrary public remote plugin loading.

Development workflow:

1. Create or edit a local file in `ghostyles/`.
2. Add or update its entry in `ghostyles.json`.
3. Use the app's reload/development affordance.
4. Validate the plugin.
5. Submit a pull request.

Public/user workflow:

1. Users see only plugins accepted into the repository.
2. The online Ghostyle system serves static files from the repository clone.
3. The gallery/archive can announce accepted Ghostyles after merge.

This is simpler and safer than letting users paste arbitrary plugin URLs into the production app. A plugin is executable JavaScript; treating remote loading as a normal user feature would create avoidable security and trust problems.

---

## 13. Common mistakes

### Mistake: assuming UV coordinates are screen pixels

`paintUV` draws a texture, not the camera frame. Use `ctx.canvas.width` and `ctx.canvas.height`, then think in normalized percentages.

### Mistake: async work in render callbacks

Do not do this:

```js
export async function onDraw(ctx, landmarks) {
  await something();
}
```

Render callbacks should be synchronous and fast.

### Mistake: no `ctx.restore()` after clipping

Do this:

```js
ctx.save();
try {
  // draw
} finally {
  ctx.restore();
}
```

Or, if not using `try/finally`, return only after restoring the context.

### Suggested convention: 

Call always the `window.gstmxx` global object as capital **`G`**:

```js
const G = window.gstmxx;
G.drawLabel(ctx, 'demo', 10, 10);
```

---

## 14. Suggested file template

Copy this into `ghostyles/my-ghostyle.js`:

```js
/**
 * ==Ghostyle==
 * @name         My Ghostyle
 * @version      0.1.0
 * @author       Your Name
 * @release_date 2026-07-02
 * @description  One-sentence description of the pattern and its visual intention.
 * ==/Ghostyle==
 */

const G = window.gstmxx;

export const params = [
  { name: 'alpha', type: 'range', label: 'Opacity', min: 0, max: 1, step: 0.01, default: 0.45 }
];

export function onDraw(ctx, landmarks, box) {
  if (!landmarks || !G) return;

  const leftEye = landmarks.getLeftEye?.();
  if (!leftEye || leftEye.length === 0) return;

  const c = G.avgPoint(leftEye);

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.beginPath();
  ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function paintUV(ctx, params) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const alpha = params?.alpha ?? 0.45;

  ctx.save();
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.fillRect(w * 0.25, h * 0.35, w * 0.5, h * 0.08);
  ctx.restore();
}
```

Then add:

```json
{ "id": "my-ghostyle", "url": "ghostyles/my-ghostyle.js" }
```

to `ghostyles.json`.
