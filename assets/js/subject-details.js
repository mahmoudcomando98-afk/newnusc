/**
 * NUSC Student Hub - Subject Details
 * Four student-facing sections: lectures, sections, assignments, announcements.
 */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, formatDate, timeAgo, showEmpty, showError, initIcons, formatFileSize, showToast } from './utils.js';

function safeHttpUrl(raw) {
  if (raw && typeof raw === 'object') raw = raw.url || raw.href || '';
  if (typeof raw !== 'string' || !raw.trim()) return '';
  try {
    const url = new URL(raw.trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function announcementJoinUrl(item) {
  const storedUrl = item.link_url || item.session_url || item.section_url || item.meeting_url || item.join_url || item.external_url;
  const directUrl = safeHttpUrl(storedUrl);
  if (directUrl) return directUrl;
  const text = String(item.content || item.body || '');
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? safeHttpUrl(match[0].replace(/[),.،؛]+$/, '')) : '';
}

const params = new URLSearchParams(window.location.search);
const subjectId = params.get('id');
let profile = null;
let currentTab = 'lectures';

function ensureSolutionModal() {
  let modal = document.getElementById('solution-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'solution-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);padding:16px;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;max-width:min(96vw,720px);max-height:92vh;overflow:auto;padding:16px;width:100%;position:relative">
      <div class="flex justify-between items-center mb-2">
        <h3 style="margin:0;font-size:1.05rem">عرض الحل</h3>
        <button type="button" class="btn btn-sm btn-secondary" id="solution-modal-close">إغلاق</button>
      </div>
      <div id="solution-modal-body" style="text-align:center">
        <p class="text-sm text-muted">جاري التحميل...</p>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) hideSolutionModal(); });
  document.getElementById('solution-modal-close').addEventListener('click', hideSolutionModal);
  return modal;
}

function hideSolutionModal() {
  const modal = document.getElementById('solution-modal');
  if (modal) modal.style.display = 'none';
}

async function showSolutionImage(path) {
  if (!path) {
    showToast('مفيش صورة حل متاحة دلوقتي.', 'info');
    return;
  }
  const modal = ensureSolutionModal();
  const body = document.getElementById('solution-modal-body');
  body.innerHTML = '<p class="text-sm text-muted">جاري التحميل...</p>';
  modal.style.display = 'flex';
  try {
    const { data, error } = await supabase.storage.from('materials').createSignedUrl(path, 120);
    if (error) throw error;
    body.innerHTML = `<img src="${escapeHtml(data.signedUrl)}" alt="صورة الحل" style="max-width:100%;height:auto;border-radius:8px" />`;
  } catch (error) {
    console.error('Solution image load failed:', error);
    body.innerHTML = '<p class="text-sm" style="color:var(--danger)">مش قادرين نعرض صورة الحل دلوقتي.</p>';
  }
}

async function init() {
  if (!subjectId) { window.location.href = '/subjects.html'; return; }
  const result = await protectPage();
  if (!result) return;
  profile = result.profile;
  initIcons();
  setupTabs();
  document.getElementById('fav-btn')?.addEventListener('click', toggleFavorite);
  await loadSubject();
  await loadTab(currentTab);
  await checkFavorite();
}

function setupTabs() {
  document.querySelectorAll('#tabs [data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#tabs [data-tab]').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      loadTab(currentTab);
    });
  });
}

