import { backendUrl } from '../lab-js/backend-url.js';

const $ = (id) => document.getElementById(id);
const status = $('research-status');
const endpoint = '/api/fuzzer-results';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const formatNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const formatPercent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
const formatDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function node(tag, text) {
   const element = document.createElement(tag);
   if (text !== undefined) element.textContent = text;
   return element;
}

function link(text, href) {
   const element = node('a', text);
   element.href = href;
   return element;
}

function submissionUrl(id) {
   return `/research-submission.html?id=${encodeURIComponent(id)}`;
}

const number = (value) => Number.isFinite(value) ? formatNumber.format(value) : null;
const percent = (value) => Number.isFinite(value) ? formatPercent.format(value) : null;
const date = (value) => Number.isFinite(Date.parse(value)) ? formatDate.format(new Date(value)) : 'Date unavailable';
const yesNo = (value) => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : null;

function facts(list, entries, { omitMissing = false } = {}) {
   for (const [label, value] of entries) {
      if (omitMissing && value == null) continue;
      const pair = node('div');
      pair.append(node('dt', label), node('dd', value ?? '—'));
      list.append(pair);
   }
}

async function readApi(path) {
   const candidates = new Set([new URL(path, location.origin).href, backendUrl(path)]);
   for (const url of candidates) {
      let response;
      let data;
      try {
         response = await fetch(url, { cache: 'no-store' });
         if (!response.headers.get('content-type')?.includes('application/json')) continue;
         data = await response.json();
      } catch { continue; }
      if (response.ok && data.ok) return { data, url };
      throw new Error(response.status === 404 ? 'Public submission not found.' : (data.message || 'Research data is unavailable.'));
   }
   throw new Error('Could not load the public research data. Try again later.');
}

function summaryRow(row) {
   const item = node('li');
   item.append(link(row.submissionId, submissionUrl(row.submissionId)));
   const counts = [date(row.receivedAt), row.preset, `${row.recipeCount} recipes`, `${number(row.attempts.total) ?? '—'} trials`];
   if (row.researchCount) counts.push(`${row.researchCount} research links`);
   if (row.annotationCount) counts.push(`${row.annotationCount} annotations`);
   item.append(node('p', counts.filter(Boolean).join(' · ')));
   return item;
}

async function overview() {
   const more = $('research-more');
   let before;
   async function load() {
      more.disabled = true;
      status.textContent = 'Loading submissions…';
      try {
         const query = before ? `?before=${encodeURIComponent(before)}` : '';
         const { data } = await readApi(endpoint + query);
         const { total } = data;
         const totals = $('research-totals');
         totals.replaceChildren();
         facts(totals, [
            ['Submissions', number(total.submissions)], ['Recipe runs', number(total.recipes)],
            ['Trials', number(total.trials)], ['Completed trials', number(total.complete)],
            ['Pruned trials', number(total.pruned)], ['Submissions linked to research', number(total.linkedSubmissions)],
         ]);
         $('research-submissions').append(...data.items.map(summaryRow));
         before = data.nextBefore;
         more.hidden = !before;
         status.textContent = total.submissions ? '' : 'No public submissions yet.';
      } catch (error) { status.textContent = error.message; }
      finally { more.disabled = false; }
   }
   more.addEventListener('click', load);
   await load();
}

function annotation(entry) {
   const item = node('li');
   if (entry.research) {
      const { title, url } = entry.research;
      const parsed = URL.canParse(url) ? new URL(url) : null;
      if (parsed && ['https:', 'http:'].includes(parsed.protocol)) item.append(link(title, parsed.href));
      else item.append(node('strong', title));
   }
   if (entry.note) item.append(node('p', entry.note));
   item.append(node('small', date(entry.createdAt)));
   return item;
}

function resultFacts(scores, coverage) {
   return [
      ['Overall effect rate', percent(scores.escapeRate)],
      ['Detector loss', percent(scores.lostRate)],
      ['Descriptor beyond threshold', percent(scores.descriptorEscape)],
      ['Beyond threshold among detections', percent(scores.descriptorEscapeDetected)],
      ['Face coverage', percent(coverage)],
      ['Worst observed margin', number(scores.worstCase)],
      ['Median margin', number(scores.medianMargin)],
      ['All detections lost', yesNo(scores.allLost)],
   ];
}

