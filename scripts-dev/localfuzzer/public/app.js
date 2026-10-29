/* Ghostmaxxing local fuzzer: the page. Plain DOM, no framework, no network beyond this server. */
(() => {
'use strict';

const $ = (id) => document.getElementById(id);
const state = {
   info: null, upload: null, fromJob: null, preset: 'quick', plan: null,
   jobs: [], selected: new Set(), detailId: null, logFrom: 0, previewTimer: null, previewSeq: 0,
};

// ---- helpers -------------------------------------------------------------

/** Build an element: h('div', {class: 'x', onclick: f}, 'text', child, ...). Text is always text, never HTML. */
function h(tag, attrs = {}, ...children) {
   const node = document.createElement(tag);
   for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, String(v));
   }
   for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
   return node;
}
const pct = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${(100 * v).toFixed(d)}%`);
function duration(s) {
   if (s === null || s === undefined || !Number.isFinite(s)) return '—';
   s = Math.max(0, Math.round(s));
   if (s < 60) return `${s} s`;
   const m = Math.round(s / 60);
   return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
const bytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} kB`);

async function api(method, url, body) {
   const opts = { method, headers: { 'X-Localfuzzer': '1' } };
   if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
   const res = await fetch(url, opts);
   const data = await res.json().catch(() => ({}));
   if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.data = data; throw e; }
   return data;
}
const fileUrl = (job, rel, download = false) => `/jobs/${encodeURIComponent(job.id)}/files/${rel.split('/').map(encodeURIComponent).join('/')}${download ? '?download=1' : ''}`;

// ---- header ----------------------------------------------------------------

function renderInfo() {
   const i = state.info;
   $('facts').textContent = `${i.tool} · ${i.cpus} CPU · ${i.arch} · ${i.memoryGb} GB RAM · data in ${i.dataDir}`;
   $('warnings').replaceChildren(...i.warnings.map((w) => h('div', { class: 'warning' }, w)));
}

// ---- 1. upload -------------------------------------------------------------

function setupUpload() {
   const drop = $('drop'); const input = $('file');
   const pick = () => { if (!state.upload || state.upload.error) input.click(); };
   drop.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') pick(); });
   drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
   drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
   drop.addEventListener('dragleave', () => drop.classList.remove('over'));
   drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); });
   input.addEventListener('change', () => { if (input.files[0]) upload(input.files[0]); input.value = ''; });
}

function showDrop(mode) {
   $('dropIdle').hidden = mode !== 'idle'; $('dropBusy').hidden = mode !== 'busy'; $('dropDone').hidden = mode !== 'done';
   $('drop').classList.toggle('done', mode === 'done');
}

function upload(file) {
   state.fromJob = null; $('fromJobNote').hidden = true;
   state.upload = { name: file.name, busy: true };
   showDrop('busy');
   $('uploadText').textContent = `uploading ${file.name} (${bytes(file.size)})…`;
   const xhr = new XMLHttpRequest();
   xhr.open('PUT', `/api/upload?name=${encodeURIComponent(file.name)}`);
   xhr.setRequestHeader('X-Localfuzzer', '1');
   xhr.setRequestHeader('Content-Type', 'application/octet-stream');
   xhr.upload.onprogress = (e) => { if (e.lengthComputable) $('uploadBar').style.width = `${(100 * e.loaded / e.total).toFixed(1)}%`; };
   xhr.onload = () => {
      let data = {}; try { data = JSON.parse(xhr.responseText); } catch { /* keep {} */ }
      if (xhr.status !== 200) { state.upload = { error: data.error || `HTTP ${xhr.status}` }; renderUploaded(); return; }
      state.upload = data;
      if (!$('label').value) $('label').value = file.name.replace(/\.[^.]+$/, '');
      renderUploaded();
      schedulePreview();
   };
   xhr.onerror = () => { state.upload = { error: 'the upload failed (connection lost?)' }; renderUploaded(); };
   xhr.send(file);
}

