/**
 * @module realtime-gallery
 * @description
 * Stores, renders and exports spike captures.
 *
 * STORAGE. IndexedDB, not localStorage. localStorage caps around 5MB per
 * origin, is shared with the baseline, the settings and the existing thumbnail
 * store, and inflates binary by a third on the way through base64 — a 640x480
 * JPEG lands near 70KB encoded, so the quota starts evicting things you care
 * about after roughly fifty frames. IndexedDB takes Blobs natively.
 *
 * PRIVACY. This module is the point where the tool starts holding photographs
 * of a face rather than a 128-d template. Everything stays on the device, the
 * count is always visible in the settings bar, and "Delete all" really empties
 * the store. Deleting the baseline deliberately does NOT clear captures: the
 * gallery is expected to outlive a re-baseline, and that is stated in the UI
 * rather than left to be inferred.
 *
 * EXPORT. Store-only ZIP written here in ~70 lines. JPEGs do not compress, so
 * DEFLATE would buy nothing, and pulling in JSZip would put a third-party
 * script on a page whose whole point is that it makes no third-party requests.
 */

const DB_NAME = 'gstmxx-realtime';
const DB_VERSION = 1;
const STORE = 'captures';

/**
 * Opens (and upgrades) the capture database.
 *
 * @returns {Promise<IDBDatabase>} Open database handle.
 */
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('t', 't');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Runs one transaction against the capture store.
 *
 * @param {IDBDatabase} db Open database.
 * @param {IDBTransactionMode} mode Transaction mode.
 * @param {(store: IDBObjectStore) => IDBRequest} work Callback issuing the request.
 * @returns {Promise<*>} Request result.
 */
