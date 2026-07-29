import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/i18n.js', () => ({
  applyI18n: vi.fn(),
  initI18n: vi.fn(),
  setupLocaleSelect: vi.fn(),
}));

import { applyI18n, initI18n, setupLocaleSelect } from '../../scripts/i18n.js';

describe('home page bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = '<select id="localeSelect"></select>';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes i18n and wires locale changes to re-apply translations', async () => {
    await import('../../scripts/home.js');

    expect(initI18n).toHaveBeenCalledTimes(1);
    expect(setupLocaleSelect).toHaveBeenCalledTimes(1);
    expect(setupLocaleSelect.mock.calls[0][0]).toBe(document.getElementById('localeSelect'));

    const onLocaleChange = setupLocaleSelect.mock.calls[0][1];
    onLocaleChange();

    expect(applyI18n).toHaveBeenCalledTimes(1);
  });

  it('passes null through when the locale select is absent', async () => {
    document.body.innerHTML = '';

    await import('../../scripts/home.js');

    expect(setupLocaleSelect).toHaveBeenCalledWith(null, expect.any(Function));
  });
});
