import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGallery, galleryUrl, initialGalleryOrigin, initGallery, PRODUCTION_ORIGIN } from '../../lab-js/gallery.js';

vi.mock('../../lab-js/i18n.js', () => ({ t: key => key }));

describe('gallery integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="gm-gallery-status"></p><button id="gm-gallery-fallback" hidden></button><div id="gm-gallery-grid"></div>';
    vi.restoreAllMocks();
  });

  it('selects production only for the production hostname', () => {
    expect(initialGalleryOrigin({ hostname: 'ghostmaxxing.vecna.eu', origin: 'https://ghostmaxxing.vecna.eu' })).toBe(PRODUCTION_ORIGIN);
    expect(initialGalleryOrigin({ hostname: 'localhost', origin: 'http://localhost:8123' })).toBe('http://localhost:8123');
    expect(galleryUrl('http://localhost:8123')).toBe('http://localhost:8123/api/gallery?limit=24');
  });

  it('validates the gallery response', async () => {
    await expect(fetchGallery('http://local.test', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, items: [] }) })))).resolves.toEqual([]);
    await expect(fetchGallery('http://local.test', vi.fn(async () => ({ ok: false, status: 503, statusText: 'Down' })))).rejects.toThrow('503');
  });

  it('renders images returned by the same-origin server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, items: [{ id: '1', content: 'Brush', postUrl: 'https://example.test/posts/1', imageUrl: 'https://example.test/1.png', alt: 'Result' }] }) })));
    initGallery();
    await vi.waitFor(() => expect(document.querySelectorAll('.gallery-card')).toHaveLength(1));
    expect(document.querySelector('.gallery-card img').alt).toBe('Result');
  });

  it('offers and executes production fallback after a local failure', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Missing' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, items: [] }) });
    vi.stubGlobal('fetch', request);
    initGallery();
    const button = document.getElementById('gm-gallery-fallback');
    await vi.waitFor(() => expect(button.hidden).toBe(false));
    button.click();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[1][0]).toBe(`${PRODUCTION_ORIGIN}/api/gallery?limit=24`);
  });
});
