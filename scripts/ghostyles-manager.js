/** @module ghostyles-manager */
import { state } from './state.js';
import { setLog, formatRelativeTime } from './utils.js';
import { els, clearActiveEffect, effectSelected } from './dom.js';

/**
 * Retrieves ghostyle metadata from a remote script URL.
 * Parses the script text to extract the `@name` comment and derives an identifier
 * from the filename. Returns an object containing `id`, `name` and the original `url`.
 *
 * window.gstmxx is the local API used by the ghostyle(s)
 * In regards of the loading, you can see from the network manager that each JS is loaded twice.
 * The first time is to extract the metadata, the second time is to import the module.
 * @param {string} url - The URL of the ghostyle script to fetch.
 * @throws {Error} Throws an error if the HTTP request fails or the response is not OK.
 * @see scripts/main.js – loads ghostyle list and calls this function for each URL.
 * @see tests/unit/ghostyles-manager.test.js – unit tests for metadata extraction.
 * @returns {{
 *   id: string,
 *   name: string,
 *   url: string,
 *   version: (string|null),
 *   author: (string|null),
 *   description: (string|null),
 *   releaseDate: (string|null)
 * }} Metadata for the ghostyle.
 */
export async function fetchGhostyleMetadata(url) {
   const res = await fetch(url, { cache: 'no-store' });
   if (!res.ok) throw new Error(`HTTP ${res.status}`);
   const text = await res.text();
   const matchName = text.match(/@name\s+(.+)/);
   const matchVersion = text.match(/@version\s+([^\n\r*]+)/i);
   const matchAuthor = text.match(/@author\s+([^\n\r*]+)/i);
   const matchDescription = text.match(/@description\s+([^\n\r*]+)/i);
   const matchReleaseDate = text.match(/@release_date\s+([^\n\r*]+)/i);
   const filename = (url.split('/').pop() || '').split('?')[0];
   const id = filename.replace(/\.js$/i, '');
   const name = matchName ? matchName[1].trim() : id;
   const version = matchVersion ? matchVersion[1].trim() : null;
   const author = matchAuthor ? matchAuthor[1].trim() : null;
   const description = matchDescription ? matchDescription[1].trim() : null;
   const releaseDate = matchReleaseDate ? matchReleaseDate[1].trim() : null;
   return {
      id,
      name,
      url,
      version,
      author,
      description,
      releaseDate,
      hasName: Boolean(matchName),
      hasVersion: Boolean(matchVersion),
      hasReleaseDate: Boolean(matchReleaseDate)
   };
}

/**
 * Dynamically imports a ghostyle module after its metadata has been retrieved.
 * Returns an object containing the original metadata plus the loaded module.
 *
 * @param {{id:string, name:string, url:string, version:(string|null), author:(string|null), description:(string|null), releaseDate:(string|null)}} param - The ghostyle metadata.
 * @returns {{id:string, name:string, module:any, url:string, version:(string|null), author:(string|null), description:(string|null), releaseDate:(string|null)}} The ghostyle with its imported module.
 * @see main.js – after metadata extraction, this function loads the actual ghostyle code.
 * @see tests/unit/ghostyles-manager.test.js – tests import behavior.
 */
export async function importGhostyleModule({ id, name, url, version = null, author = null, description = null, releaseDate = null }) {
   const module = await import(url);
   return { id, name, module, url, version, author, description, releaseDate };
}

/**
 * Unified plugin loader for both engines.
 *
 * Every ghostyle is loaded from the same manifest. Runtime capabilities are
 * detected from module exports:
 * - if module exports `onDraw`, it can render on face-api ticks
 * - if module exports `paintUV`, it can render on MediaPipe UV ticks
 *
 * @param {string} url
 * @param {string} expectedName
 * @param {{onFaceapiToggle: ?Function}} options
 * @returns {Promise<object|null>}
 */
export async function loadGhostyle(url, expectedName, options = {}) {
   let metadata;
   try {
      metadata = await fetchGhostyleMetadata(url);
   } catch (err) {
      throw new Error(`Errore metadata plugin (${expectedName || url}): ${err.message}`);
   }

   let ghostyle = null;
   try {
      ghostyle = await importGhostyleModule(metadata);
   } catch (err) {
      throw new Error(`Errore durante l'importazione del modulo: ${err.message}`);
   }

   if (!metadata.hasName) {
      setLog(`Plugin ${metadata.id} senza @name nell'header, uso fallback ${metadata.id}`, 'loader');
      ghostyle.name = metadata.id;
   } else {
      ghostyle.name = metadata.name;
   }

   if (!metadata.hasVersion) {
      setLog(`Plugin ${metadata.id} senza @version`, 'loader');
   }

   if (!hasRenderableCallback(ghostyle.module)) {
      setLog(`Plugin ${metadata.id} non esporta ne onDraw ne paintUV, ignorato`, 'loader');
      return null;
   }

   if (metadata.hasReleaseDate && !isValidDate(metadata.releaseDate)) {
      setLog(`Plugin ${metadata.id} ha @release_date non valida (${metadata.releaseDate}), ignorata`, 'loader');
      ghostyle.releaseDate = null;
   }

   ghostyle.freshnessLabel = await resolveFreshnessLabel(ghostyle);

   ghostyle.module = wrapPluginCallbacks(ghostyle);

   if (ghostyle.module.onInit) {
      try {
         const message = ghostyle.module.onInit();
         if (message) {
            setLog(`${ghostyle.name}: ${message}`);
         }
      } catch (err) {
         reportPluginRuntimeError(ghostyle.id, err, 'onInit');
      }
   }

   const btn = addGhostyleBtn(ghostyle);
   btn.onclick = () => {
      toggleEffect(ghostyle.id, btn);
      if (typeof options.onFaceapiToggle === 'function') {
         options.onFaceapiToggle();
      }
   };
   setLog(`Caricato con successo ghostyle ${ghostyle.name} da ${url}`);
   return ghostyle;
}

