/**
 * @file HTML report of scripts-dev/ghostyle-fuzz.cjs.
 * @description
 * buildReportHtml(data) returns one self-contained page (no network, no
 * external script). The data is embedded as JSON; the views are drawn in the
 * browser with plain SVG and canvas:
 *
 *   1. Two criteria   escapeRate × worstCase for every trial, Pareto front
 *   2. Leaderboard    sortable on escapeRate, worstCase, medianMargin, ...
 *   3. Trial detail   anchor + strokes, palette, evasion profile, pose map
 *   4. Fuzz matrix    trials × imprints, colour = dAtlas
 *   5. What matters   one trial feature against one score, with Pearson r
 *   6. Compare        dAtlas profiles of up to four ticked trials
 *
 * See tutorials/ghostyle-fuzz.md §8 for what each view is for.
 */

function escapeJson(value) {
   return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function buildReportHtml(data) {
   return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>ghostyle-fuzz report</title>
<style>
:root {
  --bg: #14161a; --panel: #1c1f26; --line: #2c313c; --text: #e8ecf4; --muted: #9aa3b2;
  --accent: #ffd166; --escaped: #2a9d8f; --matched: #d1495b; --lost: #4be3a0; --mid: #f4f1de;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 system-ui, -apple-system, Segoe UI, sans-serif; }
header, section { padding: 16px 20px; }
header { border-bottom: 1px solid var(--line); }
h1 { font-size: 20px; margin: 0 0 6px; }
h2 { font-size: 16px; margin: 0 0 4px; }
.sub { color: var(--muted); margin: 0 0 12px; max-width: 900px; }
.facts { display: flex; flex-wrap: wrap; gap: 8px 22px; color: var(--muted); }
.facts b { color: var(--text); font-weight: 600; }
.chip { display: inline-block; width: 14px; height: 14px; border-radius: 3px; vertical-align: -2px; border: 1px solid #0006; }
.grid2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
@media (max-width: 1000px) { .grid2 { grid-template-columns: 1fr; } }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px; min-width: 0; }
.controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 10px; color: var(--muted); }
select, button, input[type=number] { background: #11141a; color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; font: inherit; }
button { cursor: pointer; }
svg { display: block; max-width: 100%; height: auto; }
svg text { fill: var(--muted); font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.tablewrap { max-height: 460px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
table { border-collapse: collapse; width: max-content; min-width: 100%; font-variant-numeric: tabular-nums; }
th, td { padding: 5px 6px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; font-size: 13px; }
th { position: sticky; top: 0; background: #232733; cursor: pointer; user-select: none; }
th.sorted::after { content: " ▼"; color: var(--accent); }
td.l, th.l { text-align: left; }
tr.sel td { background: #2b3242; }
tr:hover td { background: #262b37; }
.badge { font-size: 11px; padding: 1px 6px; border-radius: 9px; background: #3a3220; color: var(--accent); }
.muted { color: var(--muted); }
code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.detail { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 16px; }
@media (max-width: 800px) { .detail { grid-template-columns: 1fr; } }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; color: var(--muted); font-size: 12px; margin-top: 6px; }
.legend span::before { content: ""; display: inline-block; width: 12px; height: 3px; margin-right: 5px; vertical-align: middle; background: var(--c); }
canvas { max-width: 100%; image-rendering: pixelated; }
.empty { color: var(--muted); padding: 20px 0; }
a { color: var(--accent); }
</style>
</head>
<body>
<header>
  <h1>ghostyle-fuzz report</h1>
  <p class="sub">Random Ghostyles swept over the pose atlas of one video. Every distance is face-api's, measured in this lab with its own models; "escaped" means escaped <i>this</i> detector on <i>this</i> face, not protection against other systems.</p>
  <div class="facts" id="facts"></div>
</header>

<section>
  <div class="controls">
    Recipe <select id="recipe"></select>
    <label><input type="checkbox" id="showPruned"> include pruned trials</label>
    <span id="counts"></span>
  </div>
  <div class="grid2">
    <div class="panel">
      <h2>1 · Two criteria</h2>
      <p class="sub">X: share of imprints that escape (face lost, or dAtlas ≥ threshold). Y: worst case, the smallest dAtlas over all imprints: one recognised frame is enough for a camera. Highlighted: the Pareto front, trials no other trial beats on both. Click a point.</p>
      <div id="scatter"></div>
    </div>
    <div class="panel">
      <h2>2 · Leaderboard</h2>
      <p class="sub">Click a column to sort, a row to open the trial, a box to compare.</p>
      <div class="tablewrap"><table id="board"></table></div>
    </div>
  </div>
</section>

<section>
  <div class="panel">
    <h2>3 · Trial <span id="trialTitle" class="mono"></span></h2>
    <div class="detail">
      <div>
        <div id="thumb"></div>
        <div id="palette" style="margin-top:8px"></div>
        <p class="mono muted" id="cli" style="white-space:normal;word-break:break-all"></p>
        <div id="files"></div>
      </div>
      <div>
        <h2 style="font-size:14px">Evasion profile</h2>
        <p class="sub">X: time in the video; a tick per imprint. Y: face-api distance. Strip under the axis: face presence (MediaPipe), gaps hatched.</p>
        <div id="profile"></div>
        <div class="legend">
          <span style="--c:var(--accent)">dAtlas (nearest clean pose)</span>
          <span style="--c:#8fb3ff">dPair (same frame, clean)</span>
          <span style="--c:#5a6170">noise (clean drift between neighbouring poses)</span>
          <span style="--c:var(--matched)">threshold</span>
          <span style="--c:var(--lost)">▲ face lost</span>
        </div>
        <h2 style="font-size:14px;margin-top:14px">Pose map</h2>
        <p class="sub">One cell per pose bin (yaw × pitch). Colour: dAtlas, red below the threshold (recognised), teal above (escaped); × face lost; grey: pose seen but never recognised clean, so not measurable.</p>
        <div id="posemap"></div>
      </div>
    </div>
  </div>
</section>

<section>
  <div class="panel">
    <h2>4 · Fuzz matrix</h2>
    <p class="sub">Rows: trials (best first). Columns: imprints. Colour: dAtlas, same scale as the pose map. Bright rows are good trials; dark columns are poses that defeat every trial. Click a row.</p>
    <div class="controls">
      Rows by <select id="matrixRows"><option value="escapeRate">escapeRate</option><option value="worstCase">worstCase</option></select>
      Columns by <select id="matrixCols"><option value="yaw">yaw</option><option value="t">time</option></select>
      <span id="matrixNote" class="muted"></span>
    </div>
    <div id="matrix"></div>
  </div>
</section>

<section>
  <div class="grid2">
    <div class="panel">
      <h2>5 · What matters</h2>
      <p class="sub">One property of the trial against one score. Pearson r says how much they move together across trials; it is a hint, not a cause.</p>
      <div class="controls">X <select id="featX"></select> Y <select id="featY"><option value="escapeRate">escapeRate</option><option value="worstCase">worstCase</option><option value="medianMargin">medianMargin</option></select> <span id="pearson" class="mono"></span></div>
      <div id="features"></div>
    </div>
    <div class="panel">
      <h2>6 · Compare</h2>
      <p class="sub">dAtlas over time for the trials ticked in the leaderboard (up to four).</p>
      <div id="compare"></div>
    </div>
  </div>
</section>

<script type="application/json" id="data">${escapeJson(data)}</script>
<script>
(() => {
const DATA = JSON.parse(document.getElementById('data').textContent);
const A = DATA.atlas;
const TH = DATA.threshold;
const NS = 'http://www.w3.org/2000/svg';
const COMPARE_COLOURS = ['#ffd166', '#8fb3ff', '#ff8fab', '#7ae582'];
const state = { recipe: null, showPruned: false, sort: 'escapeRate', selected: null, compare: new Set() };

const fmt = (v, d = 3) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d));
const pct = (v) => (v === null || v === undefined ? '—' : (100 * v).toFixed(1) + '%');
const worstValue = (s) => (s.allLost ? Infinity : (s.worstCase === null ? -Infinity : s.worstCase));
const worstLabel = (s) => (s.allLost ? 'all lost' : fmt(s.worstCase));
const marginLabel = (s) => (s.medianMargin === null ? (s.lost * 2 > s.imprints ? 'lost' : '—') : fmt(s.medianMargin));
const el = (name, attrs = {}, parent) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
};
const svgText = (parent, x, y, text, anchor = 'start') => { const t = el('text', { x, y, 'text-anchor': anchor }, parent); t.textContent = text; return t; };
function distColour(row) {
  if (!row || row.detection === 'lost') return '#4be3a0';
  const d = row.dAtlas;
  if (d === null || d === undefined) return '#3a3f4b';
  const k = Math.max(-1, Math.min(1, (d - TH) / 0.35));
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const mid = [244, 241, 222];
  const c = k < 0 ? mix(mid, [209, 73, 91], -k) : mix(mid, [42, 157, 143], k);
  return 'rgb(' + c.join(',') + ')';
}

// ---- trials --------------------------------------------------------------
function visibleTrials() {
  return DATA.trials.filter((t) => t.recipeId === state.recipe && (state.showPruned || !t.pruned));
}
function pareto(items) {
  const front = new Set();
  for (const a of items) {
    const ae = a.scores.escapeRate, aw = worstValue(a.scores);
    if (!items.some((b) => b !== a && b.scores.escapeRate >= ae && worstValue(b.scores) >= aw && (b.scores.escapeRate > ae || worstValue(b.scores) > aw))) front.add(a);
  }
  return front;
}
const sorters = {
  escapeRate: (a, b) => (b.scores.escapeRate - a.scores.escapeRate) || (worstValue(b.scores) - worstValue(a.scores)),
  worstCase: (a, b) => (worstValue(b.scores) - worstValue(a.scores)) || (b.scores.escapeRate - a.scores.escapeRate),
  medianMargin: (a, b) => ((b.scores.medianMargin ?? -9) - (a.scores.medianMargin ?? -9)),
  lost: (a, b) => b.scores.lost - a.scores.lost,
  coverage: (a, b) => b.coverage - a.coverage,
  seed: (a, b) => a.seed - b.seed,
};

// ---- header --------------------------------------------------------------
function renderFacts() {
  const s = A.skinSwatch;
  const gaps = A.presence.gaps.length ? A.presence.gaps.map((g) => g.from.toFixed(1) + '–' + g.to.toFixed(1) + 's').join(', ') : 'none';
  const items = [
    ['video', A.source.file + ' · ' + A.source.width + '×' + A.source.height + ' · ' + A.source.fps.toFixed(2) + ' fps · ' + A.source.duration.toFixed(1) + ' s'],
    ['imprints', A.imprints.length + ' (bins ' + A.config.bin + '°, anchor #' + A.anchorId + ' at ' + A.imprints.find((i) => i.id === A.anchorId).t.toFixed(2) + ' s)'],
    ['poses seen, not recognised clean', String(A.unrecognisedBins.length)],
    ['presence gaps', gaps],
    ['skin swatch', '<span class="chip" style="background:' + s.hexForDisplay + '"></span> L* ' + s.lab[0] + ' a* ' + s.lab[1] + ' b* ' + s.lab[2] + ' (L* p10–p90 ' + s.lRange.join('–') + ')'],
    ['threshold', String(TH)],
    ['runs', String(DATA.runs.length)],
  ];
  document.getElementById('facts').innerHTML = items.map(([k, v]) => '<span>' + k + ': <b>' + v + '</b></span>').join('');
}

// ---- 1. scatter ------------------------------------------------------------
function renderScatter() {
  const box = document.getElementById('scatter');
  box.innerHTML = '';
  const trials = visibleTrials();
  if (!trials.length) { box.innerHTML = '<p class="empty">No trials for this recipe.</p>'; return; }
  const W = 560, H = 360, L = 48, R = 14, T = 14, B = 40;
  const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H }, box);
  const finite = trials.map((t) => t.scores.worstCase).filter((v) => v !== null);
  const yMax = Math.max(TH + 0.15, ...finite) + 0.05;
  const yTop = yMax + 0.08; // band for "all lost"
  const x = (v) => L + v * (W - L - R);
  const y = (s) => { const v = s.allLost ? yTop - 0.03 : (s.worstCase ?? 0); return T + (1 - v / yTop) * (H - T - B); };
  for (let i = 0; i <= 10; i += 2) { el('line', { x1: x(i / 10), x2: x(i / 10), y1: T, y2: H - B, stroke: '#2c313c' }, svg); svgText(svg, x(i / 10), H - B + 16, (i * 10) + '%', 'middle'); }
  for (let v = 0; v <= yMax; v += 0.2) { const yy = T + (1 - v / yTop) * (H - T - B); el('line', { x1: L, x2: W - R, y1: yy, y2: yy, stroke: '#2c313c' }, svg); svgText(svg, L - 6, yy + 4, v.toFixed(1), 'end'); }
  const thy = T + (1 - TH / yTop) * (H - T - B);
  el('line', { x1: L, x2: W - R, y1: thy, y2: thy, stroke: '#d1495b', 'stroke-dasharray': '5 4' }, svg);
  svgText(svg, W - R, thy - 4, 'threshold ' + TH, 'end');
  svgText(svg, L + 4, T + 10, 'all lost ↑');
  svgText(svg, (L + W) / 2, H - 6, 'escapeRate', 'middle');
  const yl = svgText(svg, 12, (T + H - B) / 2, 'worstCase (min dAtlas)', 'middle'); yl.setAttribute('transform', 'rotate(-90 12 ' + (T + H - B) / 2 + ')');
  const front = pareto(trials);
  const frontSorted = [...front].sort((a, b) => a.scores.escapeRate - b.scores.escapeRate);
  if (frontSorted.length > 1) el('polyline', { points: frontSorted.map((t) => x(t.scores.escapeRate) + ',' + y(t.scores)).join(' '), fill: 'none', stroke: '#ffd166', 'stroke-opacity': 0.5 }, svg);
  for (const t of trials) {
    const isFront = front.has(t);
    const c = el('circle', { cx: x(t.scores.escapeRate), cy: y(t.scores), r: isFront ? 5.5 : 3.2, fill: isFront ? '#ffd166' : (t.pruned ? '#5a6170' : '#8fb3ff'), 'fill-opacity': isFront ? 1 : 0.55, stroke: state.selected === t ? '#fff' : 'none', 'stroke-width': 2, style: 'cursor:pointer' }, svg);
    const title = el('title', {}, c); title.textContent = 'seed ' + t.seed + ' · escape ' + pct(t.scores.escapeRate) + ' · worst ' + worstLabel(t.scores);
    c.addEventListener('click', () => select(t));
  }
}

// ---- 2. leaderboard --------------------------------------------------------
function renderBoard() {
  const table = document.getElementById('board');
  const trials = visibleTrials().slice().sort(sorters[state.sort]);
  const front = pareto(trials);
  const cols = [
    ['#', null], ['seed', 'seed'], ['escape', 'escapeRate'], ['worst', 'worstCase'], ['margin', 'medianMargin'], ['lost', 'lost'], ['coverage', 'coverage'], ['palette', null], ['', null], ['cmp', null],
  ];
  table.innerHTML = '<thead><tr>' + cols.map(([label, key]) => '<th class="' + (key === state.sort ? 'sorted ' : '') + (label === 'palette' || label === '' || label === 'seed' ? 'l' : '') + '" data-key="' + (key || '') + '">' + label + '</th>').join('') + '</tr></thead>';
  const tbody = document.createElement('tbody');
  trials.slice(0, 300).forEach((t, i) => {
    const tr = document.createElement('tr');
    if (state.selected === t) tr.className = 'sel';
    tr.innerHTML = '<td>' + (i + 1) + '</td><td class="mono l">' + t.seed + '</td><td>' + pct(t.scores.escapeRate) + '</td><td>' + worstLabel(t.scores) + '</td><td>' + marginLabel(t.scores) + '</td><td>' + t.scores.lost + '/' + t.scores.imprints + '</td><td>' + pct(t.coverage) + '</td><td class="l">' + t.palette.colours.map((c) => '<span class="chip" title="' + c.hex + ' xterm ' + c.xterm + ' ΔL ' + c.deltaL + '" style="background:' + c.hex + '"></span>').join(' ') + '</td><td class="l">' + (front.has(t) ? '<span class="badge">Pareto</span> ' : '') + (t.pruned ? '<span class="muted">pruned</span> ' : '') + (t.files ? '<span class="muted">files</span>' : '') + '</td><td><input type="checkbox" ' + (state.compare.has(t) ? 'checked' : '') + '></td>';
    tr.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') select(t); });
    tr.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) { if (state.compare.size >= 4) { e.target.checked = false; return; } state.compare.add(t); } else state.compare.delete(t);
      renderCompare();
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  table.querySelectorAll('th[data-key]').forEach((th) => { if (th.dataset.key) th.addEventListener('click', () => { state.sort = th.dataset.key; renderBoard(); }); });
}

// ---- 3. detail --------------------------------------------------------------
function renderDetail() {
  const t = state.selected;
  const ids = ['thumb', 'palette', 'cli', 'files', 'profile', 'posemap'];
  if (!t) { ids.forEach((id) => { document.getElementById(id).innerHTML = ''; }); document.getElementById('trialTitle').textContent = '(click a trial)'; return; }
  document.getElementById('trialTitle').textContent = '#' + t.seed + ' · ' + t.recipeId + ' · escape ' + pct(t.scores.escapeRate) + ' · worst ' + worstLabel(t.scores) + (t.pruned ? ' · pruned' : '');
  const anchor = A.imprints.find((i) => i.id === A.anchorId);
  const thumb = document.getElementById('thumb');
  if (t.files) {
    thumb.innerHTML = '<img src="' + t.files.image + '" alt="anchor frame with the overlay" style="width:100%;border-radius:8px">';
  } else {
    thumb.innerHTML = '';
    const svg = el('svg', { viewBox: '0 0 ' + anchor.width + ' ' + anchor.height }, thumb);
    el('image', { href: DATA.anchorImage, x: 0, y: 0, width: anchor.width, height: anchor.height }, svg);
    for (const s of t.strokes) if (s.anchorPolygonPx.length >= 3) el('polygon', { points: s.anchorPolygonPx.map((p) => p.join(',')).join(' '), fill: s.colour, 'fill-opacity': t.recipe.opacity }, svg);
    const note = document.createElement('p'); note.className = 'muted'; note.style.fontSize = '12px';
    note.textContent = 'Strokes drawn flat on the anchor frame. Materialise the trial for the real render.';
    thumb.appendChild(note);
  }
  document.getElementById('palette').innerHTML = t.palette.colours.map((c) => '<div class="mono"><span class="chip" style="background:' + c.hex + '"></span> ' + c.hex + ' xterm ' + c.xterm + ' · ΔL* ' + c.deltaL + ' · ΔE00 ' + c.deltaE + '</div>').join('') +
    '<div class="mono muted">coverage ' + pct(t.coverage) + ' · strokes cross: ' + ['eyes', 'brows', 'lips', 'nose'].filter((r) => t.strokes.some((s) => s.regions[r] > 0)).join(', ') + '</div>';
  document.getElementById('cli').textContent = 'node scripts-dev/ghostyle-fuzz.cjs trial --atlas ' + DATA.atlasArg + ' --recipe <' + t.recipe.name + '.json> --seed ' + t.seed + ' --trials 1';
  document.getElementById('files').innerHTML = t.files ? '<a href="' + t.files.ghostyle + '">Ghostyle .js</a> · <a href="' + t.files.csv + '">evasion-profile.csv</a> · <a href="' + t.files.sheet + '">every pose with the overlay</a>' : '';
  renderProfile(document.getElementById('profile'), [{ trial: t, colour: null }]);
  renderPoseMap(t);
}

function profileFrame(box, height = 300) {
  const W = 760, H = height, L = 44, R = 12, T = 18, B = 46;
  const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H }, box);
  const dur = A.source.duration;
  const x = (t) => L + (t / dur) * (W - L - R);
  return { svg, W, H, L, R, T, B, x };
}

function renderProfile(box, series) {
  box.innerHTML = '';
  const f = profileFrame(box);
  const { svg, W, H, L, R, T, B, x } = f;
  const all = series.flatMap((s) => s.trial.rows);
  const yMax = Math.max(1.0, ...all.map((r) => Math.max(r.dAtlas ?? 0, r.dPair ?? 0))) + 0.05;
  const plotBottom = H - B;
  const y = (v) => T + (1 - v / yMax) * (plotBottom - T);
  for (let v = 0; v <= yMax; v += 0.2) { el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: '#2c313c' }, svg); svgText(svg, L - 6, y(v) + 4, v.toFixed(1), 'end'); }
  const step = A.source.duration > 60 ? 10 : 5;
  for (let s = 0; s <= A.source.duration; s += step) svgText(svg, x(s), plotBottom + 34, s + 's', 'middle');
  // presence strip
  const stripY = plotBottom + 6;
  el('rect', { x: L, y: stripY, width: W - L - R, height: 8, fill: '#3a8f6b', 'fill-opacity': 0.5 }, svg);
  const defs = el('defs', {}, svg);
  const pat = el('pattern', { id: 'hatch' + Math.random().toString(36).slice(2), width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  el('rect', { width: 5, height: 5, fill: '#14161a' }, pat);
  el('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: '#d1495b', 'stroke-width': 3 }, pat);
  for (const g of A.presence.gaps) el('rect', { x: x(g.from), y: stripY, width: Math.max(2, x(g.to) - x(g.from)), height: 8, fill: 'url(#' + pat.id + ')' }, svg);
  // imprint ticks
  for (const imp of A.imprints) el('line', { x1: x(imp.t), x2: x(imp.t), y1: plotBottom, y2: plotBottom + 4, stroke: '#9aa3b2' }, svg);
  // threshold
  el('line', { x1: L, x2: W - R, y1: y(TH), y2: y(TH), stroke: '#d1495b', 'stroke-dasharray': '5 4' }, svg);
  svgText(svg, W - R, y(TH) - 4, 'threshold ' + TH, 'end');
  const byT = (rows) => rows.slice().sort((a, b) => a.t - b.t);
  if (series.length === 1) {
    // noise band
    const noise = byT(A.imprints).filter((i) => i.noise !== null);
    if (noise.length > 1) el('polygon', { points: [x(noise[0].t) + ',' + y(0)].concat(noise.map((i) => x(i.t) + ',' + y(i.noise)), [x(noise[noise.length - 1].t) + ',' + y(0)]).join(' '), fill: '#5a6170', 'fill-opacity': 0.45 }, svg);
  }
  series.forEach((s, si) => {
    const rows = byT(s.trial.rows);
    const colour = s.colour || '#ffd166';
    const pts = (key) => rows.filter((r) => r[key] !== null).map((r) => x(r.t) + ',' + y(r[key])).join(' ');
    if (series.length === 1) el('polyline', { points: pts('dPair'), fill: 'none', stroke: '#8fb3ff', 'stroke-width': 1.2, 'stroke-opacity': 0.8 }, svg);
    el('polyline', { points: pts('dAtlas'), fill: 'none', stroke: colour, 'stroke-width': 1.8 }, svg);
    for (const r of rows) {
      if (r.detection === 'lost') {
        const yy = T - 2;
        el('path', { d: 'M' + (x(r.t) - 4) + ' ' + (yy + 7) + ' L' + x(r.t) + ' ' + (yy) + ' L' + (x(r.t) + 4) + ' ' + (yy + 7) + ' Z', fill: series.length === 1 ? '#4be3a0' : colour }, svg);
        continue;
      }
      const c = el('circle', { cx: x(r.t), cy: y(r.dAtlas), r: 2.6, fill: r.detection === 'weak' ? 'none' : colour, stroke: colour }, svg);
      const title = el('title', {}, c); title.textContent = 'imprint ' + r.id + ' · t ' + r.t.toFixed(2) + 's · yaw ' + r.yaw + '° pitch ' + r.pitch + '° · dAtlas ' + r.dAtlas + ' · dPair ' + r.dPair + ' · ' + r.detection;
    }
  });
}

function renderPoseMap(t) {
  const box = document.getElementById('posemap');
  box.innerHTML = '';
  const bin = A.config.bin;
  const cells = new Map();
  for (const r of t.rows) { const imp = A.imprints.find((i) => i.id === r.id); cells.set(imp.bin.join(','), { row: r, imp }); }
  const unrec = new Set(A.unrecognisedBins.map((b) => b.join(',')));
  const keys = [...cells.keys(), ...unrec].map((k) => k.split(',').map(Number));
  const xs = keys.map((k) => k[0]); const ys = keys.map((k) => k[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const cs = 34, L = 52, T = 10, B = 34;
  const W = L + (x1 - x0 + 1) * cs + 10, H = T + (y1 - y0 + 1) * cs + B;
  const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, style: 'max-width:' + W * 1.4 + 'px' }, box);
  const cx = (bx) => L + (bx - x0) * cs;
  const cy = (by) => T + (y1 - by) * cs;
  // Labels are bin centres: bin [-10, 0) reads -5°.
  for (let bx = x0; bx <= x1; bx += 1) svgText(svg, cx(bx) + cs / 2, H - B + 14, ((bx + 0.5) * bin) + '°', 'middle');
  for (let by = y0; by <= y1; by += 1) svgText(svg, L - 6, cy(by) + cs / 2 + 4, ((by + 0.5) * bin) + '°', 'end');
  svgText(svg, (L + W) / 2, H - 4, 'yaw →', 'middle');
  const pl = svgText(svg, 10, T + (H - B - T) / 2, 'pitch ↑', 'middle'); pl.setAttribute('transform', 'rotate(-90 10 ' + (T + (H - B - T) / 2) + ')');
  for (const k of unrec) { const [bx, by] = k.split(',').map(Number); el('rect', { x: cx(bx) + 1, y: cy(by) + 1, width: cs - 2, height: cs - 2, fill: '#3a3f4b' }, svg); }
  for (const [k, { row, imp }] of cells) {
    const [bx, by] = k.split(',').map(Number);
    const r = el('rect', { x: cx(bx) + 1, y: cy(by) + 1, width: cs - 2, height: cs - 2, fill: distColour(row), stroke: imp.id === A.anchorId ? '#fff' : 'none' }, svg);
    const title = el('title', {}, r); title.textContent = 'imprint ' + imp.id + ' · yaw ' + imp.yaw + '° pitch ' + imp.pitch + '° · ' + (row.detection === 'lost' ? 'face lost' : 'dAtlas ' + row.dAtlas);
    if (row.detection === 'lost') svgText(svg, cx(bx) + cs / 2, cy(by) + cs / 2 + 4, '×', 'middle').setAttribute('style', 'fill:#0b2b1f;font-size:16px');
  }
  box.appendChild(scaleLegend());
}

/** Colour scale shared by the pose map and the fuzz matrix. */
function scaleLegend() {
  const W = 420, H = 46, L = 10, R = 10;
  const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, style: 'max-width:' + W + 'px;margin-top:6px' });
  const lo = TH - 0.35, hi = TH + 0.35, steps = 70;
  const x = (d) => L + ((d - lo) / (hi - lo)) * (W - L - R - 60);
  for (let i = 0; i < steps; i++) {
    const d = lo + (i / steps) * (hi - lo);
    el('rect', { x: x(d), y: 6, width: (W - L - R - 60) / steps + 0.5, height: 12, fill: distColour({ detection: 'ok', dAtlas: d }) }, svg);
  }
  el('rect', { x: W - R - 44, y: 6, width: 14, height: 12, fill: distColour({ detection: 'lost' }) }, svg);
  svgText(svg, W - R - 26, 16, 'lost');
  svgText(svg, x(lo), 34, lo.toFixed(2) + ' recognised');
  svgText(svg, x(TH), 34, String(TH), 'middle');
  svgText(svg, x(hi), 34, 'escaped ' + hi.toFixed(2), 'end');
  el('line', { x1: x(TH), x2: x(TH), y1: 3, y2: 21, stroke: '#14161a', 'stroke-width': 1.5 }, svg);
  return svg;
}

// ---- 4. matrix -------------------------------------------------------------
function renderMatrix() {
  const box = document.getElementById('matrix');
  box.innerHTML = '';
  const rowsBy = document.getElementById('matrixRows').value;
  const colsBy = document.getElementById('matrixCols').value;
  const trials = visibleTrials().slice().sort(sorters[rowsBy]);
  const shown = trials.length > 300 ? trials.slice(0, 200).concat(trials.slice(200).filter((_, i, arr) => i % Math.ceil(arr.length / 100) === 0)) : trials;
  document.getElementById('matrixNote').textContent = trials.length > 300 ? 'top 200 + every ' + Math.ceil((trials.length - 200) / 100) + 'th of the rest' : '';
  if (!shown.length) return;
  const cols = A.imprints.slice().sort((a, b) => (colsBy === 't' ? a.t - b.t : a.yaw - b.yaw));
  const cw = Math.max(4, Math.floor(900 / cols.length)), rh = shown.length > 120 ? 3 : 8;
  const canvas = document.createElement('canvas');
  canvas.width = cols.length * cw; canvas.height = shown.length * rh;
  canvas.style.width = Math.min(canvas.width * 1, 1100) + 'px';
  canvas.style.cursor = 'pointer';
  const ctx = canvas.getContext('2d');
  shown.forEach((t, ri) => {
    const byId = new Map(t.rows.map((r) => [r.id, r]));
    cols.forEach((imp, ci) => { ctx.fillStyle = byId.has(imp.id) ? distColour(byId.get(imp.id)) : '#22262f'; ctx.fillRect(ci * cw, ri * rh, cw - (cw > 5 ? 1 : 0), rh - (rh > 4 ? 1 : 0)); });
  });
  canvas.addEventListener('click', (e) => { const rect = canvas.getBoundingClientRect(); const ri = Math.floor(((e.clientY - rect.top) / rect.height) * shown.length); if (shown[ri]) select(shown[ri]); });
  box.appendChild(canvas);
  box.appendChild(scaleLegend());
  const axis = document.createElement('div'); axis.className = 'mono muted';
  axis.textContent = 'columns: ' + (colsBy === 't' ? 'time ' + cols[0].t.toFixed(1) + 's → ' + cols[cols.length - 1].t.toFixed(1) + 's' : 'yaw ' + cols[0].yaw + '° → ' + cols[cols.length - 1].yaw + '°') + ' · rows: ' + shown.length + ' trials by ' + rowsBy;
  box.appendChild(axis);
}

// ---- 5. features -----------------------------------------------------------
const FEATURES = {
  coverage: ['coverage of the face oval', (t) => t.coverage],
  meanDeltaL: ['palette mean ΔL*', (t) => avg(t.palette.colours.map((c) => c.deltaL))],
  usedDeltaL: ['strokes mean ΔL* (colours used)', (t) => avg(t.strokes.map((s) => t.palette.colours[s.colourIndex].deltaL))],
  meanDeltaE: ['palette mean ΔE00', (t) => avg(t.palette.colours.map((c) => c.deltaE))],
  eyes: ['stroke area on the eyes', (t) => sum(t.strokes.map((s) => s.regions.eyes))],
  brows: ['stroke area on the brows', (t) => sum(t.strokes.map((s) => s.regions.brows))],
  nose: ['stroke area on the nose', (t) => sum(t.strokes.map((s) => s.regions.nose))],
  lips: ['stroke area on the lips', (t) => sum(t.strokes.map((s) => s.regions.lips))],
  clipped: ['stroke share outside the face', (t) => avg(t.strokes.map((s) => s.clippedShare))],
};
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sum = (a) => a.reduce((x, y) => x + y, 0);
function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const mx = avg(xs), my = avg(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
function renderFeatures() {
  const box = document.getElementById('features');
  box.innerHTML = '';
  const fx = document.getElementById('featX').value;
  const fy = document.getElementById('featY').value;
  const trials = visibleTrials().filter((t) => !t.pruned);
  const yOf = (t) => (fy === 'worstCase' ? (t.scores.allLost ? null : t.scores.worstCase) : t.scores[fy]);
  const pts = trials.map((t) => ({ t, x: FEATURES[fx][1](t), y: yOf(t) })).filter((p) => p.y !== null && Number.isFinite(p.x));
  const r = pearson(pts.map((p) => p.x), pts.map((p) => p.y));
  document.getElementById('pearson').textContent = 'r = ' + (r === null ? '—' : r.toFixed(2)) + ' · n = ' + pts.length;
  if (!pts.length) return;
  const W = 560, H = 320, L = 48, R = 14, T = 12, B = 40;
  const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H }, box);
  const xmin = Math.min(...pts.map((p) => p.x)), xmax = Math.max(...pts.map((p) => p.x));
  const ymin = Math.min(0, ...pts.map((p) => p.y)), ymax = Math.max(...pts.map((p) => p.y));
  const sx = (v) => L + ((v - xmin) / ((xmax - xmin) || 1)) * (W - L - R);
  const sy = (v) => T + (1 - (v - ymin) / ((ymax - ymin) || 1)) * (H - T - B);
  for (let i = 0; i <= 4; i++) { const v = ymin + (i / 4) * (ymax - ymin); el('line', { x1: L, x2: W - R, y1: sy(v), y2: sy(v), stroke: '#2c313c' }, svg); svgText(svg, L - 6, sy(v) + 4, v.toFixed(2), 'end'); }
  for (let i = 0; i <= 4; i++) { const v = xmin + (i / 4) * (xmax - xmin); svgText(svg, sx(v), H - B + 16, v.toFixed(2), 'middle'); }
  svgText(svg, (L + W) / 2, H - 6, FEATURES[fx][0], 'middle');
  for (const p of pts) { const c = el('circle', { cx: sx(p.x), cy: sy(p.y), r: 3.2, fill: '#8fb3ff', 'fill-opacity': 0.6, style: 'cursor:pointer' }, svg); c.addEventListener('click', () => select(p.t)); }
}

// ---- 6. compare ------------------------------------------------------------
function renderCompare() {
  const box = document.getElementById('compare');
  const list = [...state.compare];
  if (!list.length) { box.innerHTML = '<p class="empty">Tick up to four trials in the leaderboard.</p>'; return; }
  renderProfile(box, list.map((t, i) => ({ trial: t, colour: COMPARE_COLOURS[i] })));
  const legend = document.createElement('div'); legend.className = 'legend';
  legend.innerHTML = list.map((t, i) => '<span style="--c:' + COMPARE_COLOURS[i] + '">#' + t.seed + ' · ' + pct(t.scores.escapeRate) + ' · ' + worstLabel(t.scores) + '</span>').join('');
  box.appendChild(legend);
}

// ---- wiring ----------------------------------------------------------------
function select(t) { state.selected = t; renderScatter(); renderBoard(); renderDetail(); }
function renderAll() {
  const trials = visibleTrials();
  document.getElementById('counts').textContent = trials.length + ' trials shown · ' + DATA.trials.filter((t) => t.recipeId === state.recipe).length + ' for this recipe · ' + DATA.trials.length + ' in total';
  if (!state.selected || !trials.includes(state.selected)) state.selected = trials.slice().sort(sorters.escapeRate)[0] || null;
  for (const t of [...state.compare]) if (!trials.includes(t)) state.compare.delete(t);
  renderScatter(); renderBoard(); renderDetail(); renderMatrix(); renderFeatures(); renderCompare();
}
const recipes = [...new Set(DATA.trials.map((t) => t.recipeId))];
const recipeSel = document.getElementById('recipe');
recipeSel.innerHTML = recipes.map((r) => '<option>' + r + '</option>').join('');
state.recipe = recipes[0] || null;
recipeSel.addEventListener('change', () => { state.recipe = recipeSel.value; renderAll(); });
document.getElementById('showPruned').addEventListener('change', (e) => { state.showPruned = e.target.checked; renderAll(); });
document.getElementById('featX').innerHTML = Object.entries(FEATURES).map(([k, [label]]) => '<option value="' + k + '">' + label + '</option>').join('');
document.getElementById('featX').addEventListener('change', renderFeatures);
document.getElementById('featY').addEventListener('change', renderFeatures);
document.getElementById('matrixRows').addEventListener('change', renderMatrix);
document.getElementById('matrixCols').addEventListener('change', renderMatrix);
renderFacts();
renderAll();
})();
</script>
</body>
</html>
`;
}

module.exports = { buildReportHtml };
