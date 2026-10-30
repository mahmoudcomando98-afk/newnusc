/**
 * In-app file viewer — egress-conscious:
 * - metadata only on load (no Storage bytes)
 * - signed URL + PDF/image only after explicit «عرض الملف»
 * - PDF pages rendered progressively (range-friendly)
 */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, showToast, initIcons, formatFileSize, timeAgo } from './utils.js';
import { downloadFileComplete } from './download-file.js';
import { getSignedMaterialUrl } from './signed-url-cache.js';

const params = new URLSearchParams(window.location.search);
const materialId = params.get('id');

const PDFJS_VERSION = '4.4.168';
const PDFJS_MAIN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

let signedFileUrl = null;
let materialMeta = null;
let viewStarted = false;
let pdfDoc = null;
let pagesRendered = 0;

function shortFileType(raw) {
  if (!raw) return '';
  const s = String(raw).toLowerCase();
  if (s.includes('pdf')) return 'PDF';
  if (s.includes('word') || s.includes('doc')) return 'Word';
  if (s.includes('ppt')) return 'PowerPoint';
  if (s.includes('xls')) return 'Excel';
  if (s.includes('png') || s.includes('jpg') || s.includes('jpeg') || s.includes('webp') || s.includes('image'))
    return 'صورة';
  if (s.includes('/')) return s.split('/').pop().toUpperCase().slice(0, 8);
  return String(raw).slice(0, 12);
}