function hasRenderableCallback(module) {
   const onDraw = module && 'onDraw' in module ? module.onDraw : undefined;
   const paintUV = module && 'paintUV' in module ? module.paintUV : undefined;
   return Boolean(
      module &&
      (typeof onDraw === 'function' || typeof paintUV === 'function')
   );
}

function isValidDate(dateLike) {
   if (!dateLike) return false;
   const parsed = new Date(dateLike);
   return !Number.isNaN(parsed.getTime());
}

function asErrorLabel(err) {
   if (err instanceof Error) return `${err.name}: ${err.message}`;
   return String(err);
}

function reportPluginRuntimeError(pluginId, err, hookName) {
   const message = asErrorLabel(err);
   setLog(`Plugin ${pluginId} ha lanciato: ${message} (${hookName})`, pluginId);
   console.error(`[plugin:${pluginId}] errore in ${hookName}:`, err);
   deactivatePluginOnError(pluginId);
}

function deactivatePluginOnError(pluginId) {
   const btn = document.querySelector(`.preview-btn[data-effect="${pluginId}"]`);
   if (btn) btn.classList.remove('active');

   if (state.activeEffect === pluginId) {
      clearActiveEffect();
      messageEffectChange(null, pluginId);
   }
}

function wrapPluginCallbacks(ghostyle) {
   const module = ghostyle.module || {};
   const wrappedModule = { ...module };

   const originalOnClear = 'onClear' in module ? module.onClear : undefined;
   const originalOnDraw = 'onDraw' in module ? module.onDraw : undefined;
   const originalPaintUV = 'paintUV' in module ? module.paintUV : undefined;

   if (typeof originalOnClear === 'function') {
      wrappedModule.onClear = (ctx) => {
         try {
            return originalOnClear(ctx);
         } catch (err) {
            reportPluginRuntimeError(ghostyle.id, err, 'onClear');
            return undefined;
         }
      };
   }

   if (typeof originalOnDraw === 'function') {
      wrappedModule.onDraw = (ctx, landmarks, box) => {
         try {
            return originalOnDraw(ctx, landmarks, box);
         } catch (err) {
            reportPluginRuntimeError(ghostyle.id, err, 'onDraw');
            return undefined;
         }
      };
   }

   if (typeof originalPaintUV === 'function') {
      wrappedModule.paintUV = (ctx, params, helpers) => {
         try {
            return originalPaintUV(ctx, params, helpers);
         } catch (err) {
            reportPluginRuntimeError(ghostyle.id, err, 'paintUV');
            return undefined;
         }
      };
   }

   return wrappedModule;
}

async function getLastModifiedLabel(url) {
   try {
      const headRes = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (!headRes.ok) return null;
      const lastModified = headRes.headers.get('Last-Modified');
      if (!isValidDate(lastModified)) return null;
      return formatRelativeTime(lastModified);
   } catch {
      return null;
   }
}

async function resolveFreshnessLabel(record) {
   if (record.releaseDate && isValidDate(record.releaseDate)) {
      return formatRelativeTime(record.releaseDate);
   }

   const fromHead = await getLastModifiedLabel(record.url);
   return fromHead || 'n/d';
}

function addGhostyleBtn(record) {
   state.loadedGhostyles.set(record.id, record);

   const btn = document.createElement('button');
   btn.className = 'preview-btn';
   btn.setAttribute('aria-label', record.name);

   const title = document.createElement('span');
   title.className = 'preview-btn__title';
   title.textContent = record.name;
   btn.appendChild(title);

   const meta = document.createElement('span');
   meta.className = 'preview-btn__meta';
   meta.textContent = `aggiornato ${record.freshnessLabel || 'n/d'}`;
   if (record.releaseDate) meta.title = record.releaseDate;
   btn.appendChild(meta);

   btn.dataset.effect = record.id;
   els.ghostylesContainer.appendChild(btn);

   const row = document.createElement('div');
   row.className = 'ghostyle-row';
   row.dataset.effect = record.id;

   if (btn.parentNode) {
      btn.parentNode.insertBefore(row, btn);
   }
   row.appendChild(btn);

   const pinsDiv = document.createElement('div');
   pinsDiv.className = 'ghostyle-pins';

   const pin1 = document.createElement('button');
   pin1.className = 'pin-btn pin-btn--1';
   pin1.title = 'Pin to Slot 1';
   pin1.setAttribute('aria-label', `Pin ${record.name} to Slot 1`);
   pin1.innerHTML = '1';
   pinsDiv.appendChild(pin1);

   const pin2 = document.createElement('button');
   pin2.className = 'pin-btn pin-btn--2';
   pin2.title = 'Pin to Slot 2';
   pin2.setAttribute('aria-label', `Pin ${record.name} to Slot 2`);
   pin2.innerHTML = '2';
   pinsDiv.appendChild(pin2);

   row.appendChild(pinsDiv);

   return btn;
}

