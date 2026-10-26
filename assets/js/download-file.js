/**
 * Download a remote file fully, then save locally.
 * Shows progress overlay; never navigates away until 100%.
 */
export async function fetchBlobWithProgress(url, onProgress) {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error('تعذر تحميل الملف (' + res.status + ')');

  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !res.body.getReader) {
    const blob = await res.blob();
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
  return new Blob(chunks);
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

/** Full flow: URL → progress overlay → save only at 100%. */
export async function downloadFileComplete({ url, filename, button }) {
  if (!url) throw new Error('مفيش رابط للتنزيل');

  const spinner = button?.querySelector('.dl-spinner');
  const icon = button?.querySelector('[data-icon]');
  const label = button?.querySelector('.material-dl-label');

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
    // brief beat so user sees 100%
    await new Promise((r) => setTimeout(r, 250));
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
