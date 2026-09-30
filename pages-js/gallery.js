const PRODUCTION_ORIGIN = 'https://ghostmaxxing.vecna.eu';
const PAGE_SIZE = 24;

const list = document.getElementById('gallery-list');
const status = document.getElementById('gallery-status');
const more = document.getElementById('gallery-more');
const fallback = document.getElementById('gallery-production-fallback');
const follow = document.getElementById('gallery-follow');
const handleButton = document.getElementById('gallery-copy-handle');
const followers = document.getElementById('gallery-followers');

let sourceOrigin = location.hostname === 'ghostmaxxing.vecna.eu' ? PRODUCTION_ORIGIN : location.origin;
let nextCursor = null;
let loading = false;

function endpoint(cursor) {
  const url = new URL('/api/gallery', sourceOrigin);
  url.searchParams.set('limit', String(PAGE_SIZE));
  if (cursor) url.searchParams.set('cursor', cursor);
  return url.href;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function cardFor(item) {
  const postUrl = safeUrl(item.postUrl);
  const imageUrl = safeUrl(item.thumbnailUrl || item.imageUrl);
  if (!postUrl || !imageUrl) return null;
  const card = document.createElement('a');
  card.className = 'gallery-item';
  card.href = postUrl;
  const image = document.createElement('img');
  image.src = imageUrl;
  image.alt = item.alt || item.content || 'Ghostmaxxing community image';
  image.loading = 'lazy';
  image.decoding = 'async';
  const body = document.createElement('span');
  body.className = 'gallery-item__body';
  const title = document.createElement('strong');
  title.textContent = item.content || item.ghostyleId || 'Shared experiment';
  const meta = document.createElement('span');
  meta.className = 'gallery-item__meta';
  const date = new Date(item.createdAt).toLocaleDateString();
  meta.textContent = `${date} · ${item.likes || 0} ${(item.likes || 0) === 1 ? 'like' : 'likes'}`;
  body.append(title, meta);
  card.append(image, body);
  return card;
}

function renderMetadata(gallery) {
  if (!gallery || !gallery.actor) return;
  follow.hidden = false;
  handleButton.textContent = gallery.actor;
  handleButton.title = 'Copy Fediverse handle';
  followers.textContent = `${gallery.followers || 0} ${(gallery.followers || 0) === 1 ? 'follower' : 'followers'}`;
  handleButton.onclick = async () => {
    await navigator.clipboard?.writeText(gallery.actor);
    handleButton.textContent = 'Copied';
    setTimeout(() => { handleButton.textContent = gallery.actor; }, 1400);
  };
}

async function load(cursor = null) {
  if (loading) return;
  loading = true;
  more.disabled = true;
  status.hidden = false;
  status.textContent = cursor ? 'Loading older pictures…' : 'Loading the gallery…';
  fallback.hidden = true;
  try {
    const response = await fetch(endpoint(cursor), { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`${response.status}`);
    const body = await response.json();
    if (!body.ok || !Array.isArray(body.items)) throw new Error('Invalid response');
    renderMetadata(body.gallery);
    for (const item of body.items) {
      const card = cardFor(item);
      if (card) list.append(card);
    }
    nextCursor = body.nextCursor || null;
    more.hidden = !nextCursor;
    status.hidden = body.items.length > 0 || list.children.length > 0;
    if (!list.children.length) {
      status.hidden = false;
      status.textContent = 'No published pictures yet.';
    } else if (!nextCursor) {
      status.hidden = false;
      status.textContent = 'You reached the beginning of the gallery.';
    }
  } catch (_) {
    status.textContent = 'Could not load the gallery from this server.';
    fallback.hidden = sourceOrigin === PRODUCTION_ORIGIN;
  } finally {
    loading = false;
    more.disabled = false;
  }
}

more.addEventListener('click', () => nextCursor && load(nextCursor));
fallback.addEventListener('click', () => {
  sourceOrigin = PRODUCTION_ORIGIN;
  list.replaceChildren();
  nextCursor = null;
  load();
});
load();