function recipeCard(recipe, index) {
   const article = node('article');
   article.append(node('h3', recipe.recipeId ? `Recipe ${index + 1} · ${recipe.recipeId}` : `Recipe ${index + 1}`));
   const scores = node('dl');
   scores.className = 'research-facts';
   facts(scores, [
      ['Attempted', number(recipe.trials)], ['Completed', number(recipe.complete)], ['Pruned', number(recipe.pruned)],
      ...resultFacts(recipe.aggregate, recipe.coverage),
      ['Best seed', number(recipe.best?.seed)], ['Best seed effect rate', percent(recipe.best?.scores.escapeRate)],
   ]);
   const details = node('details');
   const parameters = node('dl');
   parameters.className = 'research-facts';
   const { definition: d, plan } = recipe;
   facts(parameters, [
      ['Shape', d.shape], ['Stroke count', number(d.count)], ['Length (cm)', number(d.lengthCm)],
      ['Width (cm)', number(d.widthCm)], ['Opacity', percent(d.opacity)],
      ['Face zones', d.zones.join(', ') || 'All zones'], ['Stroke overlap', yesNo(d.overlap)],
      ['Paired seeds', yesNo(d.pairedSeeds)], ['Forced colour', d.color],
      ['Palette', d.palette.pool], ['Palette size', number(d.palette.size)], ['Contrast method', d.palette.contrast],
      ['Contrast quantile', number(d.palette.quantile)], ['Minimum colour distance', number(d.palette.minPairDeltaE)],
      ['Starting seed', number(plan.seed)], ['Planned trials', number(plan.plannedTrials)],
      ['Pruning enabled', yesNo(plan.prune)], ['Pruning subset size', number(plan.pruneSubset)],
      ['Pruning margin', number(plan.pruneMargin)], ['Seconds per trial', number(recipe.secondsPerTrial)],
   ], { omitMissing: true });
   details.append(node('summary', 'Recipe parameters and trial settings'), parameters);
   article.append(scores, details);
   return article;
}

function renderSubmission(data, apiUrl) {
   const { result, annotations, researchCount } = data;
   const { atlas, method, runtime } = result;
   $('research-id').textContent = data.submissionId;
   $('research-use').textContent = researchCount
      ? `Linked to ${researchCount} research ${researchCount === 1 ? 'entry' : 'entries'}.`
      : 'No research use has been recorded yet.';
   $('research-annotations').append(...annotations.map(annotation));
   facts($('research-method'), [
      ['Received', date(data.receivedAt)], ['Preset', result.preset], ['Fuzzer version', result.app.version],
      ['Runtime', [runtime.backend, runtime.platform, runtime.arch, runtime.node].filter(Boolean).join(' · ') || null],
      ['Run duration (s)', number(result.durationSeconds)], ['Geometry version', number(method.geometryVersion)],
      ['Face-api match threshold', number(method.matchThreshold)], ['Trial attempts', number(result.attempts.total)],
      ['Completed', number(result.attempts.complete)], ['Pruned', number(result.attempts.pruned)],
   ]);
   const range = (values) => values.length && values.every(Number.isFinite) ? values.map(number).join(' to ') : null;
   facts($('research-poses'), [
      ['Clean poses', number(atlas.imprints)], ['Yaw (degrees)', range(atlas.yaw)], ['Pitch (degrees)', range(atlas.pitch)],
      ['Unrecognised pose bins', number(atlas.unrecognisedBins)], ['Median sharpness', number(atlas.sharpnessMedian)],
      ['Mean clean detection score', number(atlas.cleanScoreMean)], ['Noise median', number(atlas.noiseFloor?.median)],
      ['Noise p90', number(atlas.noiseFloor?.p90)], ['Frames sampled per second', number(method.atlas.sampleFps)],
      ['Pose bin size (degrees)', number(method.atlas.bin)], ['Maximum poses', number(method.atlas.maxImprints)],
      ['Candidates per bin', number(method.atlas.candidates)], ['Maximum gap', number(method.atlas.maxGap)],
      ['Anchor window (s)', method.anchorWindow],
   ]);
   $('research-recipes').append(...result.recipes.map(recipeCard));
   if (result.selectedGhostyles.length) {
      $('research-selected').hidden = false;
      for (const trial of result.selectedGhostyles) {
         const item = node('li');
         const scores = node('dl');
         scores.className = 'research-facts';
         facts(scores, [...resultFacts(trial.scores, trial.coverage), ['Palette', trial.palette.join(', ') || null]]);
         item.append(node('strong', `Seed ${number(trial.seed) ?? '—'}${trial.recipeId ? ` · ${trial.recipeId}` : ''}`), scores);
         $('research-trials').append(item);
      }
   }
   $('research-json').href = apiUrl;
   $('research-detail').hidden = false;
}

async function detail() {
   const id = new URLSearchParams(location.search).get('id')?.trim();
   if (!id || !uuid.test(id)) {
      status.textContent = 'Open the research index to enter a valid submission ID.';
      return;
   }
   status.textContent = 'Loading submission…';
   try {
      const { data, url } = await readApi(`${endpoint}/${encodeURIComponent(id)}`);
      renderSubmission(data, url);
      status.textContent = '';
   } catch (error) { status.textContent = error.message; }
}

if (document.querySelector('[data-view="overview"]')) void overview();
else void detail();