function renderUploaded() {
   const u = state.upload;
   const box = $('dropDone');
   if (!u) { showDrop('idle'); updateStart(); return; }
   if (u.error) {
      box.replaceChildren(h('b', {}, 'Upload refused: '), u.error, ' ', h('button', { type: 'button', onclick: (e) => { e.stopPropagation(); state.upload = null; renderUploaded(); } }, 'Choose another file'));
   } else {
      const p = u.probe || {};
      box.replaceChildren(...[
         h('b', {}, u.name), ' · ', bytes(u.size), ' · ', `${p.width}×${p.height}`, ' · ', p.fps ? `${p.fps} fps` : '', ' · ', p.duration ? `${p.duration.toFixed(1)} s` : '', ' ',
         h('button', { type: 'button', class: 'ghost', onclick: (e) => { e.stopPropagation(); state.upload = null; renderUploaded(); } }, 'Change'),
         p.duration > 120 ? h('div', { class: 'warning' }, 'Long video: the atlas scans every frame at the sample rate; 15-60 s of head turning is enough. It will work, just slower.') : null,
      ].filter((x) => x !== null));
   }
   showDrop('done');
   updateStart();
}

// ---- presets and settings ---------------------------------------------------

const ATLAS_FIELDS = [
   ['sampleFps', 'sample fps', '--sample-fps', 'Frames per second scanned with MediaPipe (default 15).', { step: 'any', min: 0.1 }],
   ['bin', 'pose bin (°)', '--bin', 'Size of a yaw × pitch cell; one imprint per cell. Larger = fewer imprints = faster trials, coarser pose coverage (default 10).', { step: 'any', min: 1 }],
   ['maxImprints', 'max imprints', '--max-imprints', 'Cap on imprints; the bins farthest from frontal go first (default 60).', { step: 1, min: 2 }],
   ['candidates', 'candidates per bin', '--candidates', 'Frames tried per bin with face-api, sharpest first (default 3). More = sharper imprints, slower atlas.', { step: 1, min: 1 }],
   ['anchorWindow', 'anchor window (s)', '--anchor-window', 'Seconds where the frontal anchor frame is searched, e.g. 0-2 if the video starts frontal (default: whole video).', { text: true, placeholder: 'whole video' }],
   ['maxGap', 'max gap (s)', '--max-gap', 'Gaps in face presence longer than this are warned about in the log (default 0.5).', { step: 'any', min: 0 }],
];

function presetChoices() {
   const out = Object.entries(state.info.presets).map(([key, p]) => ({ key, label: p.label, description: p.description, plan: p.plan }));
   if (state.info.settings && state.info.settings.plan) out.push({ key: 'mine', label: 'My default', description: `Saved ${when(state.info.settings.savedAt)}.`, plan: state.info.settings.plan });
   out.push({ key: 'custom', label: 'Custom', description: 'Whatever the settings below say.', plan: null });
   return out;
}

function renderPresets() {
   const box = $('presets');
   box.replaceChildren(...presetChoices().map((p) => h('label', { class: `preset${state.preset === p.key ? ' on' : ''}` },
      h('input', { type: 'radio', name: 'preset', value: p.key, checked: state.preset === p.key, onchange: () => choosePreset(p.key) }),
      h('b', {}, p.label), h('div', { class: 'muted small' }, p.description), h('span', { class: 'eta', id: `eta-${p.key}` }))));
   for (const p of presetChoices()) if (p.plan) estimateFor(p.key, p.plan);
}

async function estimateFor(key, plan) {
   try {
      const e = await api('POST', '/api/preview', { plan, duration: state.upload && state.upload.probe ? state.upload.probe.duration : null });
      const el = $(`eta-${key}`);
      if (el) el.textContent = `${e.trials} trials · ${duration(e.estimate.low)}–${duration(e.estimate.high)}`;
   } catch { /* shown when selected */ }
}

function choosePreset(key) {
   state.preset = key;
   const p = presetChoices().find((x) => x.key === key);
   if (p && p.plan) state.plan = JSON.parse(JSON.stringify(p.plan));
   renderPresets(); renderSettings(); schedulePreview();
}

function markCustom() {
   if (state.preset !== 'custom') { state.preset = 'custom'; state.plan.preset = 'custom'; renderPresets(); }
   schedulePreview();
}

