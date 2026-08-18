import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lab-js/main.js', () => ({
  els: {
    dbCount: { textContent: '' },
    nextId: { textContent: '' },
    thresholdLabel: { textContent: '' },
    dbCountBadge: { textContent: '', style: { display: '' } }
  }
}));

vi.mock('../../lab-js/utils.js', () => ({
  setLog: vi.fn()
}));

vi.mock('../../lab-js/face-thumbnails.js', () => ({
  clearAllThumbnails: vi.fn()
}));

import { state } from '../../lab-js/state.js';
import { setLog } from '../../lab-js/utils.js';
import { clearAllThumbnails } from '../../lab-js/face-thumbnails.js';
import { els } from '../../lab-js/dom.js';
import {
  STORAGE_KEY,
  STORAGE_KEY_3D,
  DB3D_MODEL_VERSION,
  loadDb,
  loadDb3d,
  persistDb,
  persistDb3d,
  renderDbStats,
  clearDb,
  clearDb3d,
} from '../../lab-js/db.js';

function defaultDb() {
  return { nextId: 0, faces: [] };
}

function defaultDb3d() {
  return { faces: [], modelVersion: DB3D_MODEL_VERSION };
}

describe('db module', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    state.db = defaultDb();
    state.db3d = defaultDb3d();
    state.MATCH_THRESHOLD = 0.58;
    state.gstmxxEvents = new EventTarget();

    els.dbCount.textContent = '';
    els.nextId.textContent = '';
    els.thresholdLabel.textContent = '';
    els.dbCountBadge.textContent = '';
    els.dbCountBadge.style.display = '';
  });

  describe('loadDb', () => {
    it('returns default DB when storage is empty', () => {
      expect(loadDb()).toEqual(defaultDb());
    });

    it('returns parsed DB when storage contains a valid payload', () => {
      const stored = { nextId: 2, faces: [{ id: 1, descriptor: [0.1, 0.2] }] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

      expect(loadDb()).toEqual(stored);
    });

    it('returns default DB when payload shape is invalid', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nextId: 'wrong', faces: [] }));
      expect(loadDb()).toEqual(defaultDb());

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nextId: 1, faces: null }));
      expect(loadDb()).toEqual(defaultDb());
    });

    it('returns default DB when payload is malformed JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{not-json');
      expect(loadDb()).toEqual(defaultDb());
    });
  });

  describe('loadDb3d', () => {
    it('returns default 3D DB when storage is empty', () => {
      expect(loadDb3d()).toEqual(defaultDb3d());
    });

    it('returns parsed 3D DB when storage contains a valid versioned payload', () => {
      const stored = {
        modelVersion: DB3D_MODEL_VERSION,
        faces: [{ id: 1, descriptor3d: [0.1, 0.2], savedAt: '2026-06-29T00:00:00.000Z' }]
      };
      localStorage.setItem(STORAGE_KEY_3D, JSON.stringify(stored));

      expect(loadDb3d()).toEqual(stored);
    });

    it('wipes an incompatible 3D DB and logs the automatic reset', () => {
      const stale = {
        faces: [{ id: 1, descriptor3d: [0.1, 0.2], savedAt: '2026-06-29T00:00:00.000Z' }]
      };
      localStorage.setItem(STORAGE_KEY_3D, JSON.stringify(stale));

      const loaded = loadDb3d();

      expect(loaded).toEqual(defaultDb3d());
      expect(state.db3d).toEqual(defaultDb3d());
      expect(localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY_3D, JSON.stringify(defaultDb3d()));
      expect(setLog).toHaveBeenCalledWith('Database 3D incompatibile col nuovo modello, svuoto', 'db');
    });
  });

  describe('persistDb', () => {
    it('stores DB and dispatches dbChanged event with summary', () => {
      state.db = { nextId: 3, faces: [{ id: 0 }, { id: 1 }] };
      const onDbChanged = vi.fn();
      state.gstmxxEvents.addEventListener('dbChanged', onDbChanged);

      persistDb();

      expect(localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(state.db));
      expect(onDbChanged).toHaveBeenCalledTimes(1);
      expect(onDbChanged.mock.calls[0][0].detail).toEqual({ count: 2, nextId: 3 });
    });
  });

  describe('persistDb3d', () => {
    it('stores the current 3D DB including modelVersion', () => {
      state.db3d = {
        modelVersion: DB3D_MODEL_VERSION,
        faces: [{ id: 5, descriptor3d: [0.9, 0.1], savedAt: '2026-06-29T00:00:00.000Z' }]
      };

      persistDb3d();

      expect(localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY_3D, JSON.stringify(state.db3d));
    });
  });

  describe('renderDbStats', () => {
    it('updates counters, threshold label and badge visibility', () => {
      state.db = { nextId: 5, faces: [{ id: 0 }, { id: 1 }, { id: 2 }] };
      state.MATCH_THRESHOLD = 0.6;

      renderDbStats();

      expect(els.dbCount.textContent).toBe('3');
      expect(els.nextId.textContent).toBe('5');
      expect(els.thresholdLabel.textContent).toBe('0.60');
      expect(els.dbCountBadge.textContent).toBe('3');
      expect(els.dbCountBadge.style.display).toBe('inline-block');
    });
  });

  describe('clearDb', () => {
    it('resets DB, persists it, emits matchStateChanged, logs and re-renders stats', () => {
      state.db = { nextId: 9, faces: [{ id: 7 }] };
      state.MATCH_THRESHOLD = 0.58;
      const onDbChanged = vi.fn();
      const onMatchStateChanged = vi.fn();
      state.gstmxxEvents.addEventListener('dbChanged', onDbChanged);
      state.gstmxxEvents.addEventListener('matchStateChanged', onMatchStateChanged);

      clearDb();

      expect(state.db).toEqual(defaultDb());
      expect(state.db3d).toEqual(defaultDb3d());
      expect(localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(defaultDb()));
      expect(onDbChanged).toHaveBeenCalledTimes(1);
      expect(onMatchStateChanged).toHaveBeenCalledTimes(1);
      expect(onMatchStateChanged.mock.calls[0][0].detail).toEqual({ detectionState: 'unknown', source: 'clear' });
      expect(setLog).toHaveBeenCalledWith('Archivio locale cancellato. Il contatore ID riparte da 0.');
      expect(clearAllThumbnails).toHaveBeenCalledTimes(1);
      expect(els.dbCount.textContent).toBe('0');
      expect(els.nextId.textContent).toBe('0');
      expect(els.dbCountBadge.textContent).toBe('0');
    });
  });

  describe('clearDb3d', () => {
    it('resets only the 3D DB and persists the empty versioned payload', () => {
      state.db3d = {
        modelVersion: DB3D_MODEL_VERSION,
        faces: [{ id: 4, descriptor3d: [0.2, 0.8], savedAt: '2026-06-29T00:00:00.000Z' }]
      };

      clearDb3d();

      expect(state.db3d).toEqual(defaultDb3d());
      expect(localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY_3D, JSON.stringify(defaultDb3d()));
    });
  });
});
