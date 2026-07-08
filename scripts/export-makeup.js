import { state } from './state.js';
import { els } from './dom.js';
import { setLog } from './utils.js';
import { t } from './i18n.js';

const EXPORT_LAYOUT = {
   headerHeight: 44,
   footerHeight: 50,
   backgroundColor: '#0f1115',
   defaultTextColor: '#eef2ff',
   successTextColor: '#3ddc97',
   errorTextColor: '#ff7a7a'
};

const EXPORT_COPY = {
   filename: 'ghostati-makeup.png',
   mimeType: 'image/png',
   shareTitle: 'Ghostmaxxing Makeup',
   shareText: 'Learn some adversarial makeup techniques!',
   headerPrefix: 'https://github.com/vecna/ghostati',
   reportUrl: 'https://vecna.eu/ghostmaxxing//'
};

/**
 * Coordinates the Copy Makeup button workflow. It gathers the current
 * Ghostmaxxing export source, renders the diagnostic header/footer around it,
 * converts the result to PNG, and then tries Clipboard first with Web Share as
 * a fallback. This is the only function in the module that reads the live
 * application globals and writes user-visible status messages through `setLog`;
 * the exported helper functions stay small so the rendering and delivery
 * decisions can be unit-tested independently.
 *
 * @returns {Promise<void>} Resolves after the image is copied, shared, skipped, or an error is logged.
 * @see main - Registered as the `copyMakeupBtn` click handler.
 * @see collectExportInput - Builds the export model from app state and DOM handles.
 * @see renderExportCanvas - Produces the PNG source canvas with report chrome.
 * @see copyBlobToClipboard - First delivery path attempted by this workflow.
 * @see shareImageFile - Fallback delivery path when clipboard write fails.
 */
export async function exportMakeup() {
   const imgInfo = collectExportInput(state, els);
   if (!imgInfo.sourceCanvas) return;

   try {
      const exportCanvas = renderExportCanvas(imgInfo, EXPORT_LAYOUT);
      const blob = await canvasToBlob(exportCanvas);

      try {
         await copyBlobToClipboard(blob);
         setLog(t('image_copied_log'));
         return;
      } catch (err) {
         console.error(t('console_clipboard_fallback'), err);
      }

      const file = makeImageFile(blob, EXPORT_COPY);

      try {
         await shareImageFile(file, EXPORT_COPY);
         setLog(t('image_shared_log'));
      } catch (err) {
         console.error(t('console_share_failed'), err);
         setLog(t('image_copy_unavailable_log'));
      }
   } catch (err) {
      console.error(err);
      setLog(t('image_copy_error_log'));
   }
}

/**
 * Builds the data model for a makeup export from the current app state and DOM.
 * It prefers the last efficacy composite when available, otherwise it creates a
 * live composite from the webcam and overlay layers so the Copy button still
 * returns a useful image when no active Ghostyle result has been produced.
 *
 * @param {object} appState - Current Ghostmaxxing state object.
 * @param {HTMLCanvasElement|null} [appState.lastCompositedCanvas] - Most recent efficacy composite, if one exists.
 * @param {boolean} appState.isMirrored - Whether the exported source should be mirrored.
 * @param {Map<string, object>} appState.loadedGhostyles - Loaded Ghostyle records keyed by id.
 * @param {string|null} appState.activeEffect - Currently active Ghostyle id.
 * @param {object} domEls - DOM handles collected by `dom.js`.
 * @param {HTMLElement} [domEls.logBox] - Log container whose last child becomes footer text.
 * @returns {{sourceCanvas: HTMLCanvasElement|null, isMirrored: boolean, pluginName: string, logText: string}} Export input for rendering.
 * @see exportMakeup - Calls this before rendering or delivery.
 * @see buildLiveComposite - Provides the fallback source canvas when no efficacy composite exists.
 */
