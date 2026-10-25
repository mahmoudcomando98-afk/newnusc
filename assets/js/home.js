
/**
 * NUSC Student Hub - Home Page
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
      .select('*')
      .order('name', { ascending: true })
      .limit(50);
    if (error) throw error;

    const rows = (data || [])
      .filter((s) => s.is_published !== false && s.is_active !== false)
      .slice(0, 6);

    if (!rows.length) {
      showEmpty(el, 'لا توجد مواد حالياً.');
      return;
    }

    el.innerHTML = rows
      .map((s) => {
        const title = s.name || s.title || 'مادة';
        const code = s.code || s.subject_code || '';
        const instructor = s.instructor || s.doctor || s.teacher || '';
        return `
      <a class="card subject-card home-subject-card" href="/subject-details.html?id=${encodeURIComponent(s.id)}">
        ${code ? `<span class="subject-code-badge">${escapeHtml(code)}</span>` : ''}
        <h3 class="card-title">${escapeHtml(title)}</h3>
        ${instructor ? `<p class="text-sm text-muted home-subject-meta">${escapeHtml(instructor)}</p>` : '<p class="home-subject-meta"></p>'}
        <span class="btn btn-sm btn-primary home-subject-open">افتح المادة</span>
      </a>`;
      })
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
    let lectureRows = [];
    try {
      const { data, error } = await supabase
        .from('lectures')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error) {
        lectureRows = (data || []).filter((r) => r.is_published !== false && r.is_active !== false);
      }
    } catch (e) {
      console.warn('[NUSC] lectures table:', e);
    }

    let materialLectures = [];
    const mat = await supabase
      .from('materials')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (!mat.error) {
      materialLectures = (mat.data || [])
        .filter((m) => m.is_published !== false)
        .filter((m) => {
          const t = String(m.material_type || 'lecture').toLowerCase();
          return !['section', 'assignment', 'quiz'].includes(t);
        });
    }

    const subjectIds = [
      ...new Set(
        [...lectureRows, ...materialLectures].map((x) => x.subject_id).filter(Boolean)
      )
    ];
    let subjectNames = {};
    if (subjectIds.length) {
      const { data: subjects } = await supabase.from('subjects').select('id, name').in('id', subjectIds);
      subjectNames = Object.fromEntries((subjects || []).map((s) => [s.id, s.name]));
    }

    const feed = [
      ...lectureRows.map((lec) => ({
        key: 'lec-' + lec.id,
        title: lec.title || 'محاضرة',
        subject: subjectNames[lec.subject_id] || '',
        created_at: lec.published_at || lec.created_at,
        href: `/lecture-details.html?id=${encodeURIComponent(lec.id)}`
      })),
      ...materialLectures.map((m) => ({
        key: 'mat-' + m.id,
        title: m.title || 'محاضرة',
        subject: subjectNames[m.subject_id] || m.file_type || '',
        created_at: m.created_at,
        href: m.subject_id
          ? `/subject-details.html?id=${encodeURIComponent(m.subject_id)}`
          : '/subjects.html'
      }))
    ]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 3);

    if (!feed.length) {
      showEmpty(el, 'لا توجد محاضرات بعد');
      return;
    }

    el.innerHTML = feed
      .map(
        (item) => `
      <a class="list-item" href="${escapeHtml(item.href)}" style="text-decoration:none;color:inherit">
        <div class="list-item-icon" data-icon="book-open"></div>
        <div class="list-item-body">
          <div class="list-item-title">${escapeHtml(item.title)}</div>
          <div class="list-item-desc">${escapeHtml(item.subject)} · ${timeAgo(item.created_at)}</div>
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
    const { data, error } = await supabase.from('quizzes').select('*').order('start_at', { ascending: true }).limit(15);
    if (error) throw error;
    const rows = (data || []).filter((q) => q.is_published !== false);
    if (!rows.length) {
      showEmpty(el, 'لا توجد كويزات حالياً');
      return;
    }
    const ids = [...new Set(rows.map((q) => q.subject_id).filter(Boolean))];
    let subjectNames = {};
    if (ids.length) {
      const { data: subjects } = await supabase.from('subjects').select('id, name').in('id', ids);
      subjectNames = Object.fromEntries((subjects || []).map((s) => [s.id, s.name]));
    }
    el.innerHTML = rows
      .slice(0, 5)
      .map((q) => {
        const st = q.status || 'upcoming';
        return `
        <a class="list-item" href="/quizzes.html" style="text-decoration:none;color:inherit">
          <div class="list-item-icon" data-icon="clipboard"></div>
          <div class="list-item-body">
            <div class="list-item-title">${escapeHtml(q.title || 'كويز')}</div>
            <div class="list-item-desc">${escapeHtml(subjectNames[q.subject_id] || '')} · ${escapeHtml(quizStatusLabel(st))}</div>
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
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;

    const now = Date.now();
    const rows = (data || [])
      .filter((a) => a.is_published !== false)
      .filter((a) => {
        if (!a.expires_at) return true;
        const t = new Date(a.expires_at).getTime();
        return Number.isNaN(t) || t > now;
      })
      .sort((a, b) => {
        const pin = Number(!!b.is_pinned) - Number(!!a.is_pinned);
        if (pin) return pin;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });

    if (!rows.length) {
      showEmpty(el, 'لا توجد إعلانات منشورة حالياً');
      return;
    }

    el.innerHTML = rows
      .slice(0, 2)
      .map((announcement) => {
        const level = String(announcement.importance || announcement.priority || 'normal').toLowerCase();
        const body = announcement.content || announcement.body || announcement.description || '';
        return `
        <div class="list-item announcement-item ${['urgent', 'high'].includes(level) ? 'announcement-important' : ''}">
          <div class="list-item-icon" data-icon="megaphone"></div>
          <div class="list-item-body">
            <div class="list-item-title">
              ${announcement.is_pinned ? '📌 ' : ''}${escapeHtml(announcement.title || 'إعلان')}
              ${freshnessBadgesHtml(announcement)}
            </div>
            <div class="list-item-desc">${escapeHtml(String(body).slice(0, 100))}${announcement.created_at ? ' · ' + timeAgo(announcement.created_at) : ''}</div>
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
    const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    const notice = (data || []).find((n) => {
      if (n.is_published === false) return false;
      const level = String(n.importance || n.priority || '');
      return n.is_pinned || ['high', 'urgent'].includes(level);
    });
    if (!notice) return;
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
    const res = await supabase.from('materials').select('*').order('created_at', { ascending: false }).limit(20);
    if (res.error) throw res.error;
    const data = (res.data || []).filter((m) => m.is_published !== false);
    if (!data.length) {
      showEmpty(el, 'لا توجد ملفات مضافة بعد');
      return;
    }
    const ids = [...new Set(data.map((m) => m.subject_id).filter(Boolean))];
    let subjectNames = {};
    if (ids.length) {
      const { data: subjects } = await supabase.from('subjects').select('id, name').in('id', ids);
      subjectNames = Object.fromEntries((subjects || []).map((s) => [s.id, s.name]));
    }
    el.innerHTML = data
      .slice(0, 3)
      .map((material) => {
        const subjectName = subjectNames[material.subject_id] || '';
        const href = material.subject_id
          ? `/subject-details.html?id=${encodeURIComponent(material.subject_id)}`
          : '/subjects.html';
        return `
      <a class="list-item" href="${escapeHtml(href)}" style="text-decoration:none;color:inherit">
        <div class="list-item-icon" data-icon="file"></div>
        <div class="list-item-body">
          <div class="list-item-title">${escapeHtml(material.title || 'ملف')} ${freshnessBadgesHtml(material)}</div>
          <div class="list-item-desc">
            ${escapeHtml(subjectName)}
            ${material.file_type ? ` · ${escapeHtml(material.file_type)}` : ''}
            · ${timeAgo(material.created_at)}
          </div>
        </div>
      </a>`;
      })
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
    const { data, error } = await supabase.from('announcements').select('id, is_published').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    let readIds = [];
    try {
      const stored = JSON.parse(localStorage.getItem('nusc_read_announcements_' + (profile?.id || 'guest')) || '[]');
      readIds = Array.isArray(stored) ? stored.map(String) : [];
    } catch {
      readIds = [];
    }
    const readSet = new Set(readIds);
    const unreadCount = (data || []).filter((item) => item.is_published !== false).filter((item) => !readSet.has(String(item.id))).length;
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
