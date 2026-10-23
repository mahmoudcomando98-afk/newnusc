/**
 * NUSC Student Hub - Home Page
 */

import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import {
  escapeHtml, formatDate, timeAgo, showEmpty, showError, initIcons,
  setActiveNav, onConnectivityChange, computeQuizStatus, quizStatusLabel
} from './utils.js';

let profile = null;

async function init() {
  const result = await protectPage();
  if (!result) return;
  profile = result.profile;
  setActiveNav('home');
  initIcons();
  setupUserUI();
  setupOffline();
  document.getElementById('user-chip')?.addEventListener('click', () => {
    window.location.href = '/profile.html';
  });
  await Promise.all([
    loadSubjects(), loadLectures(), loadQuizzes(),
    loadAnnouncements(), loadMaterials(), loadNotifCount()
  ]);
}

function setupUserUI() {
  const name = profile.full_name || 'طالب';
  document.getElementById('welcome-text').textContent = `أهلاً بك، ${name}`;
  document.getElementById('user-name-short').textContent = name.split(' ')[0];
  const avatar = document.getElementById('user-avatar');
  if (profile.avatar_url) {
    avatar.innerHTML = `<img src="${escapeHtml(profile.avatar_url)}" alt="" />`;
  } else {
    avatar.textContent = name.charAt(0);
  }
}

function setupOffline() {
  const banner = document.getElementById('offline-banner');
  onConnectivityChange((online) => {
    banner.classList.toggle('show', !online);
  });
  if (!navigator.onLine) banner.classList.add('show');
}

async function loadSubjects() {
  const el = document.getElementById('subjects-list');
  try {
    const { data, error } = await supabase.from('subjects').select('id, name, code, instructor, description').eq('is_published', true).order('sort_order').limit(6);
    if (error) throw error;
    if (!data?.length) { showEmpty(el, 'لا توجد مواد منشورة حالياً'); return; }
    el.innerHTML = data.map((s) => `
      <div class="card subject-card">
        <h3 class="card-title">${escapeHtml(s.name)}</h3>
        ${s.code ? `<span class="badge badge-primary">${escapeHtml(s.code)}</span>` : ''}
        ${s.instructor ? `<p class="text-sm text-muted mt-1">${escapeHtml(s.instructor)}</p>` : ''}
        ${s.description ? `<p class="text-sm text-muted mt-1">${escapeHtml(s.description.slice(0, 80))}${s.description.length > 80 ? '...' : ''}</p>` : ''}
        <a href="/subject-details.html?id=${s.id}" class="btn btn-outline btn-sm mt-2">فتح المادة</a>
      </div>`).join('');
  } catch (err) { console.error(err); showError(el, 'تعذر تحميل المواد'); }
}

async function loadLectures() {
  const el = document.getElementById('lectures-list');
  try {
    const { data, error } = await supabase.from('lectures').select('id, title, lecture_number, created_at, subjects(name)').eq('is_published', true).order('created_at', { ascending: false }).limit(5);
    if (error) throw error;
    if (!data?.length) { showEmpty(el, 'لا توجد محاضرات مضافة بعد'); return; }
    el.innerHTML = data.map((l) => `
      <a href="/lecture-details.html?id=${l.id}" class="list-item" style="text-decoration:none;color:inherit">
        <div class="list-item-icon" data-icon="file"></div>
        <div class="list-item-body">
          <div class="list-item-title">${escapeHtml(l.title)}${l.lecture_number ? ` (محاضرة ${l.lecture_number})` : ''}</div>
          <div class="list-item-desc">${escapeHtml(l.subjects?.name || '')} · ${timeAgo(l.created_at)}</div>
        </div>
      </a>`).join('');
    initIcons();
  } catch (err) { console.error(err); showError(el, 'تعذر تحميل المحاضرات'); }
}

async function loadQuizzes() {
  const el = document.getElementById('quizzes-list');
  try {
    const { data, error } = await supabase.from('quizzes').select('id, title, start_at, end_at, status, subjects(name)').eq('is_published', true).in('status', ['upcoming', 'open']).order('start_at', { ascending: true }).limit(5);
    if (error) throw error;
    if (!data?.length) { showEmpty(el, 'لا توجد كويزات قادمة حالياً'); return; }
    el.innerHTML = data.map((q) => {
      const status = computeQuizStatus(q);
      const badgeClass = status === 'open' ? 'badge-success' : 'badge-info';
      return `
        <a href="/quizzes.html" class="list-item" style="text-decoration:none;color:inherit">
          <div class="list-item-icon" data-icon="clipboard"></div>
          <div class="list-item-body">
            <div class="list-item-title">${escapeHtml(q.title)}</div>
            <div class="list-item-desc">
              ${escapeHtml(q.subjects?.name || '')}
              ${q.start_at ? ` · ${formatDate(q.start_at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
              <span class="badge ${badgeClass}" style="margin-right:6px">${quizStatusLabel(status)}</span>
            </div>
          </div>
        </a>`;
    }).join('');
    initIcons();
  } catch (err) { console.error(err); showError(el, 'تعذر تحميل الكويزات'); }
}

async function loadAnnouncements() {
  const el = document.getElementById('announcements-list');
  try {
    const { data, error } = await supabase.from('announcements').select('id, title, content, importance, is_pinned, created_at').eq('is_published', true).or('expires_at.is.null,expires_at.gt.now()').order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(5);
    if (error) throw error;
    if (!data?.length) { showEmpty(el, 'لا توجد إعلانات حالياً'); return; }
    el.innerHTML = data.map((a) => `
      <a href="/announcements.html" class="list-item" style="text-decoration:none;color:inherit">
        <div class="list-item-icon" data-icon="megaphone"></div>
        <div class="list-item-body">
          <div class="list-item-title">${a.is_pinned ? '📌 ' : ''}${escapeHtml(a.title)}</div>
          <div class="list-item-desc">${escapeHtml((a.content || '').slice(0, 80))} · ${timeAgo(a.created_at)}</div>
        </div>
      </a>`).join('');
    initIcons();
  } catch (err) { console.error(err); showError(el, 'تعذر تحميل الإعلانات'); }
}

async function loadMaterials() {
  const el = document.getElementById('materials-list');
  try {
    const { data, error } = await supabase.from('materials').select('id, title, file_type, material_type, created_at, subjects(name)').eq('is_published', true).order('created_at', { ascending: false }).limit(5);
    if (error) throw error;
    if (!data?.length) { showEmpty(el, 'لا توجد ملفات مضافة بعد'); return; }
    el.innerHTML = data.map((m) => `
      <div class="list-item">
        <div class="list-item-icon" data-icon="file"></div>
        <div class="list-item-body">
          <div class="list-item-title">${escapeHtml(m.title)}</div>
          <div class="list-item-desc">${escapeHtml(m.subjects?.name || '')} · ${timeAgo(m.created_at)}</div>
        </div>
      </div>`).join('');
    initIcons();
  } catch (err) { console.error(err); showError(el, 'تعذر تحميل الملفات'); }
}

async function loadNotifCount() {
  try {
    const { data, error } = await supabase.rpc('get_unread_notifications_count');
    if (error) return;
    const badge = document.getElementById('notif-badge');
    if (data > 0) {
      badge.textContent = data > 99 ? '99+' : data;
      badge.classList.remove('hidden');
    }
  } catch {}
}

init();