async function loadSubject() {
  const el = document.getElementById('subject-header');
  try {
    const { data, error } = await supabase.from('subjects')
      .select('*')
      .eq('id', subjectId)
      .maybeSingle();
    if (error || !data || data.is_active === false || data.is_published === false) {
      showError(el, 'المادة دي مش موجودة أو لسه مش منشورة.');
      return;
    }
    document.getElementById('page-title').textContent = data.name;
    document.title = `${data.name} | NUSC`;
    el.innerHTML = `
      <h1 style="font-size:1.35rem;margin-bottom:8px">${escapeHtml(data.name)}</h1>
      <div class="flex flex-wrap gap-1 items-center">
        ${data.code ? `<span class="badge badge-primary">${escapeHtml(data.code)}</span>` : ''}
        ${data.instructor ? `<span class="text-sm text-muted">${escapeHtml(data.instructor)}</span>` : ''}
      </div>
      ${data.description ? `<p class="text-sm text-muted mt-2">${escapeHtml(data.description)}</p>` : ''}`;
  } catch (error) {
    console.error('Subject details load failed:', error);
    showError(el, 'مش قادرين نحمّل بيانات المادة. جرّب تاني.');
  }
}

async function loadTab(tab) {
  const el = document.getElementById('tab-content');
  el.innerHTML = '<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>';
  try {
    if (tab === 'lectures') await loadLectures(el);
    else if (tab === 'sections') await loadMaterialsByType(el, 'section', 'مفيش ملفات للسكاشن لسه.');
    else if (tab === 'assignments') await loadMaterialsByType(el, 'assignment', 'مفيش ملفات للواجبات لسه.');
    else if (tab === 'announcements') await loadAnnouncements(el);
  } catch (error) {
    console.error('Subject content load failed:', error);
    showRetryState(el, tab, 'مش قادرين نحمّل المحتوى دلوقتي. اضغط إعادة المحاولة.');
  }
}

function showRetryState(el, tab, message) {
  el.innerHTML = `
    <div class="card text-center" role="status" style="padding:24px">
      <p class="text-sm text-muted mb-2">${escapeHtml(message)}</p>
      <button type="button" class="btn btn-primary" data-retry-content>إعادة المحاولة</button>
    </div>`;
  el.querySelector('[data-retry-content]')?.addEventListener('click', () => loadTab(tab));
}

