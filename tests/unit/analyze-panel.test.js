import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/utils.js', () => ({
  setLog: vi.fn(),
}));

vi.mock('../../scripts/camera.js', () => ({
  stopEffectLoop: vi.fn(),
  startEffectLoop: vi.fn(),
}));

vi.mock('../../scripts/engine.js', () => ({
  runEffectPass: vi.fn(),
  hasActivePlugin: vi.fn(() => false),
}));

vi.mock('../../scripts/engine-3d.js', () => ({
  getFaceEmbedding: vi.fn(),
  cosineSimilarity: vi.fn((a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return 0;
    return b[0] === 1 ? 0.91 : 0.34;
  }),
}));

vi.mock('../../scripts/face-thumbnails.js', () => ({
  captureThumbnail: vi.fn(),
  getThumbnail: vi.fn(),
}));

vi.mock('../../scripts/config.js', () => ({
  ANALYZE_PANEL_MAX_WIDTH_DESKTOP: 960,
  DETECTOR_OPTIONS: {},
}));

vi.mock('../../scripts/landmark-analysis.js', () => ({
  seekFaceInDb: vi.fn(),
  decideMatchState: vi.fn(() => ({ headline: 'Riconoscimento stabile' })),
  distanceToDiversity: vi.fn((distance) => Math.round(distance * 100)),
}));

import { setLog } from '../../scripts/utils.js';
import { stopEffectLoop, startEffectLoop } from '../../scripts/camera.js';
import { runEffectPass, hasActivePlugin } from '../../scripts/engine.js';
import { getFaceEmbedding, cosineSimilarity } from '../../scripts/engine-3d.js';
import { captureThumbnail, getThumbnail } from '../../scripts/face-thumbnails.js';
import { seekFaceInDb, decideMatchState, distanceToDiversity } from '../../scripts/landmark-analysis.js';
import { state } from '../../scripts/state.js';
import { generateReportText, openAnalyzePanel, closeAnalyzePanel } from '../../scripts/analyze-panel.js';

function makeFaceResult() {
  return {
    age: 34.2,
    gender: 'female',
    expressions: {
      neutral: 0.81,
      happy: 0.1,
      angry: 0.01,
    },
    detection: {
      score: 0.87,
      box: { x: 10, y: 20, width: 120, height: 140 },
    },
    landmarks: { positions: [] },
  };
}

function ensureAnalyzeModalDom() {
  const existing = document.getElementById('analyzeModal');
  if (existing) {
    existing.hidden = true;
    existing.classList.remove('open');
    const info = document.getElementById('analyzeInfo');
    if (info) info.innerHTML = '';
    const canvas = document.getElementById('analyzeCanvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    return;
  }

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div id="analyzeModal" class="analyze-modal" hidden>
      <div id="analyzeBackdrop" class="analyze-backdrop">
        <div id="analyzePanel" class="analyze-panel">
          <div class="analyze-visual-wrap">
            <canvas id="analyzeCanvas" class="analyze-canvas"></canvas>
          </div>
          <div id="analyzeInfo" class="analyze-info"></div>
          <div class="analyze-actions">
            <button id="analyzeCopyBtn" type="button">Copia report</button>
            <button id="analyzeCloseBtn" type="button">Chiudi</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap.firstElementChild);
}

function mockFaceApi(faceResult, shouldThrow = false) {
  global.faceapi = {
    detectSingleFace: vi.fn(() => ({
      withFaceLandmarks: () => ({
        withFaceDescriptor: () => ({
          withAgeAndGender: () => ({
            withFaceExpressions: () => {
              if (shouldThrow) throw new Error('snapshot failure');
              return Promise.resolve(faceResult);
            }
          })
        })
      })
    }))
  };
}

describe('analyze-panel', () => {
  let originalRequestAnimationFrame;
  let originalClipboard;

  beforeEach(() => {
    vi.clearAllMocks();
    ensureAnalyzeModalDom();
    state.db = { nextId: 0, faces: [] };
    state.db3d = { nextId: 0, faces: [] };
    hasActivePlugin.mockReturnValue(false);
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalClipboard = navigator.clipboard;
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: vi.fn((cb) => {
        cb();
        return 1;
      }),
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: {
        writeText: vi.fn(() => Promise.resolve()),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: originalRequestAnimationFrame,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: originalClipboard,
    });
    closeAnalyzePanel();
    vi.useRealTimers();
  });

  it('opens the panel, renders the detected-face report, and closes cleanly', async () => {
    vi.useFakeTimers();
    const faceResult = makeFaceResult();
    mockFaceApi(faceResult);
    getFaceEmbedding.mockResolvedValue([0.2, 0.8]);
    seekFaceInDb.mockReturnValue({ liveMinId: 7, liveMinDist: 0.23 });
    decideMatchState.mockReturnValue({ headline: 'Volto riconosciuto' });
    captureThumbnail.mockResolvedValue('data:image/png;base64,current');
    getThumbnail.mockReturnValue('data:image/png;base64,base');
    state.db.faces = [{ id: 7 }];
    state.db3d.faces = [
      { id: 7, descriptor3d: [1, 0] },
      { id: 8, descriptor3d: [0, 1] },
    ];

    await openAnalyzePanel();

    const modal = document.getElementById('analyzeModal');
    const info = document.getElementById('analyzeInfo');
    const copyBtn = document.getElementById('analyzeCopyBtn');

    expect(stopEffectLoop).toHaveBeenCalledTimes(1);
    expect(modal.hidden).toBe(false);
    expect(document.getElementById('analyzeBackdrop').style.backgroundImage).toContain('url(');
    expect(info.innerHTML).toContain('Volto rilevato');
    expect(info.innerHTML).toContain('Eta stimata:</strong> 34');
    expect(info.innerHTML).toContain('Match con ID:</strong> ID 7');
    expect(info.innerHTML).toContain('Confronto visivo');
    expect(setLog).not.toHaveBeenCalledWith(expect.stringContaining('[ERRORE analyze]'));

    await copyBtn.onclick();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Volto rilevato: si'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Match con ID: 7'));

    closeAnalyzePanel();
    expect(startEffectLoop).toHaveBeenCalled();
    expect(runEffectPass).toHaveBeenCalled();
    expect(modal.classList.contains('open')).toBe(false);

    vi.advanceTimersByTime(150);
    expect(modal.hidden).toBe(true);
  });

  it('renders the no-face state and falls back to a minimal report when detection fails', async () => {
    mockFaceApi(null, true);
    getFaceEmbedding.mockResolvedValue(null);
    hasActivePlugin.mockReturnValue(false);
    state.db.faces = [{ id: 1 }];

    await openAnalyzePanel();

    const info = document.getElementById('analyzeInfo');
    const report = generateReportText();

    expect(setLog).toHaveBeenCalledWith(expect.stringContaining('[ERRORE analyze] snapshot failure'));
    expect(info.innerHTML).toContain('Nessun volto rilevato nello snapshot.');
    expect(info.innerHTML).toContain('Nessun dato di riconoscimento disponibile.');
    expect(report).toContain('Volto rilevato: no');
    expect(report).toContain('Nessun dato embedding disponibile.');
    expect(captureThumbnail).not.toHaveBeenCalled();
    expect(seekFaceInDb).not.toHaveBeenCalled();
    expect(cosineSimilarity).not.toHaveBeenCalled();
    expect(distanceToDiversity).toHaveBeenCalledWith(state.MATCH_THRESHOLD);
  });
});
