import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fmt,
  currentColor,
  extractBox,
  extractScore,
  view,
  init,
  onDetection,
  onLandmarks3d,
  onMatchStateChanged,
  setOverlayMode,
  COLORS,
  OVERLAY_MODE_STORAGE_KEY,
} from '../../lab-js/bbox-overlay.js';

function makeLandmarks478() {
  return Array.from({ length: 478 }, (_, index) => ({
    x: (index % 20) / 20,
    y: (index % 24) / 24,
    z: index / 478,
  }));
}

function makeDetection() {
  return {
    detection: {
      score: 0.91,
      box: { x: 10, y: 20, width: 100, height: 120 }
    }
  };
}

function makeDetailedDetection() {
  const leftEye = [{ x: 20, y: 30 }, { x: 24, y: 28 }, { x: 28, y: 29 }, { x: 30, y: 31 }, { x: 27, y: 34 }, { x: 22, y: 34 }];
  const rightEye = [{ x: 70, y: 30 }, { x: 74, y: 28 }, { x: 78, y: 29 }, { x: 80, y: 31 }, { x: 77, y: 34 }, { x: 72, y: 34 }];
  const nose = [{ x: 48, y: 36 }, { x: 49, y: 42 }, { x: 50, y: 48 }, { x: 47, y: 55 }, { x: 50, y: 56 }, { x: 53, y: 55 }];
  const jaw = [{ x: 14, y: 60 }, { x: 22, y: 70 }, { x: 34, y: 78 }, { x: 50, y: 82 }, { x: 66, y: 78 }, { x: 78, y: 70 }, { x: 86, y: 60 }];
  const mouth = [{ x: 36, y: 66 }, { x: 42, y: 64 }, { x: 50, y: 63 }, { x: 58, y: 64 }, { x: 64, y: 66 }, { x: 58, y: 71 }, { x: 50, y: 72 }, { x: 42, y: 71 }];

  return {
    detection: {
      score: 0.91,
      box: { x: 10, y: 20, width: 100, height: 120 }
    },
    age: 29,
    gender: 'female',
    landmarks: {
      getLeftEye: () => leftEye,
      getRightEye: () => rightEye,
      getNose: () => nose,
      getJawOutline: () => jaw,
      getMouth: () => mouth,
    }
  };
}

