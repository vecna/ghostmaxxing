import { describe, expect, it, vi } from 'vitest';
import { createFaceArchive, FACE_ARCHIVE_KEY, FACE_DESCRIPTOR_MODEL } from '../../lab-js/face-archive.js';

const descriptor = new Float32Array(128).fill(0.25);
const savedAt = '2026-11-01T12:00:00Z';

describe('shared face archive', () => {
   it('allocates stable IDs for cooperating tabs and keeps a failed write out of the archive', async () => {
      let persisted = null;
      const storage = {
         getItem: () => persisted,
         setItem: vi.fn((key, value) => { persisted = value; }),
      };
      let queue = Promise.resolve();
      const locks = { request: vi.fn((key, commit) => {
         const operation = queue.then(commit);
         queue = operation.catch(() => {});
         return operation;
      }) };
      const firstTab = createFaceArchive({ storage, locks });
      const secondTab = createFaceArchive({ storage, locks });
      const added = await Promise.all([
         firstTab.save({ descriptor, savedAt }),
         secondTab.save({ descriptor, savedAt }),
      ]);

      expect(added.map(face => face.id)).toEqual([0, 1]);
      expect(locks.request).toHaveBeenCalledWith(FACE_ARCHIVE_KEY, expect.any(Function));
      expect(firstTab.read().faces).toHaveLength(2);

      storage.setItem.mockImplementationOnce(() => { throw new Error('quota'); });
      await expect(secondTab.save({ descriptor, savedAt })).rejects.toThrow('quota');
      expect(firstTab.read().nextId).toBe(2);
      await firstTab.remove(0);
      expect(await secondTab.save({ descriptor, savedAt })).toMatchObject({ id: 2 });
      expect(firstTab.read().faces.map(face => face.id)).toEqual([1, 2]);
   });

   it('rejects incompatible or invalid persisted face descriptors', () => {
      const storage = { getItem: vi.fn() };
      const archive = createFaceArchive({ storage });
      const faces = [{ id: 5, descriptor: Array.from(descriptor) }, { id: 6, descriptor: [0] }];
      storage.getItem.mockReturnValueOnce(JSON.stringify({ model: 'another-model', faces }));
      expect(archive.read().faces).toEqual([]);
      storage.getItem.mockReturnValueOnce(JSON.stringify({ model: FACE_DESCRIPTOR_MODEL, faces }));
      expect(archive.read()).toMatchObject({ nextId: 6, faces: [faces[0]] });
   });
});