function renderSettings() {
   const plan = state.plan;
   $('atlasFields').replaceChildren(...ATLAS_FIELDS.map(([key, label, flag, help, o]) => h('label', {},
      h('span', {}, label, ' ', h('code', {}, flag)),
      h('input', {
         type: o.text ? 'text' : 'number', step: o.step, min: o.min, placeholder: o.placeholder,
         value: plan.atlas[key] === null || plan.atlas[key] === undefined ? '' : plan.atlas[key],
         oninput: (e) => { plan.atlas[key] = o.text ? (e.target.value.trim() || null) : (e.target.value === '' ? null : Number(e.target.value)); markCustom(); },
      }),
      h('span', { class: 'help' }, help))));
   $('cells').replaceChildren(...plan.cells.map((c, i) => renderCell(c, i)));
   $('gpu').checked = Boolean(plan.gpu);
}

function renderCell(c, i) {
   const plan = state.plan;
   const recipes = Object.keys(state.info.recipes);
   const isCustom = typeof c.recipe === 'object' && c.recipe !== null;
   const num = (key, label, flag, attrs = {}) => h('label', { title: flag }, label, h('input', { type: 'number', ...attrs, value: c[key], oninput: (e) => { c[key] = e.target.value === '' ? null : Number(e.target.value); markCustom(); } }));
   const recipeSelect = h('select', {
      onchange: (e) => {
         if (e.target.value === '__custom__') c.recipe = JSON.parse(JSON.stringify(state.info.recipes[isCustom ? 'three-bands.json' : c.recipe] || state.info.recipes['three-bands.json']));
         else c.recipe = e.target.value;
         renderSettings(); markCustom();
      },
   }, ...recipes.map((r) => h('option', { value: r, selected: !isCustom && c.recipe === r }, r.replace(/\.json$/, ''))), h('option', { value: '__custom__', selected: isCustom }, 'custom recipe (JSON)…'));
   const r = isCustom ? c.recipe : state.info.recipes[c.recipe];
   const recipeText = r ? `${r.count} × ${r.lengthCm}×${r.widthCm} cm, opacity ${r.opacity}${r.color ? `, colour ${r.color}` : ''}${r.zones ? `, zones ${r.zones.join('+')}` : ''}${r.overlap === false ? ', no overlap' : ''}` : '';
   const zoneBoxes = state.info.zones.map((z) => h('label', {}, h('input', {
      type: 'checkbox', checked: !c.zones || c.zones.includes(z),
      onchange: (e) => {
         const set = new Set(c.zones || state.info.zones);
         if (e.target.checked) set.add(z); else set.delete(z);
         c.zones = set.size === state.info.zones.length ? null : state.info.zones.filter((x) => set.has(x));
         markCustom();
      },
   }), z));
   // --color and --paired exclude each other: setting one clears the other, on screen too.
   const pairedBox = h('input', { type: 'checkbox', checked: c.paired, onchange: (e) => { c.paired = e.target.checked; if (c.paired) { c.color = null; colourInput.value = ''; } markCustom(); } });
   const colourInput = h('input', { type: 'text', value: c.color || '', placeholder: 'palette', oninput: (e) => { c.color = e.target.value.trim() || null; if (c.color) { c.paired = false; pairedBox.checked = false; } markCustom(); } });
   const pairedLabel = h('label', { title: '--paired: palette from its own random stream, so a seed gives the same strokes on every video' }, pairedBox, 'paired');
   return h('div', { class: 'cell' },
      h('div', { class: 'head' },
         h('b', {}, `${i + 1}.`),
         h('input', { type: 'text', value: c.name, 'aria-label': 'cell name', oninput: (e) => { c.name = e.target.value; markCustom(); } }),
         recipeSelect, h('span', { class: 'muted small' }, recipeText),
         h('span', { style: 'flex:1' }),
         h('button', { type: 'button', class: 'ghost', disabled: i === 0, title: 'move up', onclick: () => { [plan.cells[i - 1], plan.cells[i]] = [plan.cells[i], plan.cells[i - 1]]; renderSettings(); markCustom(); } }, '↑'),
         h('button', { type: 'button', class: 'ghost danger', disabled: plan.cells.length === 1, onclick: () => { plan.cells.splice(i, 1); renderSettings(); markCustom(); } }, 'Remove')),
      isCustom ? h('textarea', {
         spellcheck: 'false', 'aria-label': 'custom recipe JSON',
         oninput: (e) => { try { c.recipe = JSON.parse(e.target.value); e.target.style.borderColor = ''; markCustom(); } catch { e.target.style.borderColor = 'var(--bad)'; } },
      }, JSON.stringify(c.recipe, null, 2)) : null,
      h('div', { class: 'opts' },
         num('trials', 'trials', '--trials', { min: 1, step: 1 }),
         num('seed', 'seed', '--seed: trial k uses seed + k. Keep the same seed across jobs to compare the same designs on several videos.', { min: 0, step: 1 }),
         num('top', 'top', '--top: trials materialised as Ghostyles at the end (Pareto front first); also the bar pruning compares against', { min: 0, step: 1 }),
         h('label', { title: 'uncheck = --no-prune: sweep every imprint of every trial' }, h('input', { type: 'checkbox', checked: c.prune, onchange: (e) => { c.prune = e.target.checked; renderSettings(); markCustom(); } }), 'prune'),
         c.prune ? num('pruneSubset', 'subset', '--prune-subset: imprints swept before a trial may be abandoned', { min: 2, step: 1 }) : null,
         c.prune ? num('pruneMargin', 'margin', '--prune-margin: escapeRate slack before abandoning', { min: 0, step: 0.01 }) : null,
         pairedLabel,
         h('label', { title: '--color: one colour on every stroke instead of the skin-contrast palette (CSS name, #rgb, #rrggbb, rgb(r,g,b)); excludes paired' }, 'colour', colourInput),
         h('label', { title: '--no-overlap: strokes must not overlap one another' }, h('input', { type: 'checkbox', checked: c.noOverlap, onchange: (e) => { c.noOverlap = e.target.checked; markCustom(); } }), 'no overlap'),
         h('span', { class: 'zones', title: '--zones: where stroke centres may fall' }, 'zones:', ...zoneBoxes)));
}

