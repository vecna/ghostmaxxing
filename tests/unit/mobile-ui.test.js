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
  it('binds drawer/fullscreen controls and filters gestures by target and distance', async () => {
    const settings = document.getElementById('settingsDrawer');
    const toggle = document.getElementById('toggleSettingsBtn');
    const close = document.getElementById('closeSettingsBtn');
    const fullscreen = document.getElementById('fullscreenBtn');
    const scrollable = document.createElement('div');
    scrollable.className = 'scrollable';
    const history = document.getElementById('historyDrawer');
    document.body.appendChild(scrollable);

    await import('../../lab-js/mobile-ui.js?mobile-controls');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    toggle.click();
    expect(settings.classList.contains('hidden')).toBe(false);
    close.click();
    expect(settings.classList.contains('hidden')).toBe(true);

    const request = vi.fn(() => ({ then: () => ({ catch: vi.fn() }) }));
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    document.documentElement.requestFullscreen = request;
    fullscreen.click();
    expect(request).toHaveBeenCalledOnce();

    delete document.documentElement.requestFullscreen;
    document.documentElement.webkitRequestFullscreen = request;
    fullscreen.click();
    expect(request).toHaveBeenCalledTimes(2);

    delete document.documentElement.webkitRequestFullscreen;
    document.documentElement.msRequestFullscreen = request;
    fullscreen.click();
    expect(request).toHaveBeenCalledTimes(3);

    delete document.documentElement.msRequestFullscreen;
    const rejectedFullscreen = vi.spyOn(Promise, 'reject').mockReturnValue({
      then: () => ({ catch: vi.fn() }),
    });
    fullscreen.click();
    rejectedFullscreen.mockRestore();

    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: {} });
    const exit = vi.fn();
    document.exitFullscreen = exit;
    fullscreen.click();
    expect(exit).toHaveBeenCalledOnce();

    delete document.exitFullscreen;
    document.webkitExitFullscreen = exit;
    fullscreen.click();
    expect(exit).toHaveBeenCalledTimes(2);

    delete document.webkitExitFullscreen;
    document.msExitFullscreen = exit;
    fullscreen.click();
    expect(exit).toHaveBeenCalledTimes(3);
    delete document.msExitFullscreen;
    fullscreen.click();

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

  it('ignores drawer controls when the settings drawer is absent', async () => {
    document.body.innerHTML = '<button id="toggleSettingsBtn"></button><button id="closeSettingsBtn"></button>';
    vi.resetModules();
    await import('../../lab-js/mobile-ui.js?missing-drawer');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.getElementById('toggleSettingsBtn').click();
    document.getElementById('closeSettingsBtn').click();
    expect(document.getElementById('settingsDrawer')).toBeNull();
  });
});
