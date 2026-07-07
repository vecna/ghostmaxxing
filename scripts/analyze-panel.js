/** @module analyze-panel */
import { els } from './dom.js';
import { state } from './state.js';
import { setLog } from './utils.js';
import { stopEffectLoop, startEffectLoop } from './camera.js';
import { runEffectPass, hasActivePlugin } from './engine.js';
import { getFaceEmbedding, cosineSimilarity } from './engine-3d.js';
import { captureThumbnail, getThumbnail } from './face-thumbnails.js';
import { ANALYZE_PANEL_MAX_WIDTH_DESKTOP, DETECTOR_OPTIONS } from './config.js';
import {
   seekFaceInDb,
   decideMatchState,
   distanceToDiversity,
} from './landmark-analysis.js';

const EXPLAINERS = {
   age: 'Eta stimata dal modello - e solo una statistica, puo sbagliare di 5-10 anni.',
   gender: 'Genere predetto dal modello - addestrato su dataset con bias noti.',
   emotion: 'Emozione dominante tra quelle che il modello distingue: happy, sad, angry, fearful, disgusted, surprised, neutral.',
   confidence: 'Quanto il rilevatore e sicuro di vedere un volto nello snapshot. Sotto 50% spesso non viene rilevato nulla.',
   distanceClosest: 'Quanto il tuo volto attuale e diverso dal volto base salvato con questo ID. Piu la percentuale e alta, meno il sistema riesce a riconoscerti.',
   threshold: 'Sopra questa percentuale di diversita il sistema non ti riconosce piu. Sotto, si.',
   embedder: 'Il motore 3D usa una scala diversa (cosine similarity, 0-1, piu alto = piu simile).',
};

let modalEls = null;
let activeSnapshot = null;
let latestReportData = null;
let isOpen = false;
let escHandler = null;

function ensureModalEls() {
   if (modalEls) return modalEls;
   modalEls = {
      root: document.getElementById('analyzeModal'),
      backdrop: document.getElementById('analyzeBackdrop'),
      panel: document.getElementById('analyzePanel'),
      canvas: document.getElementById('analyzeCanvas'),
      info: document.getElementById('analyzeInfo'),
      copyBtn: document.getElementById('analyzeCopyBtn'),
      closeBtn: document.getElementById('analyzeCloseBtn'),
   };
   return modalEls;
}

function getDominantEmotion(expressions) {
   if (!expressions) return null;
   let key = null;
   let best = -Infinity;
   for (const [k, v] of Object.entries(expressions)) {
      if (v > best) {
         key = k;
         best = v;
      }
   }
   return key;
}

function pct(score) {
   if (!Number.isFinite(score)) return '-';
   return `${Math.round(score * 100)}%`;
}

function clearCanvas() {
   const ui = ensureModalEls();
   if (!ui.canvas) return;
   const ctx = ui.canvas.getContext('2d');
   ctx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
}

function drawSnapshotToPanelCanvas(snapshotCanvas) {
   const ui = ensureModalEls();
   if (!ui.canvas) return;
   ui.canvas.width = snapshotCanvas.width;
   ui.canvas.height = snapshotCanvas.height;
   const ctx = ui.canvas.getContext('2d');
   ctx.drawImage(snapshotCanvas, 0, 0, ui.canvas.width, ui.canvas.height);
}

function computeEmbedderStats(embedding, closestId) {
   if (!embedding || !state.db3d || !Array.isArray(state.db3d.faces) || state.db3d.faces.length === 0) {
      return { bestId: null, bestSimilarity: null, closestIdSimilarity: null };
   }

   let bestId = null;
   let bestSimilarity = -Infinity;
   for (const rec of state.db3d.faces) {
      const sim = cosineSimilarity(embedding, rec.descriptor3d);
      if (sim > bestSimilarity) {
         bestSimilarity = sim;
         bestId = rec.id;
      }
   }

   let closestIdSimilarity = null;
   if (typeof closestId === 'number') {
      const sameId = state.db3d.faces.find((f) => f.id === closestId);
      if (sameId) closestIdSimilarity = cosineSimilarity(embedding, sameId.descriptor3d);
   }

   return {
      bestId,
      bestSimilarity: Number.isFinite(bestSimilarity) ? bestSimilarity : null,
      closestIdSimilarity,
   };
}