export function collectExportInput(appState, domEls) {
   const style = appState.loadedGhostyles.get(appState.activeEffect);

   const sourceCanvas = appState.lastCompositedCanvas || buildLiveComposite(domEls);

   return {
      sourceCanvas,
      isMirrored: appState.isMirrored,
      pluginName: style ? style.name : 'Nessun Ghostyle',
      logText: getLatestLogText(domEls.logBox)
   };
}

/**
 * Composites the visible lab layers into a single source canvas in overlay
 * pixel space: webcam frame, 2D effect overlay, 3D mesh overlay, then bbox/label
 * overlay. Mirroring is intentionally left for `drawSourceImage`, matching the
 * efficacy export path and preserving readable bbox labels.
 *
 * @param {object} domEls - DOM handles collected by `dom.js`.
 * @param {HTMLCanvasElement} domEls.overlay - Main 2D effect overlay canvas.
 * @param {HTMLVideoElement} [domEls.video] - Webcam video element.
 * @returns {HTMLCanvasElement|null} Composite canvas, or null when the overlay is unavailable.
 * @see collectExportInput - Uses this as the copy source when `lastCompositedCanvas` is empty.
 * @see drawSourceImage - Applies the global mirror transform after this raw composite is built.
 */
function buildLiveComposite(domEls) {
   const overlay = domEls.overlay;
   if (!overlay || !overlay.width || !overlay.height) return null;

   const w = overlay.width, h = overlay.height;
   const c = document.createElement('canvas');
   c.width = w;
   c.height = h;
   const ctx = c.getContext('2d');
   if (!ctx) return null;

   const video = domEls.video;
   if (video && video.readyState >= 2) {
      try { ctx.drawImage(video, 0, 0, w, h); } catch (_) { /* not ready */ }
   }

   // z-order matches the DOM stacking: #overlay (2D) < #mesh3dOverlay (3D) < #bboxOverlay
   const overlays = [overlay, document.getElementById('mesh3dOverlay'), document.getElementById('bboxOverlay')];
   for (const layer of overlays) {
      if (layer && layer.width && layer.height) {
         try { ctx.drawImage(layer, 0, 0, w, h); } catch (_) { /* skip */ }
      }
   }
   return c;
}

/**
 * Reads the newest diagnostic line from the app log for use as the export
 * footer, preserving the same concise status text the user saw in the lab UI.
 *
 * @param {HTMLElement} logBox - Log container rendered by the application.
 * @returns {string} Text from the latest log entry, or an empty string.
 * @see collectExportInput - Stores the value as `logText` for footer rendering.
 */
function getLatestLogText(logBox) {
   return logBox.lastChild ? logBox.lastChild.textContent : '';
}

/**
 * Allocates and paints the final export image: opaque background, source image,
 * diagnostic header, and latest-log footer. The output canvas is taller than
 * the source canvas because it includes the report chrome used by shared PNGs.
 *
 * @param {object} input - Export input collected from app state and DOM.
 * @param {HTMLCanvasElement} input.sourceCanvas - Source image to place between header and footer.
 * @param {boolean} input.isMirrored - Whether the source image should be horizontally flipped.
 * @param {string} input.pluginName - Active Ghostyle name for the header.
 * @param {string} input.logText - Latest diagnostic log line for the footer.
 * @param {object} layout - Export layout and color settings.
 * @returns {HTMLCanvasElement} Rendered export canvas ready for PNG conversion.
 * @throws {Error} When a 2D canvas context cannot be created.
 * @see exportMakeup - Converts this canvas to a blob for delivery.
 * @see drawSourceImage - Draws the captured makeup image.
 * @see drawHeader - Draws the Ghostyle/report header.
 * @see drawFooter - Draws the diagnostic footer.
 */
function renderExportCanvas(input, layout) {
   const canvas = document.createElement('canvas');

   canvas.width = input.sourceCanvas.width;
   canvas.height = input.sourceCanvas.height + layout.headerHeight + layout.footerHeight;

   const ctx = canvas.getContext('2d');
   if (!ctx) {
      throw new Error(t('canvas_2d_context_error'));
   }

   ctx.fillStyle = EXPORT_LAYOUT.backgroundColor;
   ctx.fillRect(0, 0, canvas.width, canvas.height);

   drawSourceImage(ctx, { canvas, input, layout });
   drawHeader(ctx, { canvas, input, layout });
   drawFooter(ctx, { canvas, input, layout });

   return canvas;
}