function setupSettings() {
   $('addCell').addEventListener('click', () => {
      const last = state.plan.cells[state.plan.cells.length - 1];
      state.plan.cells.push({ ...JSON.parse(JSON.stringify(state.info.cellDefaults)), name: `cell-${state.plan.cells.length + 1}`, seed: last ? last.seed : 1000 });
      renderSettings(); markCustom();
   });
   $('gpu').addEventListener('change', (e) => { state.plan.gpu = e.target.checked; markCustom(); });
   $('saveDefault').addEventListener('click', async () => {
      try { await api('PUT', '/api/settings', { plan: state.plan }); state.info = await api('GET', '/api/info'); state.preset = 'mine'; renderPresets(); $('settingsNote').textContent = 'Saved: "My default" is now a preset.'; } catch (e) { showErrors(e.data && e.data.errors ? e.data.errors : [e.message]); }
   });
   $('clearDefault').addEventListener('click', async () => {
      await api('PUT', '/api/settings', { plan: null }); state.info = await api('GET', '/api/info');
      if (state.preset === 'mine') state.preset = 'custom';
      renderPresets(); $('settingsNote').textContent = 'Forgotten.';
   });
}

// ---- preview: validation, commands, estimate ---------------------------------

function showErrors(errors) {
   const box = $('planErrors');
   box.hidden = !errors.length;
   box.replaceChildren(h('b', {}, 'Fix before starting:'), h('ul', {}, ...errors.map((e) => h('li', {}, e))));
}

function schedulePreview() {
   clearTimeout(state.previewTimer);
   state.previewTimer = setTimeout(preview, 250);
}