function snapshotFromVideo() {
   const canvas = document.createElement('canvas');
   canvas.width = els.video.videoWidth || 1280;
   canvas.height = els.video.videoHeight || 720;
   const ctx = canvas.getContext('2d');
   ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);
   return canvas;
}

function panelStateFromAnalysis(analysis) {
   const closestDiversity = Number.isFinite(analysis.closestDistance)
      ? distanceToDiversity(analysis.closestDistance)
      : null;
   const thresholdDiversity = distanceToDiversity(state.MATCH_THRESHOLD);

   return {
      ...analysis,
      closestDiversity,
      thresholdDiversity,
   };
}

function buildVisualComparisonSection(analysis) {
   const visual = analysis.visualComparison;
   if (!visual || !visual.currentDataUrl || typeof visual.closestId !== 'number') {
      return '';
   }

   const leftPreview = visual.baseDataUrl
      ? `<img class="analyze-compare-image" src="${visual.baseDataUrl}" alt="Thumbnail volto base ID ${visual.closestId}" />`
      : '<div class="history-placeholder analyze-compare-placeholder">no preview</div>';

   return `
      <section class="analyze-section">
         <h3>Confronto visivo</h3>
         <div class="analyze-compare-row" aria-label="Confronto visivo base vs attuale">
            <div class="analyze-compare-col">
               ${leftPreview}
               <div class="analyze-compare-label">ID ${visual.closestId}</div>
            </div>
            <div class="analyze-compare-arrow" aria-hidden="true">↔</div>
            <div class="analyze-compare-col">
               <img class="analyze-compare-image" src="${visual.currentDataUrl}" alt="Thumbnail volto attuale" />
               <div class="analyze-compare-label">Tu ora</div>
            </div>
         </div>
      </section>
   `;
}

function renderInfo(analysis) {
   const ui = ensureModalEls();
   if (!ui.info) return;

   const hasFace = !!analysis.faceResult;

   if (!hasFace) {
      ui.info.innerHTML = `
         <section class="analyze-section">
            <h3>Volto rilevato</h3>
            <p class="analyze-empty">Nessun volto rilevato nello snapshot.</p>
         </section>
         <section class="analyze-section">
            <h3>Riconoscimento</h3>
            <p>${analysis.matchHeadline || 'Nessun dato di riconoscimento disponibile.'}</p>
         </section>
      `;
      return;
   }

   const closestLine = typeof analysis.closestId === 'number'
      ? `ID ${analysis.closestId}`
      : 'Nessun ID trovato';
   const diversityLine = analysis.closestDiversity != null
      ? `${analysis.closestDiversity}%`
      : '-';

   const section3dId = typeof analysis.closestId === 'number' ? analysis.closestId : analysis.embedderBestId;
   const section3dValue = Number.isFinite(analysis.embedderClosestSimilarity)
      ? analysis.embedderClosestSimilarity
      : analysis.embedderBestSimilarity;

   const visualComparisonSection = buildVisualComparisonSection(analysis);

   ui.info.innerHTML = `
      <section class="analyze-section">
         <h3>Volto rilevato</h3>
         <div class="analyze-metric"><strong>Eta stimata:</strong> ${Math.round(analysis.faceResult.age || 0)}</div>
         <p>${EXPLAINERS.age}</p>
         <div class="analyze-metric"><strong>Genere predetto:</strong> ${analysis.faceResult.gender || '-'}</div>
         <p>${EXPLAINERS.gender}</p>
         <div class="analyze-metric"><strong>Emozione dominante:</strong> ${analysis.dominantEmotion || '-'}</div>
         <p>${EXPLAINERS.emotion}</p>
         <div class="analyze-metric"><strong>Confidence detection:</strong> ${pct(analysis.faceResult.detection?.score)}</div>
         <p>${EXPLAINERS.confidence}</p>
      </section>

      <section class="analyze-section">
         <h3>Riconoscimento</h3>
         <div class="analyze-metric"><strong>Stato:</strong> ${analysis.matchHeadline || '-'}</div>
         <div class="analyze-metric"><strong>Match con ID:</strong> ${closestLine}</div>
         <div class="analyze-metric"><strong>Diversita dal volto base:</strong> ${diversityLine}</div>
         <p>${EXPLAINERS.distanceClosest}</p>
         <div class="analyze-metric"><strong>Soglia di riconoscimento:</strong> ${analysis.thresholdDiversity}%</div>
         <p>${EXPLAINERS.threshold}</p>
         <div class="analyze-metric"><strong>Interpretazione:</strong> il tuo volto attuale e ${diversityLine} diverso dal volto base ${typeof analysis.closestId === 'number' ? `ID ${analysis.closestId}` : ''}; sopra ${analysis.thresholdDiversity}% di diversita il sistema non ti riconosce.</div>
         <div class="analyze-metric"><strong>Embedder 3D:</strong> similarity con ${section3dId != null ? `ID ${section3dId}` : 'closest match'}: ${Number.isFinite(section3dValue) ? section3dValue.toFixed(3) : '-'}</div>
         <p>${EXPLAINERS.embedder}</p>
      </section>

      ${visualComparisonSection}
   `;
}

