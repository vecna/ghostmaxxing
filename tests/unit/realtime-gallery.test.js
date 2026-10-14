import { describe, expect, it } from 'vitest';
import { formatCaptureMeasurement } from '../../lab-js/realtime/realtime-gallery.js';

describe('realtime capture labels', () => {
  it('reports a distance at or below the threshold as a continuing match', () => {
    expect(formatCaptureMeasurement({ distance: 0.156, threshold: 0.6 }))
      .toBe('distance 0.156/0.60 · still match');
    expect(formatCaptureMeasurement({ distance: 0.6, threshold: 0.6 }))
      .toBe('distance 0.600/0.60 · still match');
  });

  it('reports a distance above the threshold as a different person', () => {
    expect(formatCaptureMeasurement({ distance: 0.601, threshold: 0.6 }))
      .toBe('distance 0.601/0.60 · different person');
  });
});