async function preview() {
   const seq = ++state.previewSeq;
   try {
      const p = await api('POST', '/api/preview', { plan: state.plan, duration: state.upload && state.upload.probe ? state.upload.probe.duration : null });
      if (seq !== state.previewSeq) return;
      state.planValid = true; showErrors([]);
      $('commands').textContent = p.commands.join('\n');
      const e = p.estimate;
      $('estimate').textContent = `${p.trials} trials in ${state.plan.cells.length} cell(s). Estimated ${duration(e.low)}–${duration(e.high)} on this machine (typical ${duration(e.typical)}); the estimate sharpens once the atlas is built.`;
   } catch (err) {
      if (seq !== state.previewSeq) return;
      state.planValid = false;
      showErrors(err.data && err.data.errors ? err.data.errors : [err.message]);
      $('estimate').textContent = '';
   }
   updateStart();
}

function updateStart() {
   const hasVideo = (state.upload && state.upload.uploadId) || state.fromJob;
   $('start').disabled = !hasVideo || !state.planValid;
   $('start').title = !hasVideo ? 'Upload a video first' : !state.planValid ? 'Fix the settings first' : '';
}

async function start() {
   $('start').disabled = true;
   try {
      const body = { plan: state.plan, label: $('label').value.trim() };
      if (state.fromJob) body.fromJob = state.fromJob.id; else body.uploadId = state.upload.uploadId;
      const job = await api('POST', '/api/jobs', body);
      state.upload = null; state.fromJob = null; $('label').value = ''; $('fromJobNote').hidden = true;
      renderUploaded();
      await refreshJobs();
      openDetail(job.id);
   } catch (e) {
      showErrors(e.data && e.data.errors ? e.data.errors : [e.message]);
      updateStart();
   }
}

// ---- 2. jobs ------------------------------------------------------------------

function statusLine(j) {
   if (j.status === 'queued') return j.queuePosition ? `queued #${j.queuePosition}, starts in ~${duration(j.startsInSeconds)}${j.interrupted ? ' (will resume where it stopped)' : ''}` : 'queued';
   if (j.status === 'running') {
      const step = j.steps[j.stepIndex];
      const cur = j.current;
      const phase = !cur ? '' : cur.phase === 'trial' ? ` · trial ${cur.done}/${cur.total}` : cur.phase === 'scan' ? ` · scanning frames ${cur.done}/${cur.total}` : cur.phase === 'candidates' ? ` · face-api on candidates ${cur.done}/${cur.total}` : cur.phase === 'materialise' ? ' · writing the Ghostyles' : '';
      return `step ${j.stepIndex + 1}/${j.steps.length}: ${step ? step.title : ''}${phase} · ~${duration(j.etaSeconds)} left`;
   }
   if (j.status === 'done') return `finished ${when(j.finishedAt)}`;
   if (j.status === 'failed') return 'failed: see the log';
   return j.status;
}

function renderJobs() {
   const box = $('jobs');
   if (!state.jobs.length) { box.replaceChildren(h('p', { class: 'muted' }, 'No job yet.')); return; }
   box.replaceChildren(...state.jobs.map((j) => {
      const hl = j.headline;
      return h('div', { class: `job${state.detailId === j.id ? ' selected' : ''}` },
         h('input', { type: 'checkbox', title: 'select for compare', disabled: !j.imprints, checked: state.selected.has(j.id), onchange: (e) => { if (e.target.checked) state.selected.add(j.id); else state.selected.delete(j.id); $('compareBtn').disabled = state.selected.size < 2; } }),
         h('div', {},
            h('div', { class: 'name' }, j.label, h('span', { class: `pill ${j.status}` }, j.status)),
            h('div', { class: 'meta' }, `${j.video.original} · ${j.preset} · ${j.imprints ? `${j.imprints} imprints · ` : ''}created ${when(j.createdAt)}`),
            h('div', { class: 'meta' }, statusLine(j)),
            hl ? h('div', { class: 'meta' }, `best so far: seed ${hl.seed} (${hl.recipeId}) escapes ${pct(hl.scores.escapeRate)} = ${pct(hl.scores.lostRate)} lost + ${pct(hl.scores.descriptorEscape)} identity moved, face covered ${pct(hl.coverage)}`) : null),
         h('div', { class: 'actions' },
            h('button', { type: 'button', onclick: () => openDetail(j.id) }, 'Open'),
            ['queued', 'running'].includes(j.status) ? h('button', { type: 'button', class: 'danger', onclick: () => act(j, 'cancel', `Cancel "${j.label}"? A running job stops after its current trial; results so far are kept.`) }, 'Cancel') : null,
            ['cancelled', 'failed'].includes(j.status) ? h('button', { type: 'button', onclick: () => act(j, 'resume') }, 'Resume') : null,
            j.status !== 'running' ? h('button', { type: 'button', class: 'danger', onclick: () => removeJob(j) }, 'Delete') : null),
         ['running', 'queued'].includes(j.status) ? h('div', { class: 'progress' }, h('div', { class: 'bar' }, h('i', { style: `width:${j.percent}%` }))) : null);
   }));
}

