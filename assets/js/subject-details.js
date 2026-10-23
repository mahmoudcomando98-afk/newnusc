/**
 * NUSC Student Hub - Subject Details
 * Four student-facing sections: lectures, sections, assignments, announcements.
 */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, formatDate, timeAgo, showEmpty, showError, initIcons, formatFileSize, showToast } from './utils.js';

const params = new URLSearchParams(window.location.search);
const subjectId = params.get('id');
let profile = null;
let currentTab = 'lectures';

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
      .select('id, name, code, instructor, description')
      .eq('id', subjectId).eq('is_active', true).single();
    if (error || !data) { showError(el, 'المادة دي مش موجودة أو لسه مش منشورة.'); return; }
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
    showError(el, 'مش قادرين نحمّل المحتوى دلوقتي. جرّب تاني.');
  }
}

async function loadSubjectMaterials() {
  const { data, error } = await supabase.from('materials')
    .select('id, title, description, file_type, file_size, file_path, material_type, created_at')
    .eq('subject_id', subjectId).eq('is_published', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

function materialCard(material, badgeLabel) {
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
      </div>
      <button type="button" class="btn btn-sm btn-secondary" data-download="${escapeHtml(material.id)}" data-path="${escapeHtml(material.file_path || '')}" aria-label="تنزيل الملف" title="تنزيل الملف">
        <span data-icon="download"></span>
      </button>
    </div>`;
}

function bindDownloads(el) {
  initIcons();
  el.querySelectorAll('[data-download]').forEach((button) => {
    button.addEventListener('click', () => downloadMaterial(button.dataset.download, button.dataset.path));
  });
}

async function loadLectures(el) {
  const [lecturesResult, materials] = await Promise.all([
    supabase.from('lectures')
      .select('id, title, lecture_number, description, lecture_date, created_at')
      .eq('subject_id', subjectId).eq('is_published', true)
      .order('lecture_number', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    loadSubjectMaterials()
  ]);
  if (lecturesResult.error) throw lecturesResult.error;
  const lectures = lecturesResult.data || [];
  // Keep old material types visible so removing the old "Files" tab never hides existing files.
  const lectureFiles = materials.filter((m) => !['section', 'assignment'].includes(m.material_type));
  if (!lectures.length && !lectureFiles.length) {
    showEmpty(el, 'لسه مفيش محاضرات أو ملفات للمادة دي.');
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
          ${lecture.lecture_date ? formatDate(lecture.lecture_date) : timeAgo(lecture.created_at)}
          ${lecture.description ? ` · ${escapeHtml(lecture.description.slice(0, 90))}` : ''}
        </div>
      </div>
    </a>`).join('');
  const filesHtml = lectureFiles.length
    ? `<section class="section mt-2"><h3 class="mb-1">ملفات المحاضرات</h3><div class="card">${lectureFiles.map((file) => materialCard(file, 'محاضرات')).join('')}</div></section>`
    : '';
  el.innerHTML = `${lectureHtml ? `<div class="card">${lectureHtml}</div>` : ''}${filesHtml}`;
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
    .select('id, title, content, importance, priority, created_at, is_pinned')
    .eq('subject_id', subjectId).eq('is_published', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!data?.length) { showEmpty(el, 'مفيش إعلانات خاصة بالمادة دي دلوقتي.'); return; }
  el.innerHTML = data.map((announcement) => {
    const level = announcement.importance || announcement.priority || 'normal';
    const badge = level === 'urgent' ? 'عاجل' : level === 'high' ? 'مهم' : '';
    return `
      <article class="list-item">
        <div class="list-item-icon" data-icon="megaphone"></div>
        <div class="list-item-body">
          <div class="list-item-title">${announcement.is_pinned ? '📌 ' : ''}${escapeHtml(announcement.title)}</div>
          ${badge ? `<span class="badge badge-primary">${badge}</span>` : ''}
          <p class="text-sm mt-1" style="white-space:pre-wrap">${escapeHtml(announcement.content || '')}</p>
          <div class="list-item-desc">${timeAgo(announcement.created_at)}</div>
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
