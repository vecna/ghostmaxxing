import { describe, expect, it } from 'vitest';

import { canUseGuideShortcut } from '../../lab-js/realtime/realtime-guide.js';

describe('realtime baseline guide shortcuts', () => {
  it('leaves Space to video and interactive controls', () => {
    for (const tag of ['video', 'button', 'input', 'summary']) {
      const element = document.createElement(tag);
      expect(canUseGuideShortcut(element)).toBe(false);
    }
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    editable.setAttribute('contenteditable', 'true');
    expect(canUseGuideShortcut(editable)).toBe(false);
  });

  it('allows the page shortcut from non-interactive content', () => {
    expect(canUseGuideShortcut(document.body)).toBe(true);
    expect(canUseGuideShortcut(document.createElement('canvas'))).toBe(true);
  });
});