async function act(job, action, confirmText) {
   if (confirmText && !confirm(confirmText)) return;
   try { await api('POST', `/api/jobs/${job.id}/${action}`); } catch (e) { alert(e.message); }
   refreshJobs();
}

async function removeJob(job) {
   if (!confirm(`Delete "${job.label}" for good? This removes the video, the atlas, the logs and the Ghostyles of this job from the data folder.`)) return;
   try { await api('DELETE', `/api/jobs/${job.id}`); } catch (e) { alert(e.message); return; }
   state.selected.delete(job.id);
   if (state.detailId === job.id) closeDetail();
   refreshJobs();
}

async function refreshJobs() {
   try {
      const data = await api('GET', '/api/jobs');
      state.jobs = data.jobs;
      for (const id of [...state.selected]) if (!state.jobs.some((j) => j.id === id)) state.selected.delete(id);
      $('compareBtn').disabled = state.selected.size < 2;
      renderJobs();
   } catch { /* server restarting: try again next tick */ }
}

async function compare() {
   const out = $('compareOut');
   out.hidden = false;
   $('compareText').textContent = 'comparing…';
   try {
      const r = await api('POST', '/api/compare', { jobIds: [...state.selected] });
      $('compareText').textContent = r.text;
   } catch (e) { $('compareText').textContent = `compare failed: ${e.message}`; }
}

// ---- 3. detail ---------------------------------------------------------------

