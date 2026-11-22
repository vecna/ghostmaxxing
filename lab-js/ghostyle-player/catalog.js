/** @module ghostyle-player/catalog */

/**
 * Reads the bundled catalog and resolves each named Ghostyle from the site root.
 * @param {URL} manifest Catalog location.
 * @param {Function} [request] Browser fetch or a test double.
 * @returns {Promise<object[]>} Catalog entries with resolved module URLs.
 */
export async function loadCatalog(manifest, request = fetch) {
   const response = await request(manifest);
   if (!response.ok) throw new Error('Ghostyle catalog returned HTTP ' + response.status);
   const entries = await response.json();
   return entries.map(entry => ({
      id: entry.id,
      name: entry.name || entry.id,
      url: new URL(entry.url, manifest).href,
   }));
}

/**
 * Reads the editable source of a bundled Ghostyle.
 * @param {string} url URL from the local catalog.
 * @returns {Promise<string>} Original module source.
 */
export async function loadSource(url) {
   const response = await fetch(url);
   if (!response.ok) throw new Error('Ghostyle source returned HTTP ' + response.status);
   return response.text();
}

/**
 * Evaluates an editor draft locally as a fresh ES module.
 * @param {string} source Editable Ghostyle JavaScript.
 * @returns {Promise<object>} Module exports, including the drawing callbacks.
 */
export async function compileSource(source) {
   const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
   try {
      return await import(url);
   } finally {
      URL.revokeObjectURL(url);
   }
}

/**
 * Checks that a module can draw and returns a snapshot of its UV defaults.
 * @param {object} module Ghostyle ES module exports.
 * @returns {object} Values passed to the UV renderer.
 */
export function ghostyleDefaults(module) {
   if (typeof module.onDraw !== 'function' && typeof module.paintUV !== 'function') {
      throw new Error('Export onDraw or paintUV to render this Ghostyle.');
   }
   return Object.fromEntries((module.params ?? []).map(parameter => [
      parameter.name,
      parameter.type === 'color' ? colorValue(parameter.default) : parameter.default,
   ]));
}

/**
 * Normalizes a declared RGB or CSS hex default for the existing UV API.
 * @param {string|number[]} value A plugin color value.
 * @returns {number[]} RGB channels.
 */
export function colorValue(value) {
   if (Array.isArray(value)) {
      return [0, 1, 2].map(index => Math.max(0, Math.min(255, Math.round(Number(value[index]) || 0))));
   }
   const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
   if (!match) return [0, 0, 0];
   const hex = match[1].length === 3 ? [...match[1]].map(digit => digit.repeat(2)).join('') : match[1];
   return hex.match(/../g).map(channel => Number.parseInt(channel, 16));
}
