
/**
 * NUSC Student Hub - Home Page
 * Corrected resource queries and safe profile rendering.
 */

import { supabase } from './supabase.js';
import { protectPage } from './auth.js';

import {
  escapeHtml,
  formatDate,
  timeAgo,
  showEmpty,
  showError,
  initIcons,
  setActiveNav,
  onConnectivityChange,
  quizStatusLabel
} from './utils.js';
import { isNewItem, isImportantItem, freshnessBadgesHtml, touchLastVisit } from './freshness.js';
import { cached } from './cache.js';

let profile = null;

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;

    profile = result.profile || null;
    setActiveNav('home');
    initIcons();
    setupUserChip();
    onConnectivityChange((online) => {
      const banner = document.getElementById('offline-banner');
      if (banner) banner.classList.toggle('hidden', online);
    });

    const name = profile?.full_name || 'طالب';
    const welcome = document.getElementById('welcome-text');
    if (welcome) welcome.textContent = `أهلاً، ${name}`;

    const short = document.getElementById('user-name-short');
    if (short) short.textContent = name.split(' ')[0] || name;

    const avatar = document.getElementById('user-avatar');
    if (avatar) avatar.textContent = (name.trim()[0] || '؟').toUpperCase();

    await Promise.all([
      loadSubjects(),
      loadLectures(),
      loadQuizzes(),
      loadAnnouncements(),
      loadImportantNotice(),
      loadMaterials(),
      loadNotifCount()
    ]);
  } catch (error) {
    console.error('[NUSC] home init:', error);
  }
}

function setupUserChip() {
  const chip = document.getElementById('user-chip');
  if (!chip) return;
  chip.addEventListener('click', () => {
    window.location.href = '/profile.html';
  });
}

async function loadSubjects() {
  const el = document.getElementById('subjects-list');
  if (!el) return;
  try {
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name, code, instructor, is_published')
      .eq('is_published', true)
      .order('name')
      .limit(8);
    if (error) throw error;
    if (!data?.length) {
      showEmpty(el, 'لا توجد مواد منشورة حالياً');
      return;
    }
    el.innerHTML = data
      .map(
        (s) => `
      <a class="card subject-card" href="/subject-details.html?id=${encodeURIComponent(s.id)}">
        <h3 class="card-title">${escapeHtml(s.name)}</h3>
        <p class="text-sm text-muted">${escapeHtml(s.code || '')}${s.instructor ? ' · ' + escapeHtml(s.instructor) : ''}</p>
      </a>`
      )
      .join('');
    initIcons();
  } catch (error) {
    console.error('[NUSC] loadSubjects:', error);
    showError(el, 'تعذر تحميل المواد.');
  }
}

async function loadLectures() {
  const el = document.getElementById('lectures-list');
  if (!el) return;
  try {
    const { data, error } = await supabase
      .from('lectures')
      .select('id, title, lecture_number, created_at, subject_id, subjects(name)')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    if (!data?.length) {
      showEmpty(el, 'لا توجد محاضرات بعد');
      return;
    }
    el.innerHTML = data
      .map(
        (lec) => `
      <a class="list-item" href="/lecture-details.html?id=${encodeURIComponent(lec.id)}" style="text-decoration:none;color:inherit">
        <div class="list-item-icon" data-icon="book-open"></div>
        <div class="list-item-body">
          <div class="list-item-title">${escapeHtml(lec.title || 'محاضرة')}</div>
          <div class="list-item-desc">${escapeHtml(lec.subjects?.name || '')} · ${timeAgo(lec.created_at)}</div>
        </div>
      </a>`
      )
      .join('');
    initIcons();
  } catch (error) {
    console.error('[NUSC] loadLectures:', error);
    showError(el, 'تعذر تحميل المحاضرات.');
  }
}

async function loadQuizzes() {
  const el = document.getElementById('quizzes-list');
  if (!el) return;
  try {
    const { data, error } = await supabase
      .from('quizzes')
      .select('id, title, start_at, status, is_published, subjects(name)')
      .eq('is_published', true)
      .order('start_at', { ascending: true })
      .limit(5);
    if (error) throw error;
    if (!data?.length) {
      showEmpty(el, 'لا توجد كويزات حالياً');
      return;
    }
    el.innerHTML = data
      .map((q) => {
        const st = q.status || 'upcoming';
        return `
        <a class="list-item" href="/quizzes.html" style="text-decoration:none;color:inherit">
          <div class="list-item-icon" data-icon="clipboard"></div>
          <div class="list-item-body">
            <div class="list-item-title">${escapeHtml(q.title || 'كويز')}</div>
            <div class="list-item-desc">${escapeHtml(q.subjects?.name || '')} · ${escapeHtml(quizStatusLabel(st))}</div>
          </div>
        </a>`;
      })
      .join('');
    initIcons();
  } catch (error) {
    console.error('[NUSC] loadQuizzes:', error);
    showError(el, 'تعذر تحميل الكويزات.');
  }
}