function openDetail(id) {
   state.detailId = id; state.logFrom = 0;
   $('log').textContent = '';
   $('detail').hidden = false;
   renderJobs();
   refreshDetail(true);
   $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeDetail() { state.detailId = null; $('detail').hidden = true; renderJobs(); }

function splitBar(s) {
   return h('span', { class: 'split', title: `${pct(s.lostRate, 1)} lost + ${pct(s.descriptorEscape, 1)} identity moved` },
      h('i', { class: 'l', style: `width:${100 * (s.lostRate || 0)}%` }), h('i', { class: 'd', style: `width:${100 * (s.descriptorEscape || 0)}%` }));
}

function renderDetail(job) {
   $('detailTitle').textContent = `${job.label} · ${job.status}`;
   const s = job.summary;
   const body = [];
   body.push(h('p', { class: 'muted small' }, `${job.video.original} (${job.video.probe ? `${job.video.probe.width}×${job.video.probe.height}, ${job.video.probe.duration ? job.video.probe.duration.toFixed(1) : '?'} s` : ''}) · preset ${job.preset} · created ${when(job.createdAt)}${job.startedAt ? ` · started ${when(job.startedAt)}` : ''}${job.finishedAt ? ` · ended ${when(job.finishedAt)}` : ''}${job.secondsPerEval ? ` · ${job.secondsPerEval} s per imprint evaluation` : ''}`));
   if (job.status === 'running' || job.status === 'queued') body.push(h('p', {}, statusLine(job)));
   if (job.error) body.push(h('div', { class: 'errors' }, h('pre', {}, job.error)));
   body.push(h('div', { class: 'row' },
      job.hasReport ? h('a', { class: 'button', href: fileUrl(job, `${job.atlasDirName}/report.html`), target: '_blank', rel: 'noopener' }, 'Open the full report') : null,
      job.hasReport ? h('a', { class: 'button', href: `/api/jobs/${job.id}/download?what=ghostyles` }, 'Download the Ghostyles (.zip)') : null,
      h('a', { class: 'button', href: `/api/jobs/${job.id}/download?what=logs` }, 'Download the logs (.zip)'),
      h('button', { type: 'button', onclick: () => rerun(job) }, 'Run again on this video…')));
   body.push(h('h3', {}, 'Steps'), h('ul', { class: 'steps' }, ...job.steps.map((st) => h('li', { class: st.status }, st.title, st.note ? h('span', { class: 'muted' }, ` (${st.note})`) : null))));
   if (s) {
      const a = s.atlas;
      body.push(h('h3', {}, 'The video, as face-api sees it'), h('p', { class: 'small' },
         `${a.imprints} imprints (clean poses), yaw ${a.yaw.map((v) => v.toFixed(0)).join('..')}°, pitch ${a.pitch.map((v) => v.toFixed(0)).join('..')}°; face scale ${a.pxPerCm.toFixed(1)} px/cm; sharpness ${Math.round(a.sharpnessMedian)}; clean detection score ${a.cleanScoreMean.toFixed(2)}; noise between neighbouring poses ${a.noiseFloor.median} (p90 ${a.noiseFloor.p90}, the identity threshold is ${s.threshold}); ${a.unrecognisedBins} pose(s) seen but never recognised clean.`),
         h('p', { class: 'muted small' }, 'Sharper, larger faces let the overlays move the identity; blurry or small faces mostly make the detector lose the face. Escape rates of videos with different numbers of imprints are not on the same scale: compare videos with "Compare selected".'));
      body.push(h('h3', {}, 'Results per cell'), h('div', { class: 'legend' }, h('span', { style: '--c:var(--lost)' }, 'detector lost the face'), h('span', { style: '--c:var(--descr)' }, 'face found, identity moved ≥ 0.6')),
         h('div', { class: 'tablewrap' }, h('table', {},
            h('thead', {}, h('tr', {}, ...['recipe', 'trials', 'escape (mean)', '', '= lost', '+ identity', 'identity | detected', 'face covered', 'best'].map((t) => h('th', {}, t)))),
            h('tbody', {}, ...s.recipes.map((r) => h('tr', {},
               h('td', {}, r.recipeId), h('td', {}, `${r.complete}/${r.trials}`), h('td', {}, pct(r.escape, 1)), h('td', {}, splitBar({ lostRate: r.lostRate, descriptorEscape: r.descriptorEscape })),
               h('td', {}, pct(r.lostRate, 1)), h('td', {}, pct(r.descriptorEscape, 1)), h('td', {}, pct(r.descriptorEscapeDetected, 1)), h('td', {}, pct(r.coverage, 1)),
               h('td', {}, r.best ? `seed ${r.best.seed}: ${pct(r.best.scores.escapeRate)}` : '—')))))));
      const top = s.materialised.slice(0, 24);
      if (top.length) {
         body.push(h('h3', {}, `Ghostyles (${s.materialised.length} materialised, best first)`), h('div', { class: 'cards' }, ...top.map((m) => h('div', { class: 'card' },
            h('a', { href: fileUrl(job, `${job.atlasDirName}/${m.files.sheet}`), target: '_blank', rel: 'noopener', title: 'every pose with this overlay' }, h('img', { src: fileUrl(job, `${job.atlasDirName}/${m.files.image}`), alt: `anchor frame with Ghostyle seed ${m.seed}`, loading: 'lazy' })),
            h('div', { class: 'body' },
               h('b', {}, `escape ${pct(m.scores.escapeRate)}`), h('span', {}, splitBar(m.scores), `${pct(m.scores.lostRate)} lost + ${pct(m.scores.descriptorEscape)} identity`),
               h('span', { class: 'muted' }, `${m.recipeId} · seed ${m.seed}`), h('span', { class: 'muted' }, `face covered ${pct(m.coverage)} · worst ${m.scores.allLost ? 'all lost' : m.scores.worstCase}`),
               h('div', { class: 'links' },
                  h('a', { href: fileUrl(job, `${job.atlasDirName}/${m.files.ghostyle}`, true) }, 'Ghostyle .js'),
                  h('a', { href: fileUrl(job, `${job.atlasDirName}/${m.files.sheet}`), target: '_blank', rel: 'noopener' }, 'all poses'),
                  h('a', { href: fileUrl(job, `${job.atlasDirName}/${m.files.csv}`, true) }, 'CSV')))))));
      }
   }
   body.push(h('details', { class: 'commands' }, h('summary', {}, 'Commands run by this job'), h('pre', {}, job.commands.join('\n'))));
   $('detailBody').replaceChildren(...body);
}

async function refreshDetail(force) {
   const id = state.detailId;
   if (!id) return;
   try {
      const job = await api('GET', `/api/jobs/${id}`);
      if (state.detailId !== id) return;
      const sig = JSON.stringify([job.status, job.stepIndex, job.current, job.summary && job.summary.generatedAt, job.etaSeconds > 0 ? Math.round(job.etaSeconds / 30) : 0]);
      if (force || sig !== state.detailSig) { state.detailSig = sig; renderDetail(job); }
      const lg = await api('GET', `/api/jobs/${id}/log?${state.logFrom ? `from=${state.logFrom}` : 'tail=60000'}`);
      if (state.detailId !== id) return;
      if (lg.text) {
         const pre = $('log');
         if (!state.logFrom && lg.from > 0) pre.textContent = '… (start of the log cut; the full log is in the logs download)\n';
         pre.append(lg.text);
         if ($('follow').checked) pre.scrollTop = pre.scrollHeight;
      }
      state.logFrom = lg.to;
   } catch (e) {
      if (e.message === 'no such job') closeDetail();
   }
}

function rerun(job) {
   state.fromJob = job; state.upload = null;
   state.plan = JSON.parse(JSON.stringify(job.plan));
   state.preset = Object.keys(state.info.presets).includes(job.plan.preset) ? job.plan.preset : 'custom';
   $('label').value = `${job.label} (again)`;
   const p = job.video.probe || {};
   $('dropDone').replaceChildren(h('b', {}, job.video.original), ' from job ', job.label, ` · ${p.width}×${p.height}`, p.duration ? ` · ${p.duration.toFixed(1)} s` : '',
      ' ', h('button', { type: 'button', class: 'ghost', onclick: (e) => { e.stopPropagation(); state.fromJob = null; $('fromJobNote').hidden = true; renderUploaded(); } }, 'Use another video'));
   showDrop('done');
   $('fromJobNote').hidden = false;
   $('fromJobNote').textContent = 'Same video as that job. If the atlas settings stay the same, its atlas is reused (no rebuild), so the results of both jobs are measured against the same clean poses.';
   renderPresets(); renderSettings(); schedulePreview();
   $('settings').open = true;
   $('new').scrollIntoView({ behavior: 'smooth' });
}

// ---- boot ----------------------------------------------------------------------

async function boot() {
   state.info = await api('GET', '/api/info');
   renderInfo();
   state.preset = state.info.settings && state.info.settings.plan ? 'mine' : 'quick';
   state.plan = JSON.parse(JSON.stringify(state.preset === 'mine' ? state.info.settings.plan : state.info.presets.quick.plan));
   setupUpload(); setupSettings();
   renderPresets(); renderSettings(); preview();
   $('start').addEventListener('click', start);
   $('compareBtn').addEventListener('click', compare);
   $('compareClose').addEventListener('click', () => { $('compareOut').hidden = true; });
   $('detailClose').addEventListener('click', closeDetail);
   await refreshJobs();
   const running = state.jobs.find((j) => j.status === 'running');
   if (running) openDetail(running.id);
   setInterval(refreshJobs, 3000);
   setInterval(() => refreshDetail(false), 3000);
   setInterval(async () => { try { state.info.warnings = (await api('GET', '/api/info')).warnings; renderInfo(); } catch { /* ignore */ } }, 60000);
}

boot().catch((e) => { document.body.prepend(h('div', { class: 'errors wrap' }, `The page could not reach the service: ${e.message}`)); });
})();
