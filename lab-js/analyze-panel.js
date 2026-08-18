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
import { t } from './i18n.js';

const EXPLAINERS = {
   age: 'analysis_explainer_age',
   gender: 'analysis_explainer_gender',
   emotion: 'analysis_explainer_emotion',
   confidence: 'analysis_explainer_confidence',
   distanceClosest: 'analysis_explainer_distance',
   threshold: 'analysis_explainer_threshold',
   embedder: 'analysis_explainer_embedder',
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
      ? `<img class="analyze-compare-image" src="${visual.baseDataUrl}" alt="${t('baseline_thumbnail_alt', { id: visual.closestId })}" />`
      : `<div class="history-placeholder analyze-compare-placeholder">${t('no_preview')}</div>`;

   return `
      <section class="analyze-section">
         <h3>${t('visual_comparison_title')}</h3>
         <div class="analyze-compare-row" aria-label="${t('visual_comparison_label')}">
            <div class="analyze-compare-col">
               ${leftPreview}
               <div class="analyze-compare-label">ID ${visual.closestId}</div>
            </div>
            <div class="analyze-compare-arrow" aria-hidden="true">↔</div>
            <div class="analyze-compare-col">
               <img class="analyze-compare-image" src="${visual.currentDataUrl}" alt="${t('current_thumbnail_alt')}" />
               <div class="analyze-compare-label">${t('current_you_label')}</div>
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
            <h3>${t('face_detected_title')}</h3>
            <p class="analyze-empty">${t('no_face_snapshot')}</p>
         </section>
         <section class="analyze-section">
            <h3>${t('recognition_title')}</h3>
            <p>${analysis.matchHeadline || t('no_recognition_data')}</p>
         </section>
      `;
      return;
   }

   const closestLine = typeof analysis.closestId === 'number'
      ? `ID ${analysis.closestId}`
      : t('no_id_found');
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
         <h3>${t('face_detected_title')}</h3>
         <div class="analyze-metric"><strong>${t('estimated_age_label')}</strong> ${Math.round(analysis.faceResult.age || 0)}</div>
         <p>${t(EXPLAINERS.age)}</p>
         <div class="analyze-metric"><strong>${t('predicted_gender_label')}</strong> ${analysis.faceResult.gender || '-'}</div>
         <p>${t(EXPLAINERS.gender)}</p>
         <div class="analyze-metric"><strong>${t('dominant_emotion_label')}</strong> ${analysis.dominantEmotion || '-'}</div>
         <p>${t(EXPLAINERS.emotion)}</p>
         <div class="analyze-metric"><strong>${t('detection_confidence_label')}</strong> ${pct(analysis.faceResult.detection?.score)}</div>
         <p>${t(EXPLAINERS.confidence)}</p>
      </section>

      <section class="analyze-section">
         <h3>${t('recognition_title')}</h3>
         <div class="analyze-metric"><strong>${t('state_label')}</strong> ${analysis.matchHeadline || '-'}</div>
         <div class="analyze-metric"><strong>${t('match_with_id_label')}</strong> ${closestLine}</div>
         <div class="analyze-metric"><strong>${t('diversity_from_baseline_label')}</strong> ${diversityLine}</div>
         <p>${t(EXPLAINERS.distanceClosest)}</p>
         <div class="analyze-metric"><strong>${t('recognition_threshold_label')}</strong> ${analysis.thresholdDiversity}%</div>
         <p>${t(EXPLAINERS.threshold)}</p>
         <div class="analyze-metric"><strong>${t('interpretation_label')}</strong> ${t('analysis_interpretation', { diversity: diversityLine, id: typeof analysis.closestId === 'number' ? `ID ${analysis.closestId}` : '', threshold: analysis.thresholdDiversity })}</div>
         <div class="analyze-metric"><strong>Embedder 3D:</strong> similarity con ${section3dId != null ? `ID ${section3dId}` : 'closest match'}: ${Number.isFinite(section3dValue) ? section3dValue.toFixed(3) : '-'}</div>
         <p>${t(EXPLAINERS.embedder)}</p>
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
         setLog(t('report_copied_log'));
      } catch {
         setLog(t('report_copy_failed_log'));
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
      setLog(t('analyze_error_log', { message: err.message || String(err) }));
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
         t('report_title_markdown'),
         '',
         t('report_face_detected_line', { value: t('no_value') }),
         '',
         t('report_recognition_2d_heading'),
         '',
         t('no_data_available'),
      ].join('\n');
   }

   const lines = [];
   lines.push(t('report_title_markdown'));
   lines.push('');
   lines.push(t('report_face_detected_line', { value: data.faceResult ? t('yes_value') : t('no_value') }));

   if (data.faceResult) {
      lines.push('');
      lines.push(t('report_estimated_age_line', { value: Math.round(data.faceResult.age || 0) }));
      lines.push('');
      lines.push(t('report_predicted_gender_line', { value: data.faceResult.gender || '-' }));
      lines.push('');
      lines.push(t('report_dominant_emotion_line', { value: data.dominantEmotion || '-' }));
      lines.push('');
      lines.push(t('report_detection_confidence_line', { value: pct(data.faceResult.detection?.score) }));
   }

   lines.push('');
   lines.push(t('report_recognition_2d_heading'));
   lines.push('');

   if (!data.faceResult) {
      lines.push(t('no_face_snapshot'));
   } else if (!data.dbHasFaces) {
      lines.push(t('no_baseline_face_database'));
   } else {
      lines.push(t('report_match_with_id_line', { value: data.closestId ?? '-' }));
      lines.push('');
      lines.push(t('report_diversity_line', { value: data.closestDiversity != null ? `${data.closestDiversity}%` : '-' }));
      lines.push('');
      lines.push(t('report_recognition_threshold_line', { value: `${data.thresholdDiversity}%` }));
      lines.push('');
      lines.push(t('report_status_line', { value: data.matchHeadline || '-' }));
   }

   lines.push('');
   lines.push(t('report_embedder_3d_heading'));
   lines.push('');
   if (Number.isFinite(data.embedderClosestSimilarity) && typeof data.closestId === 'number') {
      lines.push(t('report_cosine_similarity_line', { id: data.closestId, value: data.embedderClosestSimilarity.toFixed(3) }));
   } else if (Number.isFinite(data.embedderBestSimilarity)) {
      lines.push(t('report_cosine_similarity_line', { id: data.embedderBestId, value: data.embedderBestSimilarity.toFixed(3) }));
   } else {
      lines.push(t('no_embedding_data_available'));
   }

   return lines.join('\n');
}
