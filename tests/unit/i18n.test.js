import { beforeEach, describe, expect, it } from 'vitest';

import { getStoredLocale } from '../../lab-js/i18n.js';

describe('i18n stored locale', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('normalizes a persisted regional locale to a supported language', () => {
    localStorage.setItem('ghostmaxxing-locale', 'pt-BR');

    expect(getStoredLocale()).toBe('pt');
  });

  it('returns null for missing or unsupported stored values', () => {
    expect(getStoredLocale()).toBeNull();

    localStorage.setItem('ghostmaxxing-locale', 'fr-FR');
    expect(getStoredLocale()).toBeNull();
  });
});
