import { t } from './i18n.js';

/**
 * @module ghostyle3d-uv-renderer
 * @description
 * Libreria UV renderer pura per Ghostyle 3D.
 * Nessun side effect al load e nessuna dipendenza diretta da `window.*`.
 */

/**
 * Crea un renderer UV 3D side-effect free.
 *
 * @param {{
 *   uvPath: string,
 *   getFaceLandmarker: ?(function(): any),
 *   log: ?(function(string): void)
 * }} options
 * @returns {{ ensureLoaded: (function(): Promise<void>), render: (function(any, CanvasRenderingContext2D, any[], object): void) }}
 */
export function createUvRenderer(options) {
   const uvPath = options && options.uvPath;
   const getFaceLandmarker = (options && options.getFaceLandmarker)
      ? options.getFaceLandmarker
      : () => null;
   const log = (options && options.log) ? options.log : () => {};

   if (!uvPath) throw new Error(t('uv_path_required_error'));

   function resolveUvPath(path) {
      try {
         return new URL(path).href;
      } catch {
         const base =
            (typeof document !== 'undefined' && document.baseURI && document.baseURI !== 'about:blank')
               ? document.baseURI
               : (typeof window !== 'undefined' && window.location && window.location.href && window.location.href !== 'about:blank')
                  ? window.location.href
                  : import.meta.url;
         return new URL(path, base).href;
      }
   }

   let uvData = null;
   let loadPromise = null;

   function ensureLoaded() {
      if (uvData) return Promise.resolve();
      if (loadPromise) return loadPromise;

      loadPromise = fetch(resolveUvPath(uvPath))
         .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
         })
         .then((data) => {
            uvData = data;
            log(t('uv_map_loaded_log', { landmarks: data.numLandmarks, triangles: data.numTriangles }));
         })
         .catch((err) => {
            console.error(t('console_uv_load_error'), err);
            log(t('uv_map_load_error_log', { message: err.message }));
            loadPromise = null;
         });

      return loadPromise;
   }

   // Cache: ogni modulo plugin ha la sua entry { canvas, key, size }.
   // WeakMap così non trattiene il modulo se viene scaricato (futuro hot-reload).
   const cache = new WeakMap();

   // ---- Region label map -------------------------------------------------

   // ID delle regioni. 0 = nessuna regione (pixel fuori dal volto).
   const REGION_IDS = {
      skin:    1,
      eyebrow: 2,
      eye:     3,
      lips:    4,
      iris:    5
   };
   const REGION_NAMES = Object.fromEntries(
      Object.entries(REGION_IDS).map(([n, id]) => [id, n])
   );
   const REGION_LIST = Object.keys(REGION_IDS);

   // Cache delle label maps: size → { labels: Uint8Array, size }
   const labelsBySize = new Map();
   // Cache delle mask binarie per spec dichiarativo: `${size}|${specHash}` → Canvas
   const maskCache = new Map();

   // Estrae cicli (loop chiusi e path aperti) da una lista di segmenti
   // {start, end} costruendo un grafo. Ogni componente connessa diventa una
   // sequenza ordinata di indici.
   function extractChains(segments) {
      const adj = new Map();
      for (const s of segments) {
         if (!adj.has(s.start)) adj.set(s.start, []);
         if (!adj.has(s.end))   adj.set(s.end,   []);
         adj.get(s.start).push(s.end);
         adj.get(s.end).push(s.start);
      }
      const visited = new Set();
      const chains = [];
      for (const start of adj.keys()) {
         if (visited.has(start)) continue;
         // Cerca un nodo di grado 1 (estremo di un path) per partire da lì,
         // altrimenti parti da `start` (loop chiuso).
         let entry = start;
         for (const n of adj.keys()) {
            if (!visited.has(n) && adj.get(n).length === 1) { entry = n; break; }
         }
         const chain = [entry];
         visited.add(entry);
         let current = entry;
         let prev = -1;
         while (true) {
            const neighbors = adj.get(current).filter(n => n !== prev);
            const next = neighbors.find(n => !visited.has(n));
            if (next == null) {
               // Verifica chiusura: se uno dei vicini è il punto di partenza
               // e abbiamo almeno 3 nodi, è un loop chiuso.
               const closing = neighbors.find(n => n === entry);
               if (closing != null && chain.length >= 3) chain.push(entry);
               break;
            }
            chain.push(next);
            visited.add(next);
            prev = current;
            current = next;
         }
         if (chain.length >= 2) chains.push(chain);
      }
      return chains;
   }

   function isClosedChain(chain) {
      return chain.length >= 4 && chain[0] === chain[chain.length - 1];
   }

   function fillChainOnCtx(ctx, chain, uv, size) {
      ctx.beginPath();
      for (let i = 0; i < chain.length; i++) {
         const p = uv[chain[i]];
         if (!p) continue;
         const x = p[0] * size, y = p[1] * size;
         if (i === 0) ctx.moveTo(x, y);
         else         ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
   }

   function strokeChainOnCtx(ctx, chain, uv, size, lineWidth) {
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < chain.length; i++) {
         const p = uv[chain[i]];
         if (!p) continue;
         const x = p[0] * size, y = p[1] * size;
         if (!started) { ctx.moveTo(x, y); started = true; }
         else          ctx.lineTo(x, y);
      }
      ctx.stroke();
   }

   // Costruisce la label map per `size`. Ogni regione viene rasterizzata su un
   // canvas temporaneo separato per evitare il color-mixing dell'anti-aliasing
   // (un pixel di edge tra eye e skin altrimenti darebbe un ID intermedio
   // sbagliato). Le regioni interne vengono passate dopo quelle esterne, così
   // sovrascrivono nel buffer labels finale. Outside-of-faceOval = 0.
   function buildLabels(size) {
      const faceLandmarker = getFaceLandmarker();
      if (!faceLandmarker || !uvData) return null;
      const uv = uvData.uv;

      const tmp = document.createElement('canvas');
      tmp.width = size;
      tmp.height = size;
      const tctx = tmp.getContext('2d', { willReadFrequently: true });
      tctx.fillStyle = 'white';
      tctx.strokeStyle = 'white';

      const STROKE_W = Math.max(4, Math.round(size * 0.04)); // ~4% del lato
      const labels = new Uint8Array(size * size);

      // Rasterizza i `segments` su `tmp` (in bianco) e marca con `regionId`
      // ogni pixel del buffer `labels` la cui alpha sul tmp supera 128.
      function paintAndLabel(regionId, segments) {
         if (!segments) return;
         tctx.clearRect(0, 0, size, size);
         const chains = extractChains(segments);
         for (const ch of chains) {
            if (isClosedChain(ch)) fillChainOnCtx(tctx, ch, uv, size);
            else                   strokeChainOnCtx(tctx, ch, uv, size, STROKE_W);
         }
         const img = tctx.getImageData(0, 0, size, size);
         const data = img.data;
         for (let i = 3, j = 0; j < labels.length; i += 4, j++) {
            if (data[i] > 128) labels[j] = regionId;
         }
      }

      // Ordine di pittura = ordine di sovrascrittura. Le interne vincono.
      paintAndLabel(REGION_IDS.skin,    faceLandmarker.FACE_LANDMARKS_FACE_OVAL);
      paintAndLabel(REGION_IDS.eyebrow, faceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW);
      paintAndLabel(REGION_IDS.eyebrow, faceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW);
      paintAndLabel(REGION_IDS.eye,     faceLandmarker.FACE_LANDMARKS_LEFT_EYE);
      paintAndLabel(REGION_IDS.eye,     faceLandmarker.FACE_LANDMARKS_RIGHT_EYE);
      paintAndLabel(REGION_IDS.lips,    faceLandmarker.FACE_LANDMARKS_LIPS);
      paintAndLabel(REGION_IDS.iris,    faceLandmarker.FACE_LANDMARKS_LEFT_IRIS);
      paintAndLabel(REGION_IDS.iris,    faceLandmarker.FACE_LANDMARKS_RIGHT_IRIS);

      // Diagnostica: conta i pixel etichettati per regione.
      const counts = {};
      for (let i = 0; i < labels.length; i++) {
         const id = labels[i];
         counts[id] = (counts[id] || 0) + 1;
      }
      const tot = labels.length;
      const pct = id => ((counts[id] || 0) / tot * 100).toFixed(1);
      log(
         `Label map ${size}×${size}: outside ${pct(0)}% · skin ${pct(REGION_IDS.skin)}% ` +
         `· eyebrow ${pct(REGION_IDS.eyebrow)}% · eye ${pct(REGION_IDS.eye)}% ` +
         `· lips ${pct(REGION_IDS.lips)}% · iris ${pct(REGION_IDS.iris)}%`
      );

      return { labels, size };
   }

   function ensureLabels(size) {
      let entry = labelsBySize.get(size);
      if (entry) return entry;
      entry = buildLabels(size);
      if (entry) labelsBySize.set(size, entry);
      return entry;
   }

   function buildHelpers(size) {
      const entry = ensureLabels(size);
      const labels = entry ? entry.labels : null;

      function regionAt(u, v) {
         if (!labels) return null;
         const px = Math.min(size - 1, Math.max(0, Math.floor(u * size)));
         const py = Math.min(size - 1, Math.max(0, Math.floor(v * size)));
         const id = labels[py * size + px];
         return id === 0 ? null : (REGION_NAMES[id] || null);
      }

      return {
         regionAt,
         labels,
         regions: REGION_IDS,
         regionsList: REGION_LIST.slice()
      };
   }

   // Mask binaria (RGBA con alpha = 255 dove la spec è soddisfatta) per
   // applicazione automatica via destination-in dopo paintUV.
   function getDeclarativeMask(size, spec) {
      if (!spec) return null;
      const include = Array.isArray(spec.include) ? spec.include
                    : (typeof spec.include === 'string' ? [spec.include] : null);
      const exclude = Array.isArray(spec.exclude) ? spec.exclude.slice() : [];
      if (!include && exclude.length === 0) return null;

      const key = `${size}|inc:${(include || ['*']).slice().sort().join(',')}|exc:${exclude.slice().sort().join(',')}`;
      const cached = maskCache.get(key);
      if (cached) return cached;

      const entry = ensureLabels(size);
      if (!entry) return null;
      const labels = entry.labels;

      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const mctx = c.getContext('2d');
      const img = mctx.createImageData(size, size);
      const data = img.data;

      const includeIds = include
         ? new Set(include.map(n => REGION_IDS[n]).filter(Boolean))
         : null;
      const excludeIds = new Set(exclude.map(n => REGION_IDS[n]).filter(Boolean));

      let included = 0;
      for (let i = 0, j = 0; j < labels.length; i += 4, j++) {
         const id = labels[j];
         const inIncluded = includeIds ? includeIds.has(id) : true;
         const inExcluded = excludeIds.has(id);
         if (inIncluded && !inExcluded) {
            data[i + 3] = 255;
            included++;
         } else {
            data[i + 3] = 0;
         }
      }
      // Fallback: se la spec non risulta in nessun pixel incluso (label map
      // costruita male o spec degenere), salta la mask invece di azzerare
      // tutta la texture. Loggiamo per diagnosi.
      if (included === 0) {
         log(`Mask region degenere (0 px inclusi) per spec ${JSON.stringify(spec)} - skip applicazione`);
         maskCache.set(key, null);
         return null;
      }
      mctx.putImageData(img, 0, 0);
      maskCache.set(key, c);
      return c;
   }

   function hashParams(params) {
      // Stringificazione deterministica: chiavi ordinate, valori numerici troncati.
      const keys = Object.keys(params || {}).sort();
      const parts = [];
      for (const k of keys) {
         const v = params[k];
         if (typeof v === 'number') parts.push(`${k}:${v.toFixed(6)}`);
         else parts.push(`${k}:${JSON.stringify(v)}`);
      }
      return parts.join('|');
   }

   // Proxy che warna in console quando il plugin legge una chiave di params
   // non dichiarata nello schema. Aiuta a smascherare typo (es. `min_pahse`).
   // Una sola warning per chiave per non spammare.
   function makeParamsProxy(module, values) {
      if (!Array.isArray(module.params)) return values;
      const declared = new Set(module.params.map(p => p.name));
      const warned = new Set();
      return new Proxy(values, {
         get(target, key) {
            if (typeof key === 'string' && !declared.has(key) && !warned.has(key)) {
               warned.add(key);
               console.warn(`[uv-renderer] plugin legge param non dichiarato: '${key}'`);
            }
            return target[key];
         }
      });
   }

   function ensureTexture(module, params) {
      const size = (typeof module.textureSize === 'number' && module.textureSize > 0)
         ? Math.round(module.textureSize)
         : 256;
      const key = `${size}#${hashParams(params)}`;
      let entry = cache.get(module);
      if (!entry || entry.key !== key || entry.size !== size) {
         if (!entry) {
            const c = document.createElement('canvas');
            c.width = size;
            c.height = size;
            entry = { canvas: c, ctx: c.getContext('2d'), key: '', size };
            cache.set(module, entry);
         } else if (entry.size !== size) {
            entry.canvas.width = size;
            entry.canvas.height = size;
            entry.size = size;
         }
         entry.ctx.clearRect(0, 0, size, size);
         try {
            const helpers = buildHelpers(size);
            const safeParams = makeParamsProxy(module, params);
            module.paintUV(entry.ctx, safeParams, helpers);
         } catch (err) {
            console.error(t('console_uv_paint_error'), err);
         }
         // Applica mask dichiarativa `region = { include, exclude }` se
         // dichiarata dal plugin. L'effetto è equivalente a un destination-in.
         const declarativeMask = getDeclarativeMask(size, module.region);
         if (declarativeMask) {
            const prev = entry.ctx.globalCompositeOperation;
            entry.ctx.globalCompositeOperation = 'destination-in';
            entry.ctx.drawImage(declarativeMask, 0, 0);
            entry.ctx.globalCompositeOperation = prev;
         }
         entry.key = key;
      }
      return entry;
   }

   function render(module, ctx, landmarks, params) {
      if (!module || typeof module.paintUV !== 'function') return;
      if (!uvData) { ensureLoaded(); return; }
      if (!landmarks || !ctx) return;

      const tex = ensureTexture(module, params || {});
      const texSize = tex.size;
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      const uv = uvData.uv;
      const tri = uvData.triangles;

      for (let i = 0; i < tri.length; i++) {
         const t = tri[i];
         const ia = t[0], ib = t[1], ic = t[2];
         const la = landmarks[ia], lb = landmarks[ib], lc = landmarks[ic];
         if (!la || !lb || !lc) continue;
         const ua = uv[ia], ub = uv[ib], uc = uv[ic];
         if (!ua || !ub || !uc) continue;

         const tAx = ua[0] * texSize, tAy = ua[1] * texSize;
         const tBx = ub[0] * texSize, tBy = ub[1] * texSize;
         const tCx = uc[0] * texSize, tCy = uc[1] * texSize;
         const sAx = la.x * w, sAy = la.y * h;
         const sBx = lb.x * w, sBy = lb.y * h;
         const sCx = lc.x * w, sCy = lc.y * h;

         // Affine 3-point: M tale che M*(t_i) = s_i per i in {A,B,C}
         const det = (tAx - tCx) * (tBy - tCy) - (tBx - tCx) * (tAy - tCy);
         if (Math.abs(det) < 1e-6) continue;

         const inv = 1 / det;
         const m11 = ((sAx - sCx) * (tBy - tCy) - (sBx - sCx) * (tAy - tCy)) * inv;
         const m12 = ((sBx - sCx) * (tAx - tCx) - (sAx - sCx) * (tBx - tCx)) * inv;
         const m13 = sCx - m11 * tCx - m12 * tCy;
         const m21 = ((sAy - sCy) * (tBy - tCy) - (sBy - sCy) * (tAy - tCy)) * inv;
         const m22 = ((sBy - sCy) * (tAx - tCx) - (sAy - sCy) * (tBx - tCx)) * inv;
         const m23 = sCy - m21 * tCx - m22 * tCy;

         ctx.save();
         ctx.beginPath();
         ctx.moveTo(sAx, sAy);
         ctx.lineTo(sBx, sBy);
         ctx.lineTo(sCx, sCy);
         ctx.closePath();
         ctx.clip();
         // Canvas setTransform(a,b,c,d,e,f) usa la matrice [a c e; b d f; 0 0 1]
         ctx.setTransform(m11, m21, m12, m22, m13, m23);
         ctx.drawImage(tex.canvas, 0, 0);
         ctx.restore();
      }
   }

   return {
      ensureLoaded,
      render
   };
}
