import { describe, expect, it } from 'vitest';
import { createFaceArchive } from '../../lab-js/face-archive.js';
import { clearBaseline, loadBaseline, saveBaseline } from '../../lab-js/realtime/realtime-settings.js';

const descriptor = Array.from({ length: 128 }, (_, index) => index / 128);
const conditions = {
  rollDegrees: 0,
  yawOffset: 0.01,
  boxWidthRatio: 0.4,
  centerXRatio: 0.5,
  centerYRatio: 0.5,
  luma: 0.6,
};
const guide = {
  aspectRatio: 4 / 3,
  box: { x: 0.2, y: 0.1, width: 0.5, height: 0.7 },
  landmarks: Array.from({ length: 68 }, (_, index) => ({ x: index / 100, y: index / 200 })),
};
const baseline = { descriptor, conditions, guide, noiseFloor: 0.01, capturedAt: 1234, sourceKind: 'camera' };

/** Supplies an isolated storage implementation for both sides of the archive. */
function testArchives() {
  const entries = new Map();
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  return { storage, realtime: createFaceArchive({ storage }), lab: createFaceArchive({ storage }) };
}

describe('realtime baseline persistence', () => {
  it('restores the camera calibration and exposes the same face to Lab', async () => {
    const { realtime, lab } = testArchives();
    await saveBaseline(baseline, realtime);

    expect(loadBaseline(realtime)).toMatchObject(baseline);
    expect(lab.read().faces).toMatchObject([{ id: 0, descriptor }]);

    await lab.remove(0);
    expect(loadBaseline(realtime)).toBeNull();
    expect(realtime.read().nextId).toBe(1);
  });

  it('ignores previous formats, video baselines and incomplete calibrations', async () => {
    const { storage, realtime, lab } = testArchives();
    storage.setItem('gstmxx.realtime.baseline', JSON.stringify({ ...baseline, format: 3 }));
    storage.setItem('local-face-lab-db-v1', JSON.stringify({ faces: [{ id: 0, descriptor }], nextId: 1 }));
    expect(loadBaseline(realtime)).toBeNull();
    expect(lab.read().faces).toEqual([]);

    expect(await saveBaseline({ ...baseline, sourceKind: 'video' }, realtime)).toBeNull();
    expect(lab.read().faces).toEqual([]);

    await saveBaseline({ ...baseline, conditions: undefined }, realtime);
    expect(loadBaseline(realtime)).toBeNull();

    const saved = await saveBaseline(baseline, realtime);
    await lab.save({ descriptor, savedAt: saved.savedAt });
    expect(loadBaseline(realtime)).toMatchObject(baseline);
    expect(lab.read().activeRealtimeId).toBe(saved.id);
  });

  it('resets only the reference owned by the requesting Realtime session', async () => {
    const { realtime, lab } = testArchives();
    const first = await saveBaseline(baseline, realtime);
    const second = await saveBaseline(baseline, realtime);
    await clearBaseline({ id: first.id, removeFace: true, archive: realtime });
    expect(lab.read().faces.map(face => face.id)).toEqual([second.id]);
    expect(loadBaseline(realtime).archiveId).toBe(second.id);
  });

  it('retains previous workshop faces when starting a session and deletes only the active template on explicit reset', async () => {
    const { realtime, lab } = testArchives();
    const first = await saveBaseline(baseline, realtime);
    await clearBaseline({ id: first.id, archive: realtime });
    expect(loadBaseline(realtime)).toBeNull();

    const second = await saveBaseline(baseline, realtime);
    expect(second.id).toBe(first.id + 1);
    await clearBaseline({ id: second.id, removeFace: true, archive: realtime });
    expect(loadBaseline(realtime)).toBeNull();
    expect(lab.read().faces.map(face => face.id)).toEqual([first.id]);
  });
});
