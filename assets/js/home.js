
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

let profile = null;

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;

    profile = result.profile || null;

    setActiveNav('home');
    initIcons();
    setupUserUI();
    setupOffline();

    document.getElementById('user-chip')?.addEventListener('click', () => {
      window.location.href = '/profile.html';
    });

    // Each section handles its own errors so one failed query
    // does not prevent the other sections from loading.
    await Promise.allSettled([
      loadSubjects(),
      loadLectures(),
      loadQuizzes(),
      loadAnnouncements(),
      loadMaterials(),
      loadNotifCount()
    ]);
  } catch (error) {
    console.error('[NUSC] Home initialization failed:', error);
  }
}

function setupUserUI() {
  const name = profile?.full_name?.trim() || 'طالب';

  const welcome = document.getElementById('welcome-text');
  const shortName = document.getElementById('user-name-short');
  const avatar = document.getElementById('user-avatar');

  if (welcome) {
    welcome.textContent = `أهلاً بك، ${name}`;
  }

  if (shortName) {
    shortName.textContent = name.split(/\s+/)[0] || 'طالب';
  }

  if (avatar) {
    if (profile?.avatar_url) {
      const img = document.createElement('img');
      img.src = profile.avatar_url;
      img.alt = '';
      avatar.replaceChildren(img);
    } else {
      avatar.textContent = name.charAt(0) || 'ط';
    }
  }
}

function setupOffline() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;

  onConnectivityChange((online) => {
    banner.classList.toggle('show', !online);
  });

  if (!navigator.onLine) {
    banner.classList.add('show');
  }
}

async function loadSubjects() {
  const el = document.getElementById('subjects-list');
  if (!el) return;

  try {
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name, code, instructor, description')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(6);

    if (error) throw error;

    if (!data?.length) {
      showEmpty(el, 'لا توجد مواد متاحة حالياً');
      return;
    }

    el.innerHTML = data.map((subject) => `
      <div class="card subject-card">
        <h3 class="card-title">${escapeHtml(subject.name)}</h3>
        ${subject.code
          ? `<span class="badge badge-primary">${escapeHtml(subject.code)}</span>`
          : ''}
        ${subject.instructor
          ? `<p class="text-sm text-muted mt-1">${escapeHtml(subject.instructor)}</p>`
          : ''}
        ${subject.description
          ? `<p class="text-sm text-muted mt-1">${escapeHtml(subject.description.slice(0, 80))}${subject.description.length > 80 ? '...' : ''}</p>`
          : ''}
        <a href="/subject-details.html?id=${encodeURIComponent(subject.id)}"
           class="btn btn-outline btn-sm mt-2">فتح المادة</a>
      </div>
    `).join('');
  } catch (error) {
    console.error('[NUSC] loadSubjects:', error);
    showError(el, 'تعذر تحميل المواد. حاول مرة أخرى.');
  }
}

async function loadLectures() {
  const el = document.getElementById('lectures-list');
  if (!el) return;

  try {
    const { data, error } = await supabase
      .from('lectures')
      .select('id, title, lecture_number, created_at, subjects(name)')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    if (!data?.length) {
      showEmpty(el, 'لا توجد محاضرات مضافة بعد');
      return;
    }

    el.innerHTML = data.map((lecture) => `
      <a href="/lecture-details.html?id=${encodeURIComponent(lecture.id)}"
         class="list-item" style="text-decoration:none;color:inherit">
        <div class="list-item-icon" data-icon="file"></div>
        <div class="list-item-body">
          <div class="list-item-title">
            ${escapeHtml(lecture.title)}
            ${lecture.lecture_number
              ? ` (محاضرة ${escapeHtml(lecture.lecture_number)})`
              : ''}
          </div>
          <div class="list-item-desc">
            ${escapeHtml(lecture.subjects?.name || '')}
            · ${timeAgo(lecture.created_at)}
          </div>
        </div>
      </a>
    `).join('');

    initIcons();
  } catch (error) {
    console.error('[NUSC] loadLectures:', error);
    showError(el, 'تعذر تحميل المحاضرات. حاول مرة أخرى.');
  }
}

function getQuizStatus(quiz) {
  const now = Date.now();
  const start = quiz.quiz_date
    ? new Date(quiz.quiz_date).getTime()
    : 0;

  if (quiz.status === 'closed') return 'closed';
  if (start && now < start) return 'upcoming';

  return 'open';
}