async function loadSubjectMaterials() {
  const { data, error } = await supabase.from('materials')
    .select('*')
    .eq('subject_id', subjectId);
  if (error) throw error;
  return (data || [])
    .filter((item) => item.is_published !== false)
    .map((item) => ({ ...item, material_type: item.material_type || 'lecture' }))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function materialCard(material, badgeLabel) {
  const hasSolution = !!(material.solution_image_path);
  const solutionBtn = hasSolution
    ? `<button type="button" class="btn btn-sm btn-primary" data-solution="${escapeHtml(material.solution_image_path)}" aria-label="عرض الحل">عرض الحل</button>`
    : '';
  return `
    <div class="list-item">
      <div class="list-item-icon" data-icon="file"></div>
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(material.title || 'ملف')}</div>
        <div class="list-item-desc">
          ${escapeHtml(badgeLabel)}
          ${material.file_type ? ` · ${escapeHtml(material.file_type)}` : ''}
          ${material.file_size ? ` · ${formatFileSize(material.file_size)}` : ''}
          ${material.created_at ? ` · ${timeAgo(material.created_at)}` : ''}
        </div>
        ${material.description ? `<p class="text-sm text-muted mt-1">${escapeHtml(material.description)}</p>` : ''}
        ${hasSolution ? '<p class="text-sm mt-1"><span class="badge badge-success">فيه صورة حل</span></p>' : ''}
      </div>
      <div class="flex gap-1 items-center flex-wrap" style="flex-shrink:0">
        ${solutionBtn}
        <button type="button" class="btn btn-sm btn-secondary" data-download="${escapeHtml(material.id)}" data-path="${escapeHtml(material.file_path || '')}" aria-label="تنزيل الملف" title="تنزيل الملف">
          <span data-icon="download"></span>
        </button>
      </div>
    </div>`;
}

function bindDownloads(el) {
  initIcons();
  el.querySelectorAll('[data-download]').forEach((button) => {
    button.addEventListener('click', () => downloadMaterial(button.dataset.download, button.dataset.path));
  });
  el.querySelectorAll('[data-solution]').forEach((button) => {
    button.addEventListener('click', () => showSolutionImage(button.dataset.solution));
  });
}

async function loadLectures(el) {
  const [lecturesResult, materialsResult] = await Promise.all([
    supabase.from('lectures').select('*').eq('subject_id', subjectId),
    loadSubjectMaterials().then((data) => ({ data, error: null }))
      .catch((error) => ({ data: [], error }))
  ]);
  if (lecturesResult.error) console.warn('Lecture records are temporarily unavailable:', lecturesResult.error);
  const lectures = (lecturesResult.data || [])
    .filter((item) => item.is_published !== false && item.is_active !== false)
    .sort((a, b) => {
      const numberA = Number(a.lecture_number ?? 999999);
      const numberB = Number(b.lecture_number ?? 999999);
      if (numberA !== numberB) return numberA - numberB;
      return new Date(a.lecture_date || a.published_at || a.created_at || 0) -
        new Date(b.lecture_date || b.published_at || b.created_at || 0);
    });
  const materials = materialsResult.data || [];
  if (materialsResult.error) console.warn('Subject materials are temporarily unavailable:', materialsResult.error);
  const lectureFiles = materials.filter((m) => !['section', 'assignment'].includes(m.material_type));
  if (!lectures.length && !lectureFiles.length) {
    if (lecturesResult.error || materialsResult.error) {
      showRetryState(el, 'lectures', 'تعذر الاتصال بمحتوى المحاضرات أو الملفات. جرّب مرة تانية.');
    } else {
      showEmpty(el, 'لسه مفيش محاضرات أو ملفات للمادة دي.');
    }
    return;
  }
  const lectureHtml = lectures.map((lecture) => `
    <a href="/lecture-details.html?id=${encodeURIComponent(lecture.id)}" class="list-item" style="text-decoration:none;color:inherit">
      <div class="list-item-icon" data-icon="book-open"></div>
      <div class="list-item-body">
        <div class="list-item-title">
          ${lecture.lecture_number ? `<span class="badge badge-primary" style="margin-left:6px">${escapeHtml(lecture.lecture_number)}</span>` : ''}
          ${escapeHtml(lecture.title)}
        </div>
        <div class="list-item-desc">
          ${(lecture.lecture_date || lecture.published_at || lecture.created_at) ? formatDate(lecture.lecture_date || lecture.published_at || lecture.created_at) : ''}
          ${lecture.description ? ` · ${escapeHtml(lecture.description.slice(0, 90))}` : ''}
        </div>
      </div>
    </a>`).join('');
  const filesHtml = lectureFiles.length
    ? `<section class="section mt-2"><h3 class="mb-1">ملفات المحاضرات</h3><div class="card">${lectureFiles.map((file) => materialCard(file, 'محاضرات')).join('')}</div></section>`
    : '';
  const fallbackNotice = lecturesResult.error && lectureFiles.length
    ? '<p class="text-sm text-muted mb-2">بنعرِض ملفات المادة المتاحة؛ سجل المحاضرات نفسه تعذر تحميله مؤقتًا.</p>'
    : '';
  el.innerHTML = `${fallbackNotice}${lectureHtml ? `<div class="card">${lectureHtml}</div>` : ''}${filesHtml}`;
  bindDownloads(el);
}

async function loadMaterialsByType(el, type, emptyMessage) {
  const materials = await loadSubjectMaterials();
  const selected = materials.filter((item) => item.material_type === type);
  if (!selected.length) { showEmpty(el, emptyMessage); return; }
  el.innerHTML = `<div class="card">${selected.map((item) => materialCard(item, type === 'section' ? 'سكشن' : 'واجب')).join('')}</div>`;
  bindDownloads(el);
}

async function loadAnnouncements(el) {
  const { data, error } = await supabase.from('announcements')
    .select('*')
    .eq('subject_id', subjectId);
  if (error) throw error;

  const now = Date.now();
  const announcements = (data || [])
    .filter((announcement) => {
      if (announcement.is_published === false) return false;
      if (announcement.expires_at) {
        const expiry = new Date(announcement.expires_at).getTime();
        if (!Number.isNaN(expiry) && expiry <= now) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  if (!announcements.length) {
    showEmpty(el, 'مفيش إعلانات منشورة خاصة بالمادة دي دلوقتي.');
    return;
  }

  el.innerHTML = announcements.map((announcement) => {
    const level = announcement.importance || announcement.priority || 'normal';
    const badge = level === 'urgent' ? 'عاجل' : level === 'high' ? 'مهم' : '';
    const title = announcement.title || 'إعلان';
    const body = announcement.content || announcement.body || '';
    const date = announcement.created_at ? timeAgo(announcement.created_at) : '';
    const joinUrl = announcementJoinUrl(announcement);
    return `
      <article class="list-item">
        <div class="list-item-icon" data-icon="megaphone"></div>
        <div class="list-item-body">
          <div class="list-item-title">${announcement.is_pinned ? '📌 ' : ''}${escapeHtml(title)}</div>
          ${badge ? `<span class="badge badge-primary">${badge}</span>` : ''}
          <p class="text-sm mt-1" style="white-space:pre-wrap">${escapeHtml(body)}</p>
          ${joinUrl
            ? `<div class="mt-2"><a href="${escapeHtml(joinUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">${escapeHtml(announcement.link_label || 'دخول السيكشن أونلاين')}</a></div>`
            : announcement.link_status === 'coming_soon'
              ? '<div class="mt-2"><span class="badge badge-warning">رابط السيكشن قريبًا</span></div>'
              : ''}
          ${date ? `<div class="list-item-desc">${escapeHtml(date)}</div>` : ''}
        </div>
      </article>`;
  }).join('');
  initIcons();
}

async function downloadMaterial(id, path) {
  if (!path) { showToast('مسار الملف مش متاح دلوقتي.', 'error'); return; }
  try {
    const { data, error } = await supabase.storage.from('materials').createSignedUrl(path, 60);
    if (error) throw error;
    try { await supabase.rpc('increment_download_count', { p_material_id: id }); }
    catch (countError) { console.warn('Could not count file download:', countError); }
    window.open(data.signedUrl, '_blank', 'noopener');
  } catch (error) {
    console.error('Material download failed:', error);
    showToast('مش قادرين ننزّل الملف. ممكن يكون مش متاح دلوقتي.', 'error');
  }
}

async function checkFavorite() {
  if (!profile?.id) return;
  const { data, error } = await supabase.from('favorites').select('id')
    .eq('user_id', profile.id).eq('item_type', 'subject').eq('item_id', subjectId).maybeSingle();
  if (error) { console.warn('Could not check favorite:', error.message); return; }
  const btn = document.getElementById('fav-btn');
  if (data && btn) { btn.classList.add('active'); btn.style.color = 'var(--warning)'; }
}

async function toggleFavorite() {
  const btn = document.getElementById('fav-btn');
  if (!profile?.id || !btn) return;
  try {
    const { data, error } = await supabase.from('favorites').select('id')
      .eq('user_id', profile.id).eq('item_type', 'subject').eq('item_id', subjectId).maybeSingle();
    if (error) throw error;
    if (data) {
      const { error: deleteError } = await supabase.from('favorites').delete().eq('id', data.id);
      if (deleteError) throw deleteError;
      btn.style.color = '';
      btn.classList.remove('active');
      showToast('شيلنا المادة من المفضلة.', 'info');
    } else {
      const { error: insertError } = await supabase.from('favorites').insert({ user_id: profile.id, item_type: 'subject', item_id: subjectId });
      if (insertError) throw insertError;
      btn.style.color = 'var(--warning)';
      btn.classList.add('active');
      showToast('ضفنا المادة للمفضلة.', 'success');
    }
  } catch (error) {
    console.error('Favorite update failed:', error);
    showToast('مش قادرين نحدّث المفضلة دلوقتي.', 'error');
  }
}

init();
