/**
 * NUSC Student Hub - Home Page (fast path)
 */

import { protectPage } from './auth.js';
import {
  escapeHtml,
  timeAgo,
  formatTime,
  showEmpty,
  showError,
  initIcons,
  setActiveNav,
  onConnectivityChange,
  quizStatusLabel
} from './utils.js';
import { supabase } from './supabase.js';
import { freshnessBadgesHtml, touchLastVisit } from './freshness.js';
import { cachedStaleWhileRevalidate } from './cache.js';
import {
  fetchSubjects,
  fetchAnnouncements,
  fetchMaterials,
  fetchQuizzes,
  fetchLectureFeed,
  fetchSubjectNames
} from './data-api.js';

const TTL = 2 * 60 * 1000;
let profile = null;

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;

    profile = result.profile || null;
    setActiveNav('home');
    initIcons();
    setupUserChip();
    setupPushBanner(result.user?.id || result.session?.user?.id);
    onConnectivityChange((online) => {
      const banner = document.getElementById('offline-banner');
      if (banner) banner.classList.toggle('hidden', online);
    });

    const name = (profile?.full_name || profile?.name || 'طالب').trim() || 'طالب';
    const welcomeName = document.getElementById('welcome-name');
    if (welcomeName) welcomeName.textContent = `أهلاً، ${name}`;

    const welcomeText = document.getElementById('welcome-text');
    if (welcomeText) welcomeText.textContent = `أهلاً، ${name}`;

    const short = document.getElementById('user-name-short');
    if (short) short.textContent = name.split(' ')[0] || name;

    const avatar = document.getElementById('user-avatar');
    if (avatar) avatar.textContent = (name.trim()[0] || '؟').toUpperCase();

    await Promise.all([
      loadSubjects(),
      loadAnnouncements(),
      loadImportantNotice(),
      loadLiveOnlineSections()
    ]);

    await Promise.all([
      loadLectures(),
      loadQuizzes(),
      loadMaterials(),
      loadNotifCount()
    ]);
  } catch (error) {
    console.error('[NUSC] home init:', error);
  }
}

function setupPushBanner(userId) {
  const banner = document.getElementById('push-enable-banner');
  const btn = document.getElementById('enable-push-btn');
  if (!banner || !btn || !userId) return;

  import('./push.js')
    .then(async (m) => {
      if (!m.pushSupported()) {
        banner.classList.add('hidden');
        return;
      }
      const perm = m.notificationPermission();
      if (perm === 'granted') {
        m.initPushNotifications(userId, { welcome: false }).catch(() => {});
        banner.classList.add('hidden');
        return;
      }
      if (perm === 'denied') {
        banner.classList.remove('hidden');
        btn.textContent = 'مرفوض من الإعدادات';
        btn.disabled = true;
        return;
      }
      banner.classList.remove('hidden');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '...';
        const res = await m.enablePushFromUserGesture(userId);
        if (res.ok) {
          banner.classList.add('hidden');
          try {
            const { showToast } = await import('./utils.js');
            showToast('تم تفعيل إشعارات التليفون', 'success');
          } catch { /* ignore */ }
        } else {
          btn.disabled = false;
          btn.textContent = 'تفعيل';
          if (res.reason === 'denied') {
            btn.textContent = 'مرفوض من الإعدادات';
            btn.disabled = true;
          } else if (res.reason === 'unsupported') {
            btn.textContent = 'الجهاز لا يدعم';
            btn.disabled = true;
          }
        }
      });
    })
    .catch(() => {});
}

function setupUserChip() {
  const chip = document.getElementById('user-chip');
  if (!chip) return;
  chip.addEventListener('click', () => {
    window.location.href = '/profile.html';
  });
}

function renderSubjects(rows) {
  const el = document.getElementById('subjects-list');
  if (!el) return;
  const list = (rows || []).slice(0, 6);
  if (!list.length) {
    showEmpty(el, 'لا توجد مواد حالياً.');
    return;
  }
  el.innerHTML = list
    .map((s) => {
      const title = s.name || s.title || 'مادة';
      const code = s.code || s.subject_code || '';
      const instructor = s.instructor || s.doctor_name || '';
      return `
      <a class="card subject-card home-subject-card" href="/subject-details.html?id=${encodeURIComponent(s.id)}">
        <div class="home-subject-card-top">
          <span class="home-subject-symbol" aria-hidden="true"><span data-icon="book"></span></span>
          ${code ? `<span class="subject-code-badge">${escapeHtml(code)}</span>` : '<span class="subject-code-badge">مادة دراسية</span>'}
        </div>
        <h3 class="card-title">${escapeHtml(title)}</h3>
        ${instructor ? `<p class="text-sm text-muted home-subject-meta">${escapeHtml(instructor)}</p>` : '<p class="home-subject-meta home-subject-meta-empty">المحتوى الدراسي والمحاضرات</p>'}
        <span class="home-subject-open"><span>فتح المادة</span><span class="home-subject-arrow" aria-hidden="true">←</span></span>
      </a>`;
    })
    .join('');
  initIcons();
}