function announcementJoinUrl(item) {
  const raw = item?.link_url || item?.session_url || item?.meeting_url || '';
  if (typeof raw !== 'string' || !raw.trim()) return '';
  try {
    const u = new URL(raw.trim());
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

async function loadAnnouncements() {
  const el = document.getElementById('announcements-list');
  if (!el) return;
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, body, created_at, importance, priority, is_pinned, is_published, subject_id, link_url')
      .eq('is_published', true)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    if (!data?.length) {
      showEmpty(el, 'لا توجد إعلانات');
      return;
    }
    el.innerHTML = data
      .map((announcement) => {
        const level = announcement.importance || announcement.priority || 'normal';
        return `
        <div class="list-item announcement-item ${['urgent', 'high'].includes(level) ? 'announcement-important' : ''}">
          <div class="list-item-icon" data-icon="megaphone"></div>
          <div class="list-item-body">
            <div class="list-item-title">
              ${announcement.is_pinned ? '📌 ' : ''}${escapeHtml(announcement.title)}
              ${freshnessBadgesHtml(announcement)}
            </div>
            <div class="list-item-desc">${escapeHtml((announcement.content || announcement.body || '').slice(0, 80))} · ${timeAgo(announcement.created_at)}</div>
            <a href="/announcements.html" class="btn btn-sm btn-outline mt-1">عرض الإعلان</a>
          </div>
        </div>`;
      })
      .join('');
    initIcons();
  } catch (error) {
    console.error('[NUSC] loadAnnouncements:', error);
    showError(el, 'تعذر تحميل الإعلانات.');
  }
}

async function loadImportantNotice() {
  const box = document.getElementById('important-notice');
  if (!box) return;
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, body, created_at, importance, priority, is_pinned, link_url')
      .eq('is_published', true)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const notice = (data || [])[0];
    if (!notice) return;
    const level = notice.importance || notice.priority || '';
    if (!notice.is_pinned && !['high', 'urgent'].includes(String(level))) return;
    box.classList.remove('hidden');
    const t = document.getElementById('important-notice-title');
    const c = document.getElementById('important-notice-content');
    const tm = document.getElementById('important-notice-time');
    if (t) t.textContent = notice.title || '';
    if (c) c.textContent = notice.content || notice.body || '';
    if (tm) tm.textContent = timeAgo(notice.created_at);
  } catch (error) {
    console.warn('[NUSC] loadImportantNotice:', error);
  }
}

async function loadMaterials() {
  const el = document.getElementById('materials-list');
  if (!el) return;
  try {
    let data = null;
    let error = null;
    const full = await supabase
      .from('materials')
      .select('id, title, file_type, created_at, is_important, subjects(name)')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(5);
    data = full.data;
    error = full.error;
    if (
      error &&
      /is_important|column .* does not exist|PGRST204|42703/i.test(
        String(error.message || '') + String(error.code || '')
      )
    ) {
      const basic = await supabase
        .from('materials')
        .select('id, title, file_type, created_at, subjects(name)')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(5);
      data = basic.data;
      error = basic.error;
    }
    if (error) throw error;
    if (!data?.length) {
      showEmpty(el, 'لا توجد ملفات مضافة بعد');
      return;
    }
    el.innerHTML = data
      .map(
        (material) => `
      <div class="list-item">
        <div class="list-item-icon" data-icon="file"></div>
        <div class="list-item-body">
          <div class="list-item-title">${escapeHtml(material.title)} ${freshnessBadgesHtml(material)}</div>
          <div class="list-item-desc">
            ${escapeHtml(material.subjects?.name || '')}
            ${material.file_type ? ` · ${escapeHtml(material.file_type)}` : ''}
            · ${timeAgo(material.created_at)}
          </div>
        </div>
      </div>`
      )
      .join('');
    initIcons();
    touchLastVisit();
  } catch (error) {
    console.error('[NUSC] loadMaterials:', error);
    showError(el, 'تعذر تحميل الملفات. حاول مرة أخرى.');
  }
}

async function loadNotifCount() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('id')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    let readIds = [];
    try {
      const stored = JSON.parse(
        localStorage.getItem('nusc_read_announcements_' + (profile?.id || 'guest')) || '[]'
      );
      readIds = Array.isArray(stored) ? stored.map(String) : [];
    } catch {
      readIds = [];
    }
    const readSet = new Set(readIds);
    const unreadCount = (data || []).filter((item) => !readSet.has(String(item.id))).length;
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (error) {
    console.warn('[NUSC] loadNotifCount:', error);
    badge.classList.add('hidden');
  }
}

init();