function run(db, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Formats a timestamp for watermarks and filenames.
 *
 * @param {number} timestamp Epoch milliseconds.
 * @param {boolean} [fileSafe] Whether to avoid characters illegal in filenames.
 * @returns {string} Formatted stamp.
 */
function stamp(timestamp, fileSafe = false) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${fileSafe ? '' : ':'}${pad(d.getMinutes())}${fileSafe ? '' : ':'}${pad(d.getSeconds())}`;
  return fileSafe ? `${date}_${time}` : `${date} ${time}`;
}

/**
 * Burns provenance into the frame.
 *
 * The measurement travels with the image on purpose. An exported frame carrying
 * only a date is a selfie; one carrying the distance, the measured noise floor
 * and the threshold it was judged against is a record.
 *
 * @param {HTMLCanvasElement} source Frame to watermark.
 * @param {object} meta Measurement metadata.
 * @param {number} meta.t Capture timestamp.
 * @param {number} meta.distance Distance at capture.
 * @param {number} meta.noiseFloor Measured session noise floor.
 * @param {number} meta.threshold Cited match threshold.
 * @returns {HTMLCanvasElement} Watermarked canvas.
 */
export function watermark(source, meta) {
  const barHeight = Math.max(26, Math.round(source.height * 0.062));
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height + barHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0);

  ctx.fillStyle = '#0c0906';
  ctx.fillRect(0, source.height, canvas.width, barHeight);

  const fontSize = Math.max(10, Math.round(barHeight * 0.42));
  ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const y = source.height + barHeight / 2;
  ctx.fillStyle = '#ffe7a8';
  ctx.fillText('ghostmaxxing', 12, y);

  const detail = [
    stamp(meta.t),
    `d=${meta.distance.toFixed(3)}`,
    `noise ±${meta.noiseFloor.toFixed(3)}`,
    `dlib t=${meta.threshold.toFixed(2)}`,
  ].join('  ·  ');

  ctx.fillStyle = '#b9a892';
  ctx.textAlign = 'right';
  ctx.fillText(detail, canvas.width - 12, y);

  return canvas;
}

/**
 * Encodes a canvas to a Blob.
 *
 * @param {HTMLCanvasElement} canvas Canvas to encode.
 * @param {string} type MIME type.
 * @param {number} [quality] Encoder quality for lossy types.
 * @returns {Promise<Blob>} Encoded blob.
 */
function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed'))),
      type,
      quality,
    );
  });
}

/* --- Store-only ZIP -------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * Computes a CRC-32 checksum.
 *
 * @param {Uint8Array} bytes Input bytes.
 * @returns {number} Unsigned checksum.
 */
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Encodes a date as a DOS time/date pair.
 *
 * @param {Date} date Source date.
 * @returns {{time: number, date: number}} DOS fields.
 */
function dosDate(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * Builds an uncompressed ZIP archive.
 *
 * @param {Array<{name: string, bytes: Uint8Array, date: Date}>} files Archive members.
 * @returns {Blob} ZIP blob.
 */
export function buildZip(files) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const checksum = crc32(file.bytes);
    const { time, date } = dosDate(file.date);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, file.bytes.length, true);
    lv.setUint32(22, file.bytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, file.bytes.length, true);
    cv.setUint32(24, file.bytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local, file.bytes);
    centrals.push(central);
    offset += local.length + file.bytes.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
}

/**
 * Triggers a browser download for a blob.
 *
 * @param {Blob} blob Payload.
 * @param {string} filename Suggested filename.
 * @returns {void}
 */
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Creates the gallery controller.
 *
 * @param {object} options Wiring options.
 * @param {HTMLElement} options.viewerEl Viewer overlay root.
 * @param {HTMLImageElement} options.imageEl Viewer image element.
 * @param {HTMLElement} options.metaEl Viewer metadata line.
 * @param {HTMLElement} options.countEl Settings-bar count element.
 * @param {(count: number) => void} options.onCountChange Count change callback.
 * @param {(captureId: string) => void} options.onDelete Deletion callback.
 * @param {(message: string) => void} options.onStatus Status message callback.
 * @returns {object} Gallery controller.
 */
export function createGallery(options) {
  const { viewerEl, imageEl, metaEl, countEl, onCountChange, onDelete, onStatus } = options;

  let db = null;
  let count = 0;
  let openId = null;
  let openUrl = null;

  /**
   * Publishes the current capture count.
   *
   * @returns {void}
   */
  function publishCount() {
    if (countEl) countEl.textContent = String(count);
    if (typeof onCountChange === 'function') onCountChange(count);
  }

  /**
   * Opens the database and reads the current count.
   *
   * @returns {Promise<void>}
   */
  async function init() {
    db = await openDb();
    count = await run(db, 'readonly', (store) => store.count());
    publishCount();
  }

  /**
   * Watermarks, encodes and stores one captured frame.
   *
   * @param {HTMLCanvasElement} frame Raw captured frame.
   * @param {object} meta Measurement metadata.
   * @returns {Promise<string>} Stored capture id.
   */
  async function save(frame, meta) {
    if (!db) throw new Error('Gallery not ready');
    const marked = watermark(frame, meta);
    const blob = await toBlob(marked, 'image/jpeg', 0.85);
    const id = `cap_${meta.t}_${Math.random().toString(36).slice(2, 7)}`;

    await run(db, 'readwrite', (store) =>
      store.put({
        id,
        t: meta.t,
        distance: meta.distance,
        noiseFloor: meta.noiseFloor,
        threshold: meta.threshold,
        kind: meta.kind || 'manual',
        blob,
      }),
    );

    count += 1;
    publishCount();
    return id;
  }

  /**
   * Displays one stored capture over the video stage.
   *
   * @param {string} id Capture id.
   * @returns {Promise<void>}
   */
  async function open(id) {
    if (!db) return;
    const record = await run(db, 'readonly', (store) => store.get(id));
    if (!record) return;

    if (openUrl) URL.revokeObjectURL(openUrl);
    openUrl = URL.createObjectURL(record.blob);
    openId = id;

    imageEl.src = openUrl;
    metaEl.textContent = `${stamp(record.t)}  ·  d=${record.distance.toFixed(3)}  ·  noise ±${record.noiseFloor.toFixed(3)}  ·  ${record.kind}`;
    viewerEl.hidden = false;
  }

  /**
   * Closes the viewer overlay and releases its object URL.
   *
   * @returns {void}
   */
  function close() {
    viewerEl.hidden = true;
    imageEl.removeAttribute('src');
    if (openUrl) {
      URL.revokeObjectURL(openUrl);
      openUrl = null;
    }
    openId = null;
  }

  /**
   * Copies the open capture to the clipboard.
   *
   * The Clipboard API only reliably accepts PNG, so the JPEG is re-encoded on
   * the way out. Falls back to a download where the API is unavailable.
   *
   * @returns {Promise<void>}
   */
  async function copyOpen() {
    if (!db || !openId) return;
    const record = await run(db, 'readonly', (store) => store.get(openId));
    if (!record) return;

    try {
      const bitmap = await createImageBitmap(record.blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      const png = await toBlob(canvas, 'image/png');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      onStatus('Capture copied to the clipboard.');
    } catch {
      download(record.blob, `ghostmaxxing_${stamp(record.t, true)}.jpg`);
      onStatus('Clipboard unavailable — downloaded instead.');
    }
  }

  /**
   * Downloads the open capture.
   *
   * @returns {Promise<void>}
   */
  async function downloadOpen() {
    if (!db || !openId) return;
    const record = await run(db, 'readonly', (store) => store.get(openId));
    if (!record) return;
    download(record.blob, `ghostmaxxing_${stamp(record.t, true)}.jpg`);
  }

  /**
   * Deletes the open capture.
   *
   * @returns {Promise<void>}
   */
  async function deleteOpen() {
    if (!db || !openId) return;
    const id = openId;
    await run(db, 'readwrite', (store) => store.delete(id));
    count = Math.max(0, count - 1);
    publishCount();
    close();
    if (typeof onDelete === 'function') onDelete(id);
    onStatus('Capture deleted.');
  }

  /**
   * Exports every stored capture as one uncompressed archive.
   *
   * @returns {Promise<void>}
   */
  async function downloadAll() {
    if (!db || !count) return;
    onStatus('Building archive…');
    const records = await run(db, 'readonly', (store) => store.getAll());
    records.sort((a, b) => a.t - b.t);

    const files = [];
    for (const record of records) {
      const bytes = new Uint8Array(await record.blob.arrayBuffer());
      files.push({
        name: `ghostmaxxing_${stamp(record.t, true)}_d${record.distance.toFixed(3)}.jpg`,
        bytes,
        date: new Date(record.t),
      });
    }

    download(buildZip(files), `ghostmaxxing_captures_${stamp(Date.now(), true)}.zip`);
    onStatus(`Exported ${files.length} capture${files.length === 1 ? '' : 's'}.`);
  }

  /**
   * Empties the capture store.
   *
   * @returns {Promise<void>}
   */
  async function deleteAll() {
    if (!db) return;
    await run(db, 'readwrite', (store) => store.clear());
    count = 0;
    publishCount();
    close();
    if (typeof onDelete === 'function') onDelete(null);
    onStatus('All captures deleted from this device.');
  }

  return {
    init,
    save,
    open,
    close,
    copyOpen,
    downloadOpen,
    deleteOpen,
    downloadAll,
    deleteAll,
    /**
     * Reports how many captures are stored.
     *
     * @returns {number} Capture count.
     */
    size() {
      return count;
    },
    /**
     * Reports whether the viewer overlay is showing.
     *
     * @returns {boolean} True while open.
     */
    isOpen() {
      return !viewerEl.hidden;
    },
  };
}
