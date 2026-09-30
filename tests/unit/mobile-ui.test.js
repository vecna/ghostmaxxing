import { describe, expect, it, vi } from 'vitest';

function touch(type, target, screenY) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'changedTouches', { value: [{ screenY }] });
  target.dispatchEvent(event);
}

function wheel(target, deltaY) {
  const event = new Event('wheel', { bubbles: true });
  Object.defineProperty(event, 'deltaY', { value: deltaY });
  target.dispatchEvent(event);
}

describe('mobile-ui', () => {
  it('filters clear-log gestures by target and distance', async () => {
    const settings = document.getElementById('settingsDrawer');
    const scrollable = document.createElement('div');
    scrollable.className = 'scrollable';
    const history = document.getElementById('historyDrawer');
    document.body.appendChild(scrollable);

    await import('../../lab-js/mobile-ui.js?mobile-controls');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const clearVisibleLogs = vi.fn();
    window.gstmxx = { clearVisibleLogs };
    touch('touchstart', document.body, 100);
    touch('touchend', document.body, 20);
    expect(clearVisibleLogs).toHaveBeenCalledOnce();
    touch('touchstart', document.body, 100);
    touch('touchend', document.body, 60);
    expect(clearVisibleLogs).toHaveBeenCalledOnce();

    for (const target of [scrollable, settings, history]) {
      touch('touchstart', target, 100);
      touch('touchend', target, 0);
      wheel(target, 100);
    }
    expect(clearVisibleLogs).toHaveBeenCalledOnce();

    wheel(document.body, 21);
    expect(clearVisibleLogs).toHaveBeenCalledTimes(2);
    wheel(document.body, 20);
    expect(clearVisibleLogs).toHaveBeenCalledTimes(2);
    window.gstmxx = {};
    wheel(document.body, 21);
    window.gstmxx = null;
    wheel(document.body, 21);
    expect(clearVisibleLogs).toHaveBeenCalledTimes(2);

    document.body.innerHTML = '<div id="empty"></div>';
    vi.resetModules();
    await import('../../lab-js/mobile-ui.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });
});
