/**
 * In-app file viewer. Requires login; shares platform links only.
 * PDFs are fetched then shown via blob: URL so mobile browsers can render them.
 */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, showToast, initIcons, formatFileSize, timeAgo } from './utils.js';

const params = new URLSearchParams(window.location.search);
const materialId = params.get('id');

let currentObjectUrl = null;

function shortFileType(raw) {
  if (!raw) return '';
  const s = String(raw).toLowerCase();
  if (s.includes('pdf')) return 'PDF';
  if (s.includes('word') || s.includes('doc')) return 'Word';
  if (s.includes('ppt')) return 'PowerPoint';
  if (s.includes('xls')) return 'Excel';
  if (s.includes('png') || s.includes('jpg') || s.includes('jpeg') || s.includes('webp') || s.includes('image')) return 'صورة';
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
    <div class="file-view-loading">
      <span class="dl-spinner" style="width:28px;height:28px;border-width:3px"></span>
      <span>${escapeHtml(text || 'جاري تحميل الملف…')}</span>
    </div>`;
}

function showFallback(viewer, url, title, message) {
  viewer.innerHTML = `
    <div style="padding:28px;text-align:center">
      <p class="text-sm text-muted mb-2">${escapeHtml(message || 'مش قادرين نعرض الملف جوّه الصفحة.')}</p>
      <a class="btn btn-primary" href="${escapeHtml(url)}" target="_blank" rel="noopener">فتح الملف في تاب جديد</a>
    </div>`;
}

async function signedUrlToObjectUrl(signedUrl, preferType) {
  const res = await fetch(signedUrl, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error('تعذر تحميل الملف من التخزين (' + res.status + ')');
  const buf = await res.arrayBuffer();
  const headerType = (res.headers.get('content-type') || '').split(';')[0].trim();
  const type = preferType || headerType || 'application/octet-stream';
  const blob = new Blob([buf], { type });
  if (currentObjectUrl) {
    try { URL.revokeObjectURL(currentObjectUrl); } catch { /* ignore */ }
  }
  currentObjectUrl = URL.createObjectURL(blob);
  return { objectUrl: currentObjectUrl, type: blob.type, size: blob.size };
}

async function renderPdf(viewer, signedUrl, title) {
  setLoading(viewer, 'جاري تجهيز ملف PDF…');
  try {
    const { objectUrl } = await signedUrlToObjectUrl(signedUrl, 'application/pdf');
    viewer.innerHTML = `
      <object data="${escapeHtml(objectUrl)}" type="application/pdf" title="${escapeHtml(title)}" style="width:100%;height:min(75vh,900px);border:0">
        <iframe title="${escapeHtml(title)}" src="${escapeHtml(objectUrl)}" style="width:100%;height:min(75vh,900px);border:0"></iframe>
      </object>
      <p class="text-sm text-muted" style="text-align:center;padding:8px">
        لو الصفحة فاضية:
        <a href="${escapeHtml(objectUrl)}" target="_blank" rel="noopener">افتح PDF هنا</a>
      </p>`;
  } catch (err) {
    console.warn('[NUSC] blob PDF failed, trying direct URL', err);
    viewer.innerHTML = `
      <iframe title="${escapeHtml(title)}" src="${escapeHtml(signedUrl)}" style="width:100%;height:min(75vh,900px);border:0"></iframe>
      <p class="text-sm text-muted" style="text-align:center;padding:8px">
        <a href="${escapeHtml(signedUrl)}" target="_blank" rel="noopener">فتح في تاب جديد</a>
      </p>`;
  }
}

async function renderImage(viewer, signedUrl, title) {
  setLoading(viewer, 'جاري تحميل الصورة…');
  try {
    const { objectUrl } = await signedUrlToObjectUrl(signedUrl);
    viewer.innerHTML = `<img src="${escapeHtml(objectUrl)}" alt="${escapeHtml(title)}" style="max-width:100%;height:auto;display:block;margin:0 auto" />`;
  } catch {
    viewer.innerHTML = `<img src="${escapeHtml(signedUrl)}" alt="${escapeHtml(title)}" style="max-width:100%;height:auto;display:block;margin:0 auto" />`;
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
      .select('*')
      .eq('id', materialId)
      .maybeSingle();

    if (error) throw error;
    if (!material || material.is_published === false) {
      metaEl.innerHTML = '<p class="text-sm text-muted">الملف مش متاح أو اتشال.</p>';
      viewer.innerHTML = '';
      return;
    }

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
      <button type="button" class="btn btn-sm btn-secondary" id="btn-download">
        <span class="dl-spinner hidden" aria-hidden="true"></span>
        <span>تنزيل</span>
      </button>
      <button type="button" class="btn btn-sm btn-outline" id="btn-copy">نسخ رابط المنصة</button>
      <button type="button" class="btn btn-sm btn-outline" id="btn-share">مشاركة</button>
      <a class="btn btn-sm btn-outline" id="btn-open-tab" href="#" target="_blank" rel="noopener">فتح في تاب</a>
    `;

    if (!material.file_path) {
      viewer.innerHTML = '<p class="text-sm text-muted" style="padding:24px;text-align:center">مسار الملف غير متاح.</p>';
      return;
    }

    setLoading(viewer, 'جاري جلب الملف…');

    const { data: signed, error: signError } = await supabase.storage
      .from('materials')
      .createSignedUrl(material.file_path, 3600);
    if (signError) throw signError;

    const url = signed.signedUrl;
    const openTab = document.getElementById('btn-open-tab');
    if (openTab) openTab.href = url;

    if (isPdf(material.file_type, material.file_path, material.file_name)) {
      await renderPdf(viewer, url, title);
    } else if (isImage(material.file_type, material.file_path, material.file_name)) {
      await renderImage(viewer, url, title);
    } else {
      showFallback(viewer, url, title, 'نوع الملف ده الأفضل يتفتح برّه الصفحة أو يتنزّل.');
    }

    document.getElementById('btn-download')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const spinner = btn.querySelector('.dl-spinner');
      try {
        btn.disabled = true;
        spinner?.classList.remove('hidden');
        const a = document.createElement('a');
        a.href = currentObjectUrl || url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.download = material.file_name || material.title || 'file';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        btn.disabled = false;
        spinner?.classList.add('hidden');
      }
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

    initIcons();
  } catch (error) {
    console.error('[NUSC] file-view:', error);
    metaEl.innerHTML = `<p class="text-sm">تعذر فتح الملف. ${escapeHtml(error?.message || 'حاول مرة أخرى.')}</p>`;
    viewer.innerHTML = '';
  }
}

init();
