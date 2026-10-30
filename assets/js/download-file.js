/**
 * Download helpers tuned to reduce Storage Egress:
 * - small/medium files: stream once with progress, then save locally
 * - large files: open signed URL once (browser handles transfer; no second blob copy in JS)
 * - in-tab blob cache avoids re-fetching the same URL in the same session
 */

const blobCache = new Map();
const LARGE_FILE_BYTES = 6 * 1024 * 1024; // 6 MB

export async function fetchBlobWithProgress(url, onProgress, { signal } = {}) {
  if (blobCache.has(url)) {
    const cached = blobCache.get(url);
    if (typeof onProgress === 'function') onProgress(1, cached.size, cached.size);
    return cached;
  }

  const res = await fetch(url, {
    mode: 'cors',
    credentials: 'omit',
    cache: 'force-cache',
    signal
  });
  if (!res.ok) throw new Error('تعذر تحميل الملف (' + res.status + ')');

  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !res.body.getReader) {
    const blob = await res.blob();
    blobCache.set(url, blob);
    if (typeof onProgress === 'function') onProgress(1, blob.size, blob.size);
    return blob;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (typeof onProgress === 'function') {
      const ratio = total > 0 ? Math.min(1, received / total) : null;
      onProgress(ratio, received, total);
    }
  }

  if (typeof onProgress === 'function') onProgress(1, received, total || received);
  const blob = new Blob(chunks);
  // Cap memory: only cache blobs under 12MB
  if (blob.size <= 12 * 1024 * 1024) blobCache.set(url, blob);
  return blob;
}

export function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename || 'download';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

/** One network transfer: let the browser open/save the signed URL. */
export function openUrlForDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function ensureDownloadOverlay() {
  let el = document.getElementById('nusc-dl-overlay');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'nusc-dl-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'جاري تنزيل الملف');
  el.innerHTML = `
    <div class="nusc-dl-card">
      <div class="nusc-dl-spinner" aria-hidden="true"></div>
      <p class="nusc-dl-title">جاري تنزيل الملف…</p>
      <div class="nusc-dl-bar"><div class="nusc-dl-bar-fill" id="nusc-dl-fill"></div></div>
      <p class="nusc-dl-pct" id="nusc-dl-pct">0%</p>
      <p class="nusc-dl-hint">استنى لحد ما يوصل 100٪ — الملف بينزل بعد ما يخلص.</p>
    </div>`;
  document.body.appendChild(el);
  return el;
}

export function showDownloadOverlay() {
  const el = ensureDownloadOverlay();
  el.classList.add('is-visible');
  const fill = document.getElementById('nusc-dl-fill');
  const pct = document.getElementById('nusc-dl-pct');
  if (fill) fill.style.width = '0%';
  if (pct) pct.textContent = '0%';
  return el;
}

export function updateDownloadOverlay(ratio, received, total) {
  const fill = document.getElementById('nusc-dl-fill');
  const pct = document.getElementById('nusc-dl-pct');
  if (ratio == null || Number.isNaN(ratio)) {
    if (pct) pct.textContent = received ? `تم تحميل ${formatBytes(received)}` : 'جاري التحميل…';
    if (fill) {
      fill.style.width = '40%';
      fill.classList.add('is-indeterminate');
    }
    return;
  }
  const p = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  if (fill) {
    fill.classList.remove('is-indeterminate');
    fill.style.width = p + '%';
  }
  if (pct) {
    const extra = total ? ` · ${formatBytes(received)} / ${formatBytes(total)}` : '';
    pct.textContent = p + '%' + extra;
  }
}

export function hideDownloadOverlay() {
  const el = document.getElementById('nusc-dl-overlay');
  if (el) el.classList.remove('is-visible');
}

function formatBytes(n) {
  if (!n || n < 1024) return (n || 0) + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * @param {{ url: string, filename?: string, button?: HTMLElement, fileSize?: number }} opts
 */
export async function downloadFileComplete({ url, filename, button, fileSize }) {
  if (!url) throw new Error('مفيش رابط للتنزيل');

  const spinner = button?.querySelector('.dl-spinner');
  const icon = button?.querySelector('[data-icon]');
  const label = button?.querySelector('.material-dl-label');

  const knownSize = Number(fileSize) || 0;
  // Large files: one transfer via browser tab (no second in-memory full copy)
  if (knownSize >= LARGE_FILE_BYTES && !blobCache.has(url)) {
    try {
      if (button) button.disabled = true;
      openUrlForDownload(url, filename);
    } finally {
      if (button) button.disabled = false;
    }
    return;
  }

  try {
    if (button) {
      button.disabled = true;
      button.classList.add('is-loading');
    }
    if (spinner) spinner.classList.remove('hidden');
    if (icon) icon.classList.add('hidden');
    if (label) label.textContent = 'جاري…';

    showDownloadOverlay();
    updateDownloadOverlay(0, 0, 0);

    const blob = await fetchBlobWithProgress(url, (ratio, received, total) => {
      updateDownloadOverlay(ratio, received, total);
    });

    updateDownloadOverlay(1, blob.size, blob.size);
    await new Promise((r) => setTimeout(r, 200));
    triggerBlobDownload(blob, filename);
  } finally {
    hideDownloadOverlay();
    if (button) {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
    if (spinner) spinner.classList.add('hidden');
    if (icon) icon.classList.remove('hidden');
    if (label) label.textContent = 'تنزيل';
  }
}