/* if there is onClear function, it will be called */
/**
 * Deactivates the currently active ghostyle effect.
 * If the loaded ghostyle module defines an `onClear` hook, it is invoked with the overlay canvas context to allow the effect to clean up any custom drawing state.
 * Returns the style object for the previously active effect.
 *
 * @returns {any} The style object of the previously active ghostyle, if any.
 * @see toggleEffect – called when switching effects to ensure the previous effect is properly cleared.
 * @see main.js – UI interactions trigger effect toggling which eventually calls this function.
 */
function deactivateEffect() {

   const style = state.loadedGhostyles.get(state.activeEffect);
   if (style && style.module.onClear) {
      try {
         style.module.onClear(els.overlay.getContext('2d'));
      } catch (err) {
         reportPluginRuntimeError(style.id || state.activeEffect, err, 'onClear');
      }
   }

   return style;
}

/**
 * Dispatches a custom `effectChanged` event to inform the rest of the application about a change in the active ghostyle effect.
 * The event payload includes the new `activeEffect` identifier and the `previous` effect identifier.
 *
 * @param {string|null} effect - The identifier of the newly active effect, or null if none.
 * @param {string|null} previousEffect - The identifier of the effect that was previously active.
 * @see toggleEffect – triggers this notification when an effect is switched.
 * @see main.js – listens for this event to update UI state.
 */
function messageEffectChange(effect, previousEffect) {
   state.gstmxxEvents.dispatchEvent(new CustomEvent('effectChanged', {
      detail: { activeEffect: effect, previous: previousEffect }
   }));
}

/**
 * Toggles a ghostyle effect on or off.
 * Handles activation, deactivation, state updates, logging, and UI selection.
 *
 * @param {string} effect - Identifier of the ghostyle effect.
 * @param {HTMLElement} button - The UI button tied to the effect.
 * @see deactivateEffect – clears previous effect.
 * @see messageEffectChange – notifies of effect changes.
 * @see main.js – UI triggers this toggle.
 */
export function toggleEffect(effect, button) {

   if (state.activeEffect === effect) {
      setLog(`Effetto ${state.activeEffect} già attivo. Disattivazione in corso...`);
      deactivateEffect();
      clearActiveEffect();
      messageEffectChange(null, effect);
      return;
   }

   let previousEffect = null;
   if (state.activeEffect) {
      previousEffect = state.activeEffect;
      deactivateEffect();
   }

   state.activeEffect = effect;

   const ghstyle = state.loadedGhostyles.get(effect);
   messageEffectChange(effect, previousEffect);

   if (previousEffect) {
      setLog(`Effetto ${previousEffect} disattivato, abiliato ${ghstyle.name}. Sarà applicato al volto nella webcam.`);
   } else {
      setLog(`Effetto ${ghstyle.name} attivato. Sarà applicato al volto nella webcam.`);
   }

   effectSelected(button);

}

function withCacheBust(url, token) {
   const sep = url.includes('?') ? '&' : '?';
   return `${url}${sep}t=${token}`;
}

/**
 * Reload all plugins from the unified manifest with cache busting.
 * The currently active plugin is deactivated and must be reselected.
 *
 * @param {{manifestUrl: ?string, baseUrl: ?string, onFaceapiToggle: ?Function}} [options]
 * @returns {Promise<number>} Number of plugins loaded.
 */
export async function reloadPlugins(options = {}) {
   const relurl = options.baseUrl || window.location.pathname.split('/').slice(0, -1).join('/');
   const manifestUrl = options.manifestUrl || `${relurl}/ghostyles.json`;
   const bust = Date.now();

   if (state.activeEffect) {
      const previous = state.activeEffect;
      deactivateEffect();
      clearActiveEffect();
      messageEffectChange(null, previous);
   }

   state.loadedGhostyles = new Map();
   if (els.ghostylesContainer) els.ghostylesContainer.innerHTML = '';

   const manifestRes = await fetch(withCacheBust(manifestUrl, bust), { cache: 'no-store' });
   if (!manifestRes.ok) throw new Error(`HTTP ${manifestRes.status}`);

   const list = await manifestRes.json();
   let loaded = 0;

   for (const item of list) {
      const pluginUrl = withCacheBust(`${relurl}/${item.url}`, bust);
      const loadedPlugin = await loadGhostyle(pluginUrl, item.id || item.name, {
         onFaceapiToggle: options.onFaceapiToggle
      });
      if (loadedPlugin) loaded += 1;
   }

   return loaded;
}
