/** Shared routing for public gallery, consented uploads and public media. */
export const PRODUCTION_ORIGIN = 'https://ghostmaxxing.vecna.eu';
export const LOCAL_BACKEND_ORIGIN = 'http://localhost:4040';

/** Match the backend's PORT default (gstmxx-backend/server.js: 4040).
 * Loopback IPs are treated like localhost for local previews.
 * Other hosts use the production service, never an arbitrary mirror's /api.
 */
export function backendOrigin(locationLike = globalThis.location) {
  const hostname = locationLike?.hostname;
  if (['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)) {
    return LOCAL_BACKEND_ORIGIN;
  }
  if (hostname === 'ghostmaxxing.vecna.eu') {
    return locationLike.origin || PRODUCTION_ORIGIN;
  }
  return PRODUCTION_ORIGIN;
}

export function backendUrl(path, locationLike = globalThis.location) {
  return new URL(path, backendOrigin(locationLike)).href;
}