describe('bbox-overlay utilities', () => {
  let ctx;
  let nowSpy;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    nowSpy = vi.spyOn(performance, 'now').mockReturnValue(100000);

    ctx = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(),
      measureText: vi.fn(() => ({ width: 90 })),
      fillText: vi.fn(),
      arc: vi.fn(),
      setLineDash: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      arcTo: vi.fn(),
      textBaseline: '',
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
    };

    const overlay = document.getElementById('overlay');
    const bboxOverlay = document.getElementById('bboxOverlay');
    overlay.width = 640;
    overlay.height = 480;
    overlay.style.transform = 'scaleX(-1)';
    bboxOverlay.width = 640;
    bboxOverlay.height = 480;
    bboxOverlay.style.transform = '';
    Object.defineProperty(bboxOverlay, 'clientWidth', { value: 320, configurable: true });
    bboxOverlay.getContext = vi.fn(() => ctx);

    // Reset view state
    view.matchState = 'unknown';
    view.liveMinDist = null;
    view.obfMinDist = null;
    view.liveMinId = null;
    view.obfMinId = null;
    view.overlayMode = 'bbox';
    view.lastLandmarks3d = null;
    view.lastDetection = null;

    init();
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  describe('fmt', () => {
    it('formats finite numbers with digits', () => {
      expect(fmt(0.5847, 3)).toBe('0.585');
      expect(fmt(12, 0)).toBe('12');
    });

    it('returns default placeholder for non-finite values', () => {
      expect(fmt(null, 2)).toBe('—');
      expect(fmt(undefined, 2)).toBe('—');
      expect(fmt(Infinity, 2)).toBe('—');
      expect(fmt('not a number', 2)).toBe('—');
    });
  });

  describe('currentColor', () => {
    it('picks the correct color for the match state', () => {
      view.matchState = 'matched';
      expect(currentColor()).toBe(COLORS.matched);

      view.matchState = 'eluded';
      expect(currentColor()).toBe(COLORS.eluded);

      view.matchState = 'unknown';
      expect(currentColor()).toBe(COLORS.unknown);
    });

    it('falls back to unknown color for invalid match state', () => {
      view.matchState = 'invalid-state';
      expect(currentColor()).toBe(COLORS.unknown);
    });
  });

  describe('extractBox', () => {
    it('extracts box from standard result structure', () => {
      const result = { box: { x: 10, y: 20, width: 100, height: 100 } };
      expect(extractBox(result)).toEqual({ x: 10, y: 20, width: 100, height: 100 });
    });

    it('extracts box from landmark-bearing result structure', () => {
      const result = { detection: { box: { x: 30, y: 40, width: 150, height: 150 } } };
      expect(extractBox(result)).toEqual({ x: 30, y: 40, width: 150, height: 150 });
    });
  });

  describe('extractScore', () => {
    it('extracts score from standard result structure', () => {
      const result = { score: 0.92 };
      expect(extractScore(result)).toBe(0.92);
    });

    it('extracts score from landmark-bearing result structure', () => {
      const result = { detection: { score: 0.85 } };
      expect(extractScore(result)).toBe(0.85);
    });

    it('returns null if score is missing or invalid', () => {
      expect(extractScore({})).toBeNull();
      expect(extractScore({ score: 'high' })).toBeNull();
    });
  });

  describe('init', () => {
    it('successfully initializes when DOM elements exist', () => {
      const success = init();
      expect(success).toBe(true);
    });
  });

  describe('onMatchStateChanged', () => {
    it('updates the view state from event detail', () => {
      const event = {
        detail: {
          overall: 'partial-elusion',
          faceapi: {
            detectionState: 'eluded',
            liveMinDist: 0.35,
            liveMinId: 2
          }
        }
      };
      onMatchStateChanged(event);
      expect(view.matchState).toBe('partial-elusion');
      expect(view.liveMinDist).toBe(0.35);
      expect(view.liveMinId).toBe(2);
    });
  });

  describe('overlay modes and rendering', () => {
    it('cycles render output between bbox, mesh, entrambi and 2d and persists the mode', () => {
      const landmarks = makeLandmarks478();
      const detection = makeDetection();
      const detailedDetection = makeDetailedDetection();

      onLandmarks3d({ detail: { landmarks } });

      ctx.strokeRect.mockClear();
      ctx.arc.mockClear();
      setOverlayMode('bbox');
      onDetection({ detail: { result: detection } });
      expect(view.overlayMode).toBe('bbox');
      expect(localStorage.getItem(OVERLAY_MODE_STORAGE_KEY)).toBe('bbox');
      expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
      expect(ctx.arc).not.toHaveBeenCalled();

      ctx.strokeRect.mockClear();
      ctx.arc.mockClear();
      setOverlayMode('mesh');
      expect(view.overlayMode).toBe('mesh');
      expect(localStorage.getItem(OVERLAY_MODE_STORAGE_KEY)).toBe('mesh');
      expect(ctx.strokeRect).not.toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalledTimes(478);

      ctx.strokeRect.mockClear();
      ctx.arc.mockClear();
      setOverlayMode('entrambi');
      expect(view.overlayMode).toBe('entrambi');
      expect(localStorage.getItem(OVERLAY_MODE_STORAGE_KEY)).toBe('entrambi');
      expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
      expect(ctx.arc).toHaveBeenCalledTimes(478);

      ctx.strokeRect.mockClear();
      ctx.arc.mockClear();
      ctx.fillText.mockClear();
      setOverlayMode('2d');
      ctx.strokeRect.mockClear();
      ctx.arc.mockClear();
      ctx.fillText.mockClear();
      onDetection({ detail: { result: detailedDetection } });
      expect(view.overlayMode).toBe('2d');
      expect(localStorage.getItem(OVERLAY_MODE_STORAGE_KEY)).toBe('2d');
      expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
      expect(ctx.arc).toHaveBeenCalledTimes(4);
      expect(ctx.fillText).toHaveBeenCalledTimes(3);
    });

    it('reads the persisted overlay mode during init', () => {
      localStorage.setItem(OVERLAY_MODE_STORAGE_KEY, 'mesh');
      view.overlayMode = 'bbox';

      init();

      expect(view.overlayMode).toBe('mesh');
    });

    it('suppresses both bbox and mesh after non-auto overlay events', () => {
      const landmarks = makeLandmarks478();
      const detection = makeDetection();

      setOverlayMode('entrambi');
      nowSpy.mockReturnValue(1000);
      onMatchStateChanged({ detail: { source: 'save', overall: 'matched' } });

      ctx.clearRect.mockClear();
      ctx.strokeRect.mockClear();
      ctx.arc.mockClear();
      nowSpy.mockReturnValue(2000);
      onDetection({ detail: { result: detection } });
      onLandmarks3d({ detail: { landmarks } });

      expect(ctx.clearRect).toHaveBeenCalledTimes(2);
      expect(ctx.strokeRect).not.toHaveBeenCalled();
      expect(ctx.arc).not.toHaveBeenCalled();

      ctx.strokeRect.mockClear();
      ctx.arc.mockClear();
      nowSpy.mockReturnValue(6001);
      onLandmarks3d({ detail: { landmarks } });

      expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
      expect(ctx.arc).toHaveBeenCalledTimes(478);
    });

    it('renders mesh when landmarks arrive before face-api detection', () => {
      const landmarks = makeLandmarks478();

      setOverlayMode('mesh');
      onMatchStateChanged({ detail: { overall: 'partial-elusion', source: 'auto' } });
      ctx.strokeRect.mockClear();
      ctx.arc.mockClear();
      onLandmarks3d({ detail: { landmarks } });

      expect(ctx.strokeRect).not.toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalledTimes(478);
      expect(ctx.fillStyle).toBe(COLORS['partial-elusion']);
    });

    it('reuses the cached detection when landmarks arrive later', () => {
      const landmarks = makeLandmarks478();
      const detection = makeDetection();

      setOverlayMode('entrambi');
      onDetection({ detail: { result: detection } });
      expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
      expect(ctx.arc).not.toHaveBeenCalled();

      ctx.strokeRect.mockClear();
      ctx.arc.mockClear();
      onLandmarks3d({ detail: { landmarks } });

      expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
      expect(ctx.arc).toHaveBeenCalledTimes(478);
    });

    it('renders the recovered 2d scaffold with age and gender labels', () => {
      const detailedDetection = makeDetailedDetection();

      setOverlayMode('2d');
      onDetection({ detail: { result: detailedDetection } });

      expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
      expect(ctx.arc).toHaveBeenCalledTimes(4);
      expect(ctx.fillText.mock.calls.map(call => call[0])).toEqual([
        'volto rilevato',
        'eta stimata: 29',
        'genere stimato: female'
      ]);
    });
  });
});