async function loadQuizzes() {
  const el = document.getElementById('quizzes-list');
  if (!el) return;

  try {
    const { data, error } = await supabase
      .from('quizzes')
      .select('id, title, description, rules, quiz_date, duration_minutes, status, subjects(name)')
      .eq('is_published', true)
      .order('quiz_date', { ascending: true, nullsFirst: false })
      .limit(5);

    if (error) throw error;

    const quizzes = (data || []).filter((quiz) => {
      const status = getQuizStatus(quiz);
      return status === 'upcoming' || status === 'open';
    });

    if (!quizzes.length) {
      showEmpty(el, 'لا توجد كويزات قادمة حالياً');
      return;
    }

    el.innerHTML = quizzes.map((quiz) => {
      const status = getQuizStatus(quiz);
      const badgeClass = status === 'open'
        ? 'badge-success'
        : 'badge-info';

      return `
        <a href="/quizzes.html" class="list-item"
           style="text-decoration:none;color:inherit">
          <div class="list-item-icon" data-icon="clipboard"></div>
          <div class="list-item-body">
            <div class="list-item-title">${escapeHtml(quiz.title)}</div>
            <div class="list-item-desc">
              ${escapeHtml(quiz.subjects?.name || '')}
              ${quiz.quiz_date
                ? ` · ${formatDate(quiz.quiz_date, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}`
                : ''}
              <span class="badge ${badgeClass}" style="margin-right:6px">
                ${quizStatusLabel(status)}
              </span>
            </div>
          </div>
        </a>
      `;
    }).join('');

    initIcons();
  } catch (error) {
    console.error('[NUSC] loadQuizzes:', error);
    showError(el, 'تعذر تحميل الكويزات. حاول مرة أخرى.');
  }
}

async function loadAnnouncements() {
  const el = document.getElementById('announcements-list');
  if (!el) return;

  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, priority, is_pinned, created_at, expires_at')
      .eq('is_published', true)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    if (!data?.length) {
      showEmpty(el, 'لا توجد إعلانات حالياً');
      return;
    }

    el.innerHTML = data.map((announcement) => `
      <a href="/announcements.html" class="list-item"
         style="text-decoration:none;color:inherit">
        <div class="list-item-icon" data-icon="megaphone"></div>
        <div class="list-item-body">
          <div class="list-item-title">
            ${announcement.is_pinned ? '📌 ' : ''}
            ${escapeHtml(announcement.title)}
          </div>
          <div class="list-item-desc">
            ${escapeHtml((announcement.content || '').slice(0, 80))}
            · ${timeAgo(announcement.created_at)}
          </div>
        </div>
      </a>
    `).join('');

    initIcons();
  } catch (error) {
    console.error('[NUSC] loadAnnouncements:', error);
    showError(el, 'تعذر تحميل الإعلانات. حاول مرة أخرى.');
  }
}

async function loadMaterials() {
  const el = document.getElementById('materials-list');
  if (!el) return;

  try {
    const { data, error } = await supabase
      .from('materials')
      .select('id, title, file_type, created_at, subjects(name)')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    if (!data?.length) {
      showEmpty(el, 'لا توجد ملفات مضافة بعد');
      return;
    }

    el.innerHTML = data.map((material) => `
      <div class="list-item">
        <div class="list-item-icon" data-icon="file"></div>
        <div class="list-item-body">
          <div class="list-item-title">${escapeHtml(material.title)}</div>
          <div class="list-item-desc">
            ${escapeHtml(material.subjects?.name || '')}
            ${material.file_type
              ? ` · ${escapeHtml(material.file_type)}`
              : ''}
            · ${timeAgo(material.created_at)}
          </div>
        </div>
      </div>
    `).join('');

    initIcons();
  } catch (error) {
    console.error('[NUSC] loadMaterials:', error);
    showError(el, 'تعذر تحميل الملفات. حاول مرة أخرى.');
  }
}

async function loadNotifCount() {
  try {
    const { data, error } = await supabase.rpc(
      'get_unread_notifications_count'
    );

    if (error) {
      console.warn('[NUSC] Notification count:', error.message);
      return;
    }

    const badge = document.getElementById('notif-badge');
    if (!badge) return;

    if (data > 0) {
      badge.textContent = data > 99 ? '99+' : String(data);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (error) {
    console.warn('[NUSC] loadNotifCount:', error);
  }
}

init();