function wireModalEvents() {
   const ui = ensureModalEls();
   if (!ui.copyBtn || !ui.closeBtn || !ui.backdrop) return;

   ui.copyBtn.onclick = async () => {
      const text = generateReportText();
      try {
         await navigator.clipboard.writeText(text);
         setLog('Report copiato negli appunti');
      } catch {
         setLog('Impossibile copiare il report negli appunti');
      }
   };

   ui.closeBtn.onclick = () => closeAnalyzePanel();
   ui.backdrop.onclick = (ev) => {
      if (ev.target === ui.backdrop) closeAnalyzePanel();
   };
}

function showModal(snapshot) {
   const ui = ensureModalEls();
   if (!ui.root || !ui.backdrop || !ui.panel) return;

   const dataUrl = snapshot.toDataURL('image/png');
   ui.backdrop.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url('${dataUrl}')`;
   ui.panel.style.maxWidth = `${ANALYZE_PANEL_MAX_WIDTH_DESKTOP}px`;
   ui.root.hidden = false;
   requestAnimationFrame(() => ui.root.classList.add('open'));
   isOpen = true;

   escHandler = (ev) => {
      if (ev.key === 'Escape') closeAnalyzePanel();
   };
   window.addEventListener('keydown', escHandler);
}

async function detectOnSnapshot(snapshotCanvas) {
   if (!faceapi || !faceapi.detectSingleFace) return null;
   try {
      return await faceapi
         .detectSingleFace(snapshotCanvas, DETECTOR_OPTIONS)
         .withFaceLandmarks()
         .withFaceDescriptor()
         .withAgeAndGender()
         .withFaceExpressions();
   } catch (err) {
      setLog(`[ERRORE analyze] ${err.message || String(err)}`);
      return null;
   }
}

async function buildVisualComparison(faceResult, closestId) {
   if (!faceResult || typeof closestId !== 'number') return null;

   const box = faceResult?.detection?.box;
   if (!box) return null;

   let currentDataUrl = null;
   try {
      currentDataUrl = await captureThumbnail(els.video, box);
   } catch {
      currentDataUrl = null;
   }

   if (!currentDataUrl) return null;

   return {
      closestId,
      baseDataUrl: getThumbnail(closestId),
      currentDataUrl,
   };
}

async function composeAnalysisData(faceResult, embedding) {
   const dbHasFaces = !!(state.db && Array.isArray(state.db.faces) && state.db.faces.length > 0);
   const dominantEmotion = faceResult ? getDominantEmotion(faceResult.expressions) : null;

   let closestId = null;
   let closestDistance = null;
   let matchHeadline = null;
   let visualComparison = null;

   if (!faceResult) {
      if (hasActivePlugin()) {
         matchHeadline = decideMatchState({
            liveMinDist: null,
            liveMinId: null,
            obfMinDist: null,
            obfMinId: null,
            weakDetection: false,
            detectionTotallyFailed: true,
         }).headline;
      }
   } else if (dbHasFaces) {
      const nearest = seekFaceInDb(faceResult);
      closestId = nearest.liveMinId;
      closestDistance = nearest.liveMinDist;
      matchHeadline = decideMatchState({
         liveMinDist: nearest.liveMinDist,
         liveMinId: nearest.liveMinId,
         obfMinDist: null,
         obfMinId: null,
         weakDetection: false,
         detectionTotallyFailed: false,
      }).headline;

      visualComparison = await buildVisualComparison(faceResult, closestId);
   }

   const embedderStats = computeEmbedderStats(embedding, closestId);

   return panelStateFromAnalysis({
      faceResult,
      dominantEmotion,
      dbHasFaces,
      closestId,
      closestDistance,
      matchHeadline,
      visualComparison,
      embedderBestId: embedderStats.bestId,
      embedderBestSimilarity: embedderStats.bestSimilarity,
      embedderClosestSimilarity: embedderStats.closestIdSimilarity,
   });
}

export async function openAnalyzePanel() {
   const ui = ensureModalEls();
   if (!ui.root) return;

   wireModalEvents();
   stopEffectLoop();

   activeSnapshot = snapshotFromVideo();
   showModal(activeSnapshot);
   drawSnapshotToPanelCanvas(activeSnapshot);

   const [faceResult, embedding] = await Promise.all([
      detectOnSnapshot(activeSnapshot),
      getFaceEmbedding(activeSnapshot).catch(() => null),
   ]);

   latestReportData = await composeAnalysisData(faceResult, embedding);

   if (faceResult) {
      drawSnapshotToPanelCanvas(activeSnapshot);
   } else {
      clearCanvas();
      drawSnapshotToPanelCanvas(activeSnapshot);
   }

   renderInfo(latestReportData);
}

export function closeAnalyzePanel() {
   const ui = ensureModalEls();
   if (!ui.root || !isOpen) return;

   ui.root.classList.remove('open');
   window.setTimeout(() => {
      ui.root.hidden = true;
   }, 150);

   isOpen = false;
   if (escHandler) {
      window.removeEventListener('keydown', escHandler);
      escHandler = null;
   }

   startEffectLoop();
   runEffectPass();
}

export function generateReportText() {
   const data = latestReportData;
   if (!data) {
      return [
         '### Ghostmaxxing - Analisi del trucco',
         '',
         'Volto rilevato: no',
         '',
         'Riconoscimento (face-api 2D)',
         '',
         'Nessun dato disponibile.',
      ].join('\n');
   }

   const lines = [];
   lines.push('### Ghostmaxxing - Analisi del trucco');
   lines.push('');
   lines.push(`Volto rilevato: ${data.faceResult ? 'si' : 'no'}`);

   if (data.faceResult) {
      lines.push('');
      lines.push(`Eta stimata: ${Math.round(data.faceResult.age || 0)}`);
      lines.push('');
      lines.push(`Genere predetto: ${data.faceResult.gender || '-'}`);
      lines.push('');
      lines.push(`Emozione dominante: ${data.dominantEmotion || '-'}`);
      lines.push('');
      lines.push(`Confidence detection: ${pct(data.faceResult.detection?.score)}`);
   }

   lines.push('');
   lines.push('Riconoscimento (face-api 2D)');
   lines.push('');

   if (!data.faceResult) {
      lines.push('Nessun volto rilevato nello snapshot.');
   } else if (!data.dbHasFaces) {
      lines.push('Nessun volto base nel database.');
   } else {
      lines.push(`Match con ID: ${data.closestId ?? '-'}`);
      lines.push('');
      lines.push(`Diversita dal volto base: ${data.closestDiversity != null ? `${data.closestDiversity}%` : '-'}`);
      lines.push('');
      lines.push(`Soglia di riconoscimento: ${data.thresholdDiversity}%`);
      lines.push('');
      lines.push(`Stato: ${data.matchHeadline || '-'}`);
   }

   lines.push('');
   lines.push('Embedder 3D (MediaPipe)');
   lines.push('');
   if (Number.isFinite(data.embedderClosestSimilarity) && typeof data.closestId === 'number') {
      lines.push(`Cosine similarity con ID ${data.closestId}: ${data.embedderClosestSimilarity.toFixed(3)}`);
   } else if (Number.isFinite(data.embedderBestSimilarity)) {
      lines.push(`Cosine similarity con ID ${data.embedderBestId}: ${data.embedderBestSimilarity.toFixed(3)}`);
   } else {
      lines.push('Nessun dato embedding disponibile.');
   }

   return lines.join('\n');
}