async function loadSubjects() {
  const el = document.getElementById('subjects-list');
  if (!el) return;
  try {
    const data = await cachedStaleWhileRevalidate(
      'home:subjects',
      () => fetchSubjects(12),
      { ttlMs: TTL, onUpdate: renderSubjects }
    );
    renderSubjects(data);
  } catch (error) {
    console.error('[NUSC] loadSubjects:', error);
    showError(el, 'تعذر تحميل المواد.');
  }
}

function renderLectures(feed) {
  const el = document.getElementById('lectures-list');
  if (!el) return;
  const list = (feed || []).slice(0, 3);
  if (!list.length) {
    showEmpty(el, 'لا توجد محاضرات حديثة.');
    return;
  }
  el.innerHTML = list
    .map(
      (item) => `
      <a class="list-item" href="${item.href || '/subjects.html'}" style="text-decoration:none;color:inherit">
        <div class="list-item-icon" data-icon="book-open"></div>
        <div class="list-item-body">
          <div class="list-item-title">${escapeHtml(item.title)} ${freshnessBadgesHtml(item)}</div>
          <div class="list-item-desc">${escapeHtml(item.subject)} · ${timeAgo(item.created_at)}</div>
        </div>
      </a>`
    )
    .join('');
  initIcons();
}

async function loadLectures() {
  const el = document.getElementById('lectures-list');
  if (!el) return;
  try {
    const data = await cachedStaleWhileRevalidate(
      'home:lectures',
      () => fetchLectureFeed(8),
      { ttlMs: TTL, onUpdate: renderLectures }
    );
    renderLectures(data);
  } catch (error) {
    console.error('[NUSC] loadLectures:', error);
    showError(el, 'تعذر تحميل المحاضرات.');
  }
}

function renderQuizzes(rows, subjectNames = {}) {
  const el = document.getElementById('quizzes-list');
  if (!el) return;
  const list = (rows || []).slice(0, 3);
  if (!list.length) {
    showEmpty(el, 'لا توجد كويزات حالياً.');
    return;
  }
  el.innerHTML = list
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
}

async function loadQuizzes() {
  const el = document.getElementById('quizzes-list');
  if (!el) return;
  try {
    const data = await cachedStaleWhileRevalidate(
      'home:quizzes',
      async () => {
        const rows = await fetchQuizzes(10);
        const ids = [...new Set(rows.map((q) => q.subject_id).filter(Boolean))];
        const names = await fetchSubjectNames(ids);
        return { rows, names };
      },
      {
        ttlMs: TTL,
        onUpdate: (fresh) => renderQuizzes(fresh.rows, fresh.names)
      }
    );
    renderQuizzes(data.rows, data.names);
  } catch (error) {
    console.error('[NUSC] loadQuizzes:', error);
    showError(el, 'تعذر تحميل الكويزات.');
  }
}

function renderAnnouncements(rows) {
  const el = document.getElementById('announcements-list');
  if (!el) return;
  const list = (rows || []).slice(0, 2);
  if (!list.length) {
    showEmpty(el, 'لا توجد إعلانات.');
    return;
  }
  el.innerHTML = list
    .map((a) => {
      const level = String(a.importance || a.priority || 'normal');
      return `
        <div class="list-item announcement-item ${['urgent', 'high'].includes(level) ? 'announcement-important' : ''}">
          <div class="list-item-icon" data-icon="megaphone"></div>
          <div class="list-item-body">
            <div class="list-item-title">${a.is_pinned ? '📌 ' : ''}${escapeHtml(a.title || 'إعلان')}</div>
            <div class="list-item-desc">${escapeHtml((a.content || a.body || '').slice(0, 120))} · ${timeAgo(a.created_at)}</div>
          </div>
        </div>`;
    })
    .join('');
  initIcons();
}

async function loadAnnouncements() {
  const el = document.getElementById('announcements-list');
  if (!el) return;
  try {
    const data = await cachedStaleWhileRevalidate(
      'home:announcements',
      () => fetchAnnouncements(30),
      { ttlMs: TTL, onUpdate: renderAnnouncements }
    );
    renderAnnouncements(data);
  } catch (error) {
    console.error('[NUSC] loadAnnouncements:', error);
    showError(el, 'تعذر تحميل الإعلانات.');
  }
}