/**
 * Places the captured makeup image into the final export canvas, flipping the
 * whole source when the webcam is mirrored so the shared PNG matches the user's
 * current lab view.
 *
 * @param {CanvasRenderingContext2D} ctx - Export canvas rendering context.
 * @param {object} data - Rendering bundle for the current export.
 * @param {HTMLCanvasElement} data.canvas - Final export canvas.
 * @param {object} data.input - Export input collected from the app.
 * @param {object} data.layout - Header/footer layout settings.
 * @returns {void}
 * @see renderExportCanvas - Calls this before drawing report text.
 */
function drawSourceImage(ctx, data) {
   const { canvas, input, layout } = data;

   if (!input.isMirrored) {
      ctx.drawImage(input.sourceCanvas, 0, layout.headerHeight);
      return;
   }

   ctx.save();
   ctx.translate(canvas.width, 0);
   ctx.scale(-1, 1);
   ctx.drawImage(input.sourceCanvas, 0, layout.headerHeight);
   ctx.restore();
}

/**
 * Draws the top report line containing the project URL, active Ghostyle module,
 * and report URL. This makes exported makeup images self-identifying when they
 * are copied or shared outside the lab UI.
 *
 * @param {CanvasRenderingContext2D} ctx - Export canvas rendering context.
 * @param {object} data - Rendering bundle for the current export.
 * @param {HTMLCanvasElement} data.canvas - Final export canvas.
 * @param {object} data.input - Export input collected from the app.
 * @param {object} data.layout - Header/footer layout settings.
 * @returns {void}
 * @see renderExportCanvas - Calls this after the source image is drawn.
 * @see buildHeaderText - Builds the actual header string.
 */
function drawHeader(ctx, data) {
   const { canvas, input, layout } = data;

   ctx.fillStyle = layout.defaultTextColor;
   ctx.textAlign = 'center';
   ctx.textBaseline = 'middle';
   ctx.font = 'bold 14px Inter, sans-serif';

   ctx.fillText(
      buildHeaderText(input.pluginName),
      canvas.width / 2,
      layout.headerHeight / 2
   );
}

/**
 * Builds the export header copy shown above the makeup image, binding the
 * active Ghostyle name to the Ghostmaxxing source and report links.
 *
 * @param {string} pluginName - Human-readable active Ghostyle name.
 * @returns {string} Header text for the exported PNG.
 * @see drawHeader - Renders this text onto the export canvas.
 */
export function buildHeaderText(pluginName) {
   return `${EXPORT_COPY.headerPrefix} | Modulo: ${pluginName} | URL: ${EXPORT_COPY.reportUrl}`;
}

/**
 * Draws the latest diagnostic log line below the exported image. The footer
 * color reflects whether the last known effect result had a detection, keeping
 * successful and failed diagnostic outcomes visually distinct in the shared PNG.
 *
 * @param {CanvasRenderingContext2D} ctx - Export canvas rendering context.
 * @param {object} data - Rendering bundle for the current export.
 * @param {HTMLCanvasElement} data.canvas - Final export canvas.
 * @param {object} data.input - Export input collected from the app.
 * @param {object} data.layout - Header/footer layout settings.
 * @returns {void}
 * @see renderExportCanvas - Calls this as the final drawing step.
 */
function drawFooter(ctx, data) {
   const { canvas, input, layout } = data;
   
   ctx.fillStyle = state.lastKnownEffectResult && state.lastKnownEffectResult.detection ? EXPORT_LAYOUT.successTextColor : EXPORT_LAYOUT.errorTextColor;
   ctx.textAlign = 'center';
   ctx.textBaseline = 'middle';
   ctx.font = '14px Inter, sans-serif';

   ctx.fillText(
      input.logText,
      canvas.width / 2,
      canvas.height - layout.footerHeight / 2
   );
}

