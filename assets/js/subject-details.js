/**
 * NUSC Student Hub - Subject Details
 */

import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import {
  escapeHtml, formatDate, timeAgo, showEmpty, showError, initIcons,
  formatFileSize, showToast
} from './utils.js';

const params = new URLSearchParams(window.location.search);
const subjectId = params.get('id');
let subject = null;
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
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      loadTab(currentTab);
    });
  });
}

async function loadSubject() {
  const el = document.getElementById('subject-header');
  try {
    const { data, error } = await supabase.from('subjects').select('id, name, code, instructor, description').eq('id', subjectId).eq('is_active', true).single();
    if (error || !data) { showError(el, 'المادة غير موجودة أو غير منشورة'); return; }
    subject = data;
    document.getElementById('page-title').textContent = data.name;
    document.title = `${data.name} | NUSC Student Hub`;
    el.innerHTML = `
      <h1 style="font-size:1.35rem;margin-bottom:8px">${escapeHtml(data.name)}</h1>
      <div class="flex flex-wrap gap-1 items-center">
        ${data.code ? `<span class="badge badge-primary">${escapeHtml(data.code)}</span>` : ''}
        ${data.instructor ? `<span class="text-sm text-muted">${escapeHtml(data.instructor)}</span>` : ''}
      </div>
      ${data.description ? `<p class="text-sm text-muted mt-2">${escapeHtml(data.description)}</p>` : ''}`;
  } catch (err) { console.error(err); showError(el, 'تعذر تحميل بيانات المادة'); }
}

async function loadTab(tab) {
  const el = document.getElementById('tab-content');
  el.innerHTML = '<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>';
  try {
    if (tab === 'lectures') await loadLectures(el);
    else if (tab === 'materials') await loadMaterials(el, null);
    else if (tab === 'assignments') await loadMaterials(el, 'assignment');
    else if (tab === 'announcements') await loadAnnouncements(el);
  } catch (err) { console.error(err); showError(el, 'تعذر تحميل المحتوى'); }
}

async function loadLectures(el) {
  const { data, error } = await supabase.from('lectures').select('id, title, lecture_number, description, published_at, created_at').eq('subject_id', subjectId).eq('is_published', true).order('lecture_number', { ascending: true, nullsFirst: false }).order('created_at');
  if (error) throw error;
  if (!data?.length) { showEmpty(el, 'لا توجد محاضرات لهذه المادة بعد'); return; }
  el.innerHTML = `<div class="card">${data.map((l) => `
    <a href="/lecture-details.html?id=${l.id}" class="list-item" style="text-decoration:none;color:inherit">
      <div class="list-item-icon" data-icon="file"></div>
      <div class="list-item-body">
        <div class="list-item-title">${l.lecture_number ? `<span class="badge badge-primary" style="margin-left:6px">${l.lecture_number}</span>` : ''}${escapeHtml(l.title)}</div>
        <div class="list-item-desc">${l.published_at ? formatDate(l.published_at) : timeAgo(l.created_at)}${l.description ? ` \u00b7 ${escapeHtml(l.description.slice(0, 60))}` : ''}</div>
      </div>
    </a>`).join('')}</div>`;
  initIcons();
}

async function loadMaterials(el, typeFilter) {
  if (typeFilter === 'assignment') { showEmpty(el, 'لا يوجد حقل في قاعدة البيانات الحالية يميّز الواجبات عن الملفات الأخرى.'); return; }
  const query = supabase.from('materials').select('id, title, file_type, file_size, created_at, file_path').eq('subject_id', subjectId).eq('is_published', true).order('created_at', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) { showEmpty(el, typeFilter === 'assignment' ? 'لا توجد واجبات حالياً' : 'لا توجد ملفات لهذه المادة'); return; }
  el.innerHTML = `<div class="card">${data.map((m) => `
    <div class="list-item">
      <div class="list-item-icon" data-icon="file"></div>
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(m.title)}</div>
        <div class="list-item-desc">${escapeHtml(m.file_type || 'ملف')}${m.file_size ? ` \u00b7 ${formatFileSize(m.file_size)}` : ''} \u00b7 ${timeAgo(m.created_at)}</div>
      </div>
      <button type="button" class="btn btn-sm btn-secondary" data-download="${m.id}" data-path="${escapeHtml(m.file_path)}" title="تنزيل"><span data-icon="download"></span></button>
    </div>`).join('')}</div>`;
  initIcons();
  el.querySelectorAll('[data-download]').forEach((btn) => {
    btn.addEventListener('click', () => downloadMaterial(btn.dataset.download, btn.dataset.path));
  });
}

async function loadAnnouncements(el) {
  const { data, error } = await supabase.from('announcements').select('id, title, content, priority, created_at').eq('subject_id', subjectId).eq('is_published', true).order('created_at', { ascending: false });
  if (error) throw error;
  if (!data?.length) { showEmpty(el, 'لا توجد إعلانات خاصة بهذه المادة'); return; }
  el.innerHTML = `<div class="card">${data.map((a) => `
    <div class="list-item">
      <div class="list-item-icon" data-icon="megaphone"></div>
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(a.title)}</div>
        <div class="list-item-desc">${escapeHtml((a.content || '').slice(0, 100))} \u00b7 ${timeAgo(a.created_at)}</div>
      </div>
    </div>`).join('')}</div>`;
  initIcons();
}

async function downloadMaterial(id, path) {
  try {
    const { data, error } = await supabase.storage.from('materials').createSignedUrl(path, 60);
    if (error) throw error;
    await supabase.rpc('increment_download_count', { p_material_id: id });
    window.open(data.signedUrl, '_blank');
  } catch (err) {
    console.error(err);
    showToast('تعذر تنزيل الملف. قد يكون غير متاح حالياً.', 'error');
  }
}

async function checkFavorite() {
  const { data } = await supabase.from('favorites').select('id').eq('user_id', profile.id).eq('item_type', 'subject').eq('item_id', subjectId).maybeSingle();
  const btn = document.getElementById('fav-btn');
  if (data) { btn.classList.add('active'); btn.style.color = 'var(--warning)'; }
}

async function toggleFavorite() {
  const btn = document.getElementById('fav-btn');
  try {
    const { data } = await supabase.from('favorites').select('id').eq('user_id', profile.id).eq('item_type', 'subject').eq('item_id', subjectId).maybeSingle();
    if (data) {
      await supabase.from('favorites').delete().eq('id', data.id);
      btn.style.color = '';
      showToast('تمت الإزالة من المفضلة', 'info');
    } else {
      await supabase.from('favorites').insert({ user_id: profile.id, item_type: 'subject', item_id: subjectId });
      btn.style.color = 'var(--warning)';
      showToast('تمت الإضافة إلى المفضلة', 'success');
    }
  } catch (err) { showToast('تعذر تحديث المفضلة', 'error'); }
}

init();
