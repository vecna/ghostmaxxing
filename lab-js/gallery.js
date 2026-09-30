/** Public, read-only shared gallery loader. */
import { t } from './i18n.js';

export const PRODUCTION_ORIGIN = 'https://ghostmaxxing.vecna.eu';
export const GALLERY_PATH = '/api/gallery?limit=24';

export function initialGalleryOrigin(locationLike = window.location) {
  return locationLike.hostname === 'ghostmaxxing.vecna.eu'
    ? PRODUCTION_ORIGIN
    : locationLike.origin;
}

export function galleryUrl(origin) {
  return new URL(GALLERY_PATH, origin).href;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export async function fetchGallery(origin, fetchImpl = fetch) {
  const response = await fetchImpl(galleryUrl(origin), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
  const body = await response.json();
  if (!body || body.ok !== true || !Array.isArray(body.items)) throw new Error('Invalid gallery response');
  return body.items;
}

function renderItems(container, items) {
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'gallery-status';
    empty.textContent = t('gallery_empty_status');
    container.append(empty);
    return;
  }

  for (const item of items) {
    const imageUrl = safeHttpUrl(item.imageUrl);
    const postUrl = safeHttpUrl(item.postUrl);
    if (!imageUrl || !postUrl) continue;
    const card = document.createElement('a');
    card.className = 'gallery-card';
    card.href = postUrl;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    const image = document.createElement('img');
    image.src = safeHttpUrl(item.thumbnailUrl) || imageUrl;
    image.alt = item.alt || item.content || t('gallery_image_alt');
    image.loading = 'lazy';
    image.decoding = 'async';

    const caption = document.createElement('span');
    caption.textContent = item.content || item.ghostyleId || t('gallery_image_alt');
    card.append(image, caption);
    container.append(card);
  }
}

export function initGallery() {
  const container = document.getElementById('gm-gallery-grid');
  const status = document.getElementById('gm-gallery-status');
  const fallback = document.getElementById('gm-gallery-fallback');
  if (!container || !status || !fallback) return;

  const localOrigin = initialGalleryOrigin();

  async function load(origin, allowFallback) {
    status.hidden = false;
    status.textContent = t('gallery_loading_status');
    fallback.hidden = true;
    try {
      const items = await fetchGallery(origin);
      renderItems(container, items);
      status.hidden = true;
    } catch (_) {
      container.replaceChildren();
      status.textContent = t('gallery_load_failed_status');
      fallback.hidden = !allowFallback;
    }
  }

  fallback.addEventListener('click', () => load(PRODUCTION_ORIGIN, false));
  load(localOrigin, localOrigin !== PRODUCTION_ORIGIN);
}