function isPdf(type, path, name) {
  const t = String(type || '').toLowerCase();
  const p = String(path || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  return t.includes('pdf') || p.endsWith('.pdf') || n.endsWith('.pdf');
}

function isImage(type, path, name) {
  const t = String(type || '').toLowerCase();
  const p = String(path || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  return t.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(p) || /\.(png|jpe?g|webp|gif)$/i.test(n);
}

function setLoading(viewer, text) {
  viewer.innerHTML = `
    <div class="file-view-loading" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:40vh;color:var(--text-muted,#7a736c)">
      <span class="dl-spinner" style="width:28px;height:28px;border-width:3px;display:inline-block;border:3px solid rgba(0,0,0,.12);border-top-color:currentColor;border-radius:50%;animation:nusc-spin .7s linear infinite"></span>
      <span>${escapeHtml(text || 'جاري التحميل…')}</span>
    </div>`;
}

function showIdlePreview(viewer, material) {
  const type = shortFileType(material.file_type) || 'ملف';
  const size = material.file_size ? formatFileSize(material.file_size) : '';
  viewer.innerHTML = `
    <div style="padding:32px 20px;text-align:center;min-height:40vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px">
      <p class="text-sm" style="margin:0">${escapeHtml(type)}${size ? ' · ' + escapeHtml(size) : ''}</p>
      <button type="button" class="btn btn-primary" id="btn-start-view">عرض الملف</button>
    </div>`;
  document.getElementById('btn-start-view')?.addEventListener('click', () => startView());
}

async function ensureSignedUrl() {
  if (signedFileUrl) return signedFileUrl;
  if (!materialMeta?.file_path) throw new Error('مسار الملف غير متاح');
  signedFileUrl = await getSignedMaterialUrl(materialMeta.file_path, 900);
  return signedFileUrl;
}

function openSignedInNewTab() {
  ensureSignedUrl()
    .then((url) => {
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) window.location.href = url;
    })
    .catch(() => showToast('رابط الملف مش جاهز دلوقتي.', 'error'));
}

async function downloadSigned(button) {
  try {
    const url = await ensureSignedUrl();
    await downloadFileComplete({
      url,
      filename: materialMeta?.file_name || materialMeta?.title || 'file.pdf',
      button,
      fileSize: materialMeta?.file_size
    });
    try {
      await supabase.rpc('increment_download_count', { p_material_id: materialMeta.id });
    } catch {
      /* optional */
    }
    showToast('تم تنزيل الملف.', 'success');
  } catch (err) {
    console.warn('[NUSC] download failed', err);
    showToast('ما قدرناش نكمّل التنزيل. جرّب تاني.', 'error');
  }
}

async function renderPdfPage(wrap, pageNum, containerWidth) {
  const page = await pdfDoc.getPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(1.6, Math.max(0.9, containerWidth / baseViewport.width));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'max-width:100%;height:auto;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.12)';
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  await page.render({ canvasContext: ctx, viewport }).promise;
  wrap.appendChild(canvas);
}

async function renderPdfProgressive(viewer, url) {
  setLoading(viewer, 'جاري تجهيز ملف PDF…');
  const pdfjsLib = await import(/* @vite-ignore */ PDFJS_MAIN);
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

  const loadingTask = pdfjsLib.getDocument({
    url,
    withCredentials: false,
    disableRange: false,
    disableStream: false
  });
  pdfDoc = await loadingTask.promise;
  const total = pdfDoc.numPages;

  const wrap = document.createElement('div');
  wrap.className = 'pdf-pages';
  wrap.style.cssText =
    'display:flex;flex-direction:column;gap:12px;padding:8px;align-items:center;background:#e8e4df';

  const info = document.createElement('p');
  info.className = 'text-sm text-muted';
  info.style.cssText = 'margin:0;padding:4px 8px;text-align:center;width:100%;background:#fff';
  info.textContent = `عدد الصفحات: ${total}`;
  wrap.appendChild(info);

  viewer.innerHTML = '';
  viewer.appendChild(wrap);

  const containerWidth = Math.min(viewer.clientWidth || window.innerWidth || 360, 900) - 24;
  // First batch: 2 pages only (range requests pull less data)
  const firstBatch = Math.min(total, 2);
  for (let pageNum = 1; pageNum <= firstBatch; pageNum += 1) {
    await renderPdfPage(wrap, pageNum, containerWidth);
  }
  pagesRendered = firstBatch;

  if (pagesRendered < total) {
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'btn btn-outline btn-sm';
    moreBtn.style.margin = '8px auto 16px';
    moreBtn.textContent = `عرض صفحات تانية (${pagesRendered}/${total})`;
    moreBtn.addEventListener('click', async () => {
      moreBtn.disabled = true;
      moreBtn.textContent = 'جاري…';
      const next = Math.min(total, pagesRendered + 3);
      try {
        for (let p = pagesRendered + 1; p <= next; p += 1) {
          await renderPdfPage(wrap, p, containerWidth);
        }
        pagesRendered = next;
        if (pagesRendered >= total) {
          moreBtn.remove();
        } else {
          moreBtn.disabled = false;
          moreBtn.textContent = `عرض صفحات تانية (${pagesRendered}/${total})`;
          wrap.appendChild(moreBtn);
        }
      } catch (err) {
        console.warn(err);
        moreBtn.disabled = false;
        moreBtn.textContent = 'تعذر التحميل — حاول تاني';
      }
    });
    wrap.appendChild(moreBtn);
  }
}

async function renderPdf(viewer, url) {
  try {
    await renderPdfProgressive(viewer, url);
  } catch (err) {
    console.error('[NUSC] PDF.js failed:', err);
    viewer.innerHTML = `
      <div style="padding:28px;text-align:center">
        <p class="text-sm text-muted mb-2">ما قدرناش نعرض الـ PDF جوّه الصفحة. تقدر تفتحه في تاب جديد.</p>
        <button type="button" class="btn btn-primary" id="pdf-open-fallback">فتح الملف</button>
      </div>`;
    document.getElementById('pdf-open-fallback')?.addEventListener('click', openSignedInNewTab);
  }
}

function renderImage(viewer, url, title) {
  viewer.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" style="max-width:100%;height:auto;display:block;margin:0 auto;background:#fff" />`;
}

function renderOther(viewer) {
  viewer.innerHTML = `
    <div style="padding:28px;text-align:center">
      <p class="text-sm text-muted mb-2">نوع الملف ده الأفضل يتفتح برّه أو يتنزّل.</p>
      <button type="button" class="btn btn-primary" id="other-open">فتح الملف</button>
    </div>`;
  document.getElementById('other-open')?.addEventListener('click', openSignedInNewTab);
}

async function startView() {
  if (viewStarted) return;
  viewStarted = true;
  const viewer = document.getElementById('file-viewer');
  if (!viewer || !materialMeta) return;

  try {
    setLoading(viewer, 'جاري جلب الملف…');
    const url = await ensureSignedUrl();

    if (isPdf(materialMeta.file_type, materialMeta.file_path, materialMeta.file_name)) {
      await renderPdf(viewer, url);
    } else if (isImage(materialMeta.file_type, materialMeta.file_path, materialMeta.file_name)) {
      renderImage(viewer, url, materialMeta.title || 'صورة');
    } else {
      renderOther(viewer);
    }
  } catch (err) {
    console.error('[NUSC] startView:', err);
    viewStarted = false;
    viewer.innerHTML = `
      <div style="padding:24px;text-align:center">
        <p class="text-sm text-muted mb-2">تعذر عرض الملف.</p>
        <button type="button" class="btn btn-primary" id="retry-view">إعادة المحاولة</button>
      </div>`;
    document.getElementById('retry-view')?.addEventListener('click', () => {
      viewStarted = false;
      startView();
    });
  }
}

async function init() {
  if (!materialId) {
    window.location.replace('/subjects.html');
    return;
  }

  const result = await protectPage();
  if (!result) return;

  initIcons();

  const metaEl = document.getElementById('file-meta');
  const viewer = document.getElementById('file-viewer');
  const toolbar = document.getElementById('file-toolbar');

  try {
    const { data: material, error } = await supabase
      .from('materials')
      .select(
        'id, title, description, subject_id, file_path, file_name, file_type, file_size, is_published, created_at'
      )
      .eq('id', materialId)
      .maybeSingle();

    if (error) throw error;
    if (!material || material.is_published === false) {
      metaEl.innerHTML = '<p class="text-sm text-muted">الملف مش متاح أو اتشال.</p>';
      viewer.innerHTML = '';
      return;
    }

    materialMeta = material;
    const title = material.title || 'ملف';
    document.title = `${title} | NUSC`;
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = title;

    if (material.subject_id) {
      const back = document.getElementById('back-link');
      if (back) back.href = `/subject-details.html?id=${encodeURIComponent(material.subject_id)}`;
    }

    metaEl.innerHTML = `
      <h1 style="font-size:1.15rem;margin:0 0 6px">${escapeHtml(title)}</h1>
      <p class="text-sm text-muted" style="margin:0">
        ${escapeHtml(shortFileType(material.file_type) || 'ملف')}
        ${material.file_size ? ' · ' + escapeHtml(formatFileSize(material.file_size)) : ''}
        ${material.created_at ? ' · ' + escapeHtml(timeAgo(material.created_at)) : ''}
      </p>
      ${material.description ? `<p class="text-sm text-muted mt-1">${escapeHtml(material.description)}</p>` : ''}
    `;

    const platformUrl = `${window.location.origin}/file-view.html?id=${encodeURIComponent(material.id)}`;

    toolbar.innerHTML = `
      <button type="button" class="btn btn-sm btn-primary" id="btn-open">فتح</button>
      <button type="button" class="btn btn-sm btn-secondary" id="btn-download">
        <span class="dl-spinner hidden" aria-hidden="true"></span>
        <span class="material-dl-label">تنزيل</span>
      </button>
      <button type="button" class="btn btn-sm btn-outline" id="btn-copy">نسخ رابط المنصة</button>
      <button type="button" class="btn btn-sm btn-outline" id="btn-share">مشاركة</button>
    `;

    document.getElementById('btn-open')?.addEventListener('click', openSignedInNewTab);
    document.getElementById('btn-download')?.addEventListener('click', async (e) => {
      await downloadSigned(e.currentTarget);
    });
    document.getElementById('btn-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(platformUrl);
        showToast('تم نسخ رابط المنصة.', 'success');
      } catch {
        showToast('ما قدرناش ننسخ الرابط.', 'error');
      }
    });
    document.getElementById('btn-share')?.addEventListener('click', async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title, text: title + ' على NUSC', url: platformUrl });
          return;
        }
        await navigator.clipboard.writeText(platformUrl);
        showToast('تم نسخ رابط المنصة للمشاركة.', 'success');
      } catch (err) {
        if (err?.name === 'AbortError') return;
        showToast('ما قدرناش نشارك الرابط.', 'error');
      }
    });

    if (!material.file_path) {
      viewer.innerHTML =
        '<p class="text-sm text-muted" style="padding:24px;text-align:center">مسار الملف غير متاح.</p>';
      return;
    }

    // No Storage transfer until the student asks to view
    showIdlePreview(viewer, material);
    initIcons();
  } catch (error) {
    console.error('[NUSC] file-view:', error);
    metaEl.innerHTML = `<p class="text-sm">تعذر فتح الملف. ${escapeHtml(error?.message || 'حاول مرة أخرى.')}</p>`;
    viewer.innerHTML = '';
  }
}

init();
