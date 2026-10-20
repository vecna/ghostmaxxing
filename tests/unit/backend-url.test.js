import { describe, expect, it } from 'vitest';
import { backendOrigin, backendUrl } from '../../lab-js/backend-url.js';
describe('backend routing across deployments', () => {
  it.each([
    ['http://localhost:1313', 'http://localhost:4040'],
    ['http://127.0.0.1:8080', 'http://localhost:4040'],
    ['https://ghostmaxxing.vecna.eu', 'https://ghostmaxxing.vecna.eu'],
    ['https://sindacato.nina.watch', 'https://ghostmaxxing.vecna.eu'],
    ['https://another.example', 'https://ghostmaxxing.vecna.eu'],
  ])('%s routes to %s', (origin, expected) => {
    const location = new URL(origin + '/ghostati/');
    expect(backendOrigin(location)).toBe(expected);
    for (const path of ['/api/uploads', '/api/gallery?limit=24', '/videos/id.mp4']) {
      expect(backendUrl(path, location)).toBe(expected + path);
    }
  });
});
