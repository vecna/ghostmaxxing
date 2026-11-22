import { describe, expect, it } from 'vitest';
import {
   appendReading,
   classifyRecognition,
   HISTORY_MS,
   recognitionView,
} from '../../lab-js/workshop/recognition.js';

/** Creates a descriptor with one varying coordinate for exact boundary checks. */
function descriptor(value) {
   return [value, ...Array(127).fill(0)];
}

const faces = [
   { id: 0, descriptor: descriptor(0) },
   { id: 7, descriptor: descriptor(2) },
];

describe('workshop recognition', () => {
   it.each([
      [0.58, 'matched', 0],
      [0.581, 'near', 0],
      [0.63, 'near', 0],
      [0.64, 'far', 0],
      [1.9, 'matched', 7],
      [1.35, 'far', 7],
      [1, 'far', 0],
   ])('classifies %s as %s and reports the actual candidate ID', (value, status, id) => {
      const verdict = classifyRecognition({ descriptor: descriptor(value), faces });
      expect(verdict).toMatchObject({ status, id });
      expect(verdict.distance).toBeCloseTo(Math.abs(value - faces.find(face => face.id === id).descriptor[0]));
   });

   it('distinguishes an empty archive from frames without a detection', () => {
      expect(classifyRecognition({ descriptor: null, faces: [] })).toEqual({
         status: 'empty', id: null, distance: null,
      });
      expect(classifyRecognition({ descriptor: null, faces })).toEqual({
         status: 'absent', id: null, distance: null,
      });
   });

   it('preserves a same-color ID change, coalesces repeats and clips to a real eight seconds', () => {
      const readings = [
         [100, 0], [1000, 0], [1500, 2], [2800, 2], [4000, null], [5000, null],
         [6000, 0.60], [7000, 0.60], [8000, 0.70], [9000, 0.70],
      ];
      const end = 9200;
      const history = readings.reduce((current, [at, value]) => {
         const reading = classifyRecognition({ descriptor: value === null ? null : descriptor(value), faces });
         return appendReading(current, reading, at);
      }, null);
      const view = recognitionView(history, end);
      expect(view.segments.map(({ status, id, from, to }) => [status, id, from, to])).toEqual([
         ['matched', 0, end - HISTORY_MS, 1500],
         ['matched', 7, 1500, 4000],
         ['absent', null, 4000, 6000],
         ['near', 0, 6000, 8000],
         ['far', 0, 8000, end],
      ]);
      expect(view.reading).toMatchObject({ status: 'far', id: 0 });
   });

   it('leaves a gap after stalled inference and expires all history', () => {
      const red = classifyRecognition({ descriptor: descriptor(0), faces });
      const first = appendReading(null, red, 100);
      const next = appendReading(first, red, 4000);
      expect(recognitionView(first, 3000).reading).toBeNull();
      expect(recognitionView(next, 4100).segments.map(segment => [segment.from, segment.to]))
         .toEqual([[100, 1600], [4000, 4100]]);
      expect(recognitionView(next, 20000)).toEqual({ reading: null, segments: [] });
   });
});