/**
 * Converts the rendered export canvas into the PNG blob delivered to Clipboard
 * or Web Share, treating a null browser callback as an export failure.
 *
 * @param {HTMLCanvasElement} canvas - Final export canvas.
 * @returns {Promise<Blob>} PNG blob generated from the canvas.
 * @see exportMakeup - Awaits this before clipboard/share delivery.
 */
function canvasToBlob(canvas) {
   return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
         if (blob) {
            resolve(blob);
            return;
         }

         reject(new Error('Canvas export returned an empty blob.'));
      }, EXPORT_COPY.mimeType);
   });
}

/**
 * Wraps the exported PNG blob in a browser `File` with the configured filename
 * and MIME type so the Web Share API can receive it.
 *
 * @param {Blob} blob - PNG blob generated from the export canvas.
 * @param {object} copy - Export copy and file metadata.
 * @param {string} copy.filename - Filename for the shared image.
 * @param {string} copy.mimeType - MIME type for the image file.
 * @returns {File} Shareable image file.
 * @see exportMakeup - Creates this file before invoking the Share API fallback.
 * @see shareImageFile - Delivers the returned file when sharing is supported.
 */
export function makeImageFile(blob, copy) {
   return new File([blob], copy.filename, { type: copy.mimeType });
}

/**
 * Writes the exported PNG blob to the browser clipboard using `ClipboardItem`.
 * This is the primary delivery path for the Copy Makeup action.
 *
 * @param {Blob} blob - PNG blob generated from the export canvas.
 * @returns {Promise<void>} Resolves when the browser accepts the clipboard write.
 * @see exportMakeup - Attempts this before falling back to Web Share.
 * @see canUseClipboard - Guards Clipboard API support before writing.
 */
function copyBlobToClipboard(blob) {
   if (!canUseClipboard(navigator)) {
      return Promise.reject(new Error('Clipboard API not available.'));
   }

   const item = new ClipboardItem({ [EXPORT_COPY.mimeType]: blob });
   return navigator.clipboard.write([item]);
}

/**
 * Checks whether the current browser navigator exposes the image clipboard
 * pieces needed by the Copy Makeup workflow.
 *
 * @param {Navigator|object} browserNavigator - Browser navigator or test double.
 * @returns {boolean} True when `clipboard.write` and `ClipboardItem` are available.
 * @see copyBlobToClipboard - Uses this before constructing a clipboard item.
 */
export function canUseClipboard(browserNavigator) {
   return Boolean(
      browserNavigator.clipboard &&
      browserNavigator.clipboard.write &&
      window.ClipboardItem
   );
}

/**
 * Shares the exported makeup PNG through the Web Share API when clipboard
 * delivery fails, preserving the same project title and explanatory share text.
 *
 * @param {File} file - Exported makeup PNG file.
 * @param {object} copy - Share title, text, and file metadata.
 * @param {string} copy.shareTitle - Title passed to the Web Share API.
 * @param {string} copy.shareText - Text passed to the Web Share API.
 * @returns {Promise<void>} Resolves when the browser accepts the share request.
 * @see exportMakeup - Calls this as the fallback after clipboard failure.
 * @see canShareFile - Guards Web Share support before invoking `navigator.share`.
 */
function shareImageFile(file, copy) {
   if (!canShareFile(file)) {
      return Promise.reject(new Error('Share API not available for this file.'));
   }

   return navigator.share({
      title: copy.shareTitle,
      text: copy.shareText,
      files: [file]
   });
}

/**
 * Checks whether the browser can share the generated makeup PNG. Browsers with
 * `navigator.share` but no `navigator.canShare` are treated as share-capable,
 * matching the fallback behavior expected by the lab UI.
 *
 * @param {File} file - Exported makeup PNG file.
 * @returns {boolean} True when the Share API can be attempted for this file.
 * @see shareImageFile - Uses this before calling `navigator.share`.
 */
export function canShareFile(file) {
   if (!navigator.share) return false;

   if (!navigator.canShare) return true;

   return navigator.canShare({ files: [file] });
}
