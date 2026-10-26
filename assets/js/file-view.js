/**
 * In-app file viewer. Requires login; shares platform links only.
 */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, showToast, initIcons, formatFileSize, timeAgo } from './utils.js';

const params = new URLSearchParams(window.location.search);
const materialId = params.get('id');

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

function isPdf(type, path) {
  const t = String(type || '').toLowerCase();
  const p = String(path || '').toLowerCase();
  return t.includes('pdf') || p.endsWith('.pdf');
}

function isImage(type, path) {
  const t = String(type || '').toLowerCase();
  const p = String(path || '').toLowerCase();
  return t.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(p);
}

async function init() {
  if (!materialId) {
    window.location.replace('/subjects.html');
    return;
  }

  const result = await protectPage();
  if (!result) return; // redirected to login; next URL saved by protectPage

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
    document.getElementById('page-title').textContent = title;

    if (material.subject_id) {
      document.getElementById('back-link').href = `/subject-details.html?id=${encodeURIComponent(material.subject_id)}`;
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
    `;

    if (!material.file_path) {
      viewer.innerHTML = '<p class="text-sm text-muted" style="padding:24px;text-align:center">مسار الملف غير متاح.</p>';
      return;
    }

    const { data: signed, error: signError } = await supabase.storage
      .from('materials')
      .createSignedUrl(material.file_path, 3600);
    if (signError) throw signError;

    const url = signed.signedUrl;
    if (isPdf(material.file_type, material.file_path)) {
      viewer.innerHTML = `<iframe title="${escapeHtml(title)}" src="${escapeHtml(url)}"></iframe>`;
    } else if (isImage(material.file_type, material.file_path)) {
      viewer.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" />`;
    } else {
      viewer.innerHTML = `
        <div style="padding:28px;text-align:center">
          <p class="text-sm text-muted mb-2">نوع الملف ده الأفضل يتنزّل أو يتفتح في تطبيق خارجي.</p>
          <a class="btn btn-primary" href="${escapeHtml(url)}" target="_blank" rel="noopener">فتح الملف</a>
        </div>`;
    }

    document.getElementById('btn-download')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const spinner = btn.querySelector('.dl-spinner');
      try {
        btn.disabled = true;
        spinner?.classList.remove('hidden');
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.download = '';
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
    metaEl.innerHTML = '<p class="text-sm">تعذر فتح الملف. حاول مرة أخرى.</p>';
    viewer.innerHTML = '';
  }
}

init();