async function loadImportantNotice() {
  const box = document.getElementById('important-notice');
  if (!box) return;
  try {
    const data = await cachedStaleWhileRevalidate(
      'home:announcements',
      () => fetchAnnouncements(30),
      { ttlMs: TTL }
    );
    const visible = (data || []).filter((n) => n && n.is_published !== false);
    let notice = visible.find((n) => {
      const level = String(n.importance || n.priority || '');
      return n.is_pinned || ['high', 'urgent'].includes(level);
    });
    if (!notice && visible.length) notice = visible[0];
    if (!notice) {
      box.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden');
    const t =
      document.getElementById('notice-title') ||
      document.getElementById('important-notice-title');
    const c =
      document.getElementById('notice-text') ||
      document.getElementById('important-notice-content');
    const tm = document.getElementById('important-notice-time');
    if (t) t.textContent = notice.title || 'إشعار مهم';
    if (c) c.textContent = notice.content || notice.body || '';
    if (tm) tm.textContent = timeAgo(notice.created_at);
    try { initIcons(); } catch { /* ignore */ }
  } catch (error) {
    console.warn('[NUSC] loadImportantNotice:', error);
  }
}

function renderMaterials(rows, subjectNames = {}) {
  const el = document.getElementById('materials-list');
  if (!el) return;
  const list = (rows || []).slice(0, 3);
  if (!list.length) {
    showEmpty(el, 'لا توجد ملفات مضافة بعد');
    return;
  }
  el.innerHTML = list
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
}

async function loadMaterials() {
  const el = document.getElementById('materials-list');
  if (!el) return;
  try {
    const data = await cachedStaleWhileRevalidate(
      'home:materials',
      async () => {
        const rows = await fetchMaterials(20);
        const ids = [...new Set(rows.map((m) => m.subject_id).filter(Boolean))];
        const names = await fetchSubjectNames(ids);
        return { rows, names };
      },
      {
        ttlMs: TTL,
        onUpdate: (fresh) => renderMaterials(fresh.rows, fresh.names)
      }
    );
    renderMaterials(data.rows, data.names);
  } catch (error) {
    console.error('[NUSC] loadMaterials:', error);
    showError(el, 'تعذر تحميل الملفات. حاول مرة أخرى.');
  }
}

function parseTimeToMinutes(t) {
  if (!t) return null;
  const s = String(t).slice(0, 8);
  const parts = s.split(':').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0])) return null;
  return parts[0] * 60 + (parts[1] || 0);
}

function isSectionLiveNow(row, now = new Date()) {
  const day = Number(row.day_of_week);
  if (!Number.isInteger(day) || day < 0 || day > 6) return false;
  if (now.getDay() !== day) return false;
  const start = parseTimeToMinutes(row.start_time);
  if (start == null) return false;
  let end = parseTimeToMinutes(row.end_time);
  if (end == null) end = start + 120;
  if (end <= start) end += 24 * 60;
  const nowM = now.getHours() * 60 + now.getMinutes();
  return nowM >= start - 15 && nowM <= end + 10;
}

async function loadLiveOnlineSections() {
  const el = document.getElementById('live-online-sections');
  if (!el) return;
  try {
    const { data, error } = await supabase
      .from('online_sections')
      .select('id, day_of_week, start_time, end_time, course_name, instructor, join_url, is_published')
      .eq('is_published', true);
    if (error) throw error;
    const live = (data || []).filter((row) => row.join_url && isSectionLiveNow(row));
    if (!live.length) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="live-os-card">
        <div class="live-os-head">
          <span class="live-os-dot" aria-hidden="true"></span>
          <strong>سكاشن شغالة دلوقتي</strong>
        </div>
        <ul class="live-os-list">
          ${live
            .map((row) => {
              const time =
                formatTime(row.start_time) +
                (row.end_time ? ' – ' + formatTime(row.end_time) : '');
              const meta = [row.instructor, time].filter(Boolean).join(' · ');
              return `
              <li class="live-os-item">
                <div class="live-os-info">
                  <div class="live-os-title">${escapeHtml(row.course_name || 'سكشن')}</div>
                  ${meta ? `<div class="live-os-meta">${escapeHtml(meta)}</div>` : ''}
                </div>
                <a class="btn btn-sm btn-primary" href="${escapeHtml(row.join_url)}" target="_blank" rel="noopener noreferrer">دخول السكشن</a>
              </li>`;
            })
            .join('')}
        </ul>
      </div>`;
  } catch (error) {
    console.warn('[NUSC] loadLiveOnlineSections:', error);
    el.classList.add('hidden');
  }
}

async function loadNotifCount() {
  const badge =
    document.getElementById('notif-badge') ||
    document.getElementById('notif-dot');
  if (!badge) return;
  try {
    const data = await cachedStaleWhileRevalidate(
      'home:announcements',
      () => fetchAnnouncements(100),
      { ttlMs: TTL }
    );
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
      if (badge.id === 'notif-badge') {
        badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      }
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
