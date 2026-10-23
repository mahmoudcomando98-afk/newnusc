
/**
 * NUSC Student Hub - Announcements Page
 */

import { supabase } from './supabase.js';
import { protectPage } from './auth.js';

import {
  escapeHtml,
  timeAgo,
  showEmpty,
  showError,
  initIcons,
  setActiveNav
} from './utils.js';

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

function getPriority(announcement) {
  return (
    announcement.priority ||
    announcement.importance ||
    'normal'
  );
}

function getPriorityLabel(priority) {
  const labels = {
    urgent: 'عاجل',
    high: 'مهم',
    normal: 'عادي',
    low: 'منخفض'
  };

  return labels[priority] || 'إعلان';
}

function getPriorityClass(priority) {
  const classes = {
    urgent: 'badge-danger',
    high: 'badge-warning',
    normal: 'badge-info',
    low: 'badge-primary'
  };

  return classes[priority] || 'badge-info';
}

function isAnnouncementVisible(announcement) {
  if (announcement.is_published === false) return false;

  const expiry = announcement.expires_at;

  if (expiry) {
    const expiryTime = new Date(expiry).getTime();

    if (!Number.isNaN(expiryTime) && expiryTime < Date.now()) {
      return false;
    }
  }

  return true;
}

async function loadAnnouncements() {
  const el = document.getElementById('announcements-list');

  if (!el) {
    console.error('Missing #announcements-list in announcements.html');
    return;
  }

  el.innerHTML =
    '<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>';

  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('*');

    if (error) throw error;

    const announcements = (data || [])
      .filter(isAnnouncementVisible)
      .sort((a, b) => {
        const pinnedA = a.is_pinned ? 1 : 0;
        const pinnedB = b.is_pinned ? 1 : 0;

        if (pinnedA !== pinnedB) {
          return pinnedB - pinnedA;
        }

        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();

        return dateB - dateA;
      })
      .slice(0, 50);

    if (!announcements.length) {
      showEmpty(el, 'لا توجد إعلانات منشورة حاليًا');
      return;
    }

    // أسماء المواد اختيارية؛ فشل هذا الاستعلام لا يمنع عرض الإعلانات.
    let subjectNames = {};

    try {
      const { data: subjects, error: subjectsError } = await supabase
        .from('subjects')
        .select('id, name');

      if (subjectsError) throw subjectsError;

      subjectNames = Object.fromEntries(
        (subjects || []).map((subject) => [
          subject.id,
          subject.name
        ])
      );
    } catch (subjectError) {
      console.warn(
        'Could not load announcement subject names:',
        subjectError.message
      );
    }

    el.innerHTML = announcements.map((announcement) => {
      const priority = getPriority(announcement);
      const subjectName =
        announcement.subjects?.name ||
        subjectNames[announcement.subject_id] ||
        announcement.subject_name ||
        '';

      const createdText = announcement.created_at
        ? timeAgo(announcement.created_at)
        : '';
      const joinUrl = announcementJoinUrl(announcement);

      return `
        <article class="card mb-2">
          <div class="flex justify-between items-center flex-wrap gap-1">
            <h3 class="card-title">
              ${announcement.is_pinned ? '📌 ' : ''}
              ${escapeHtml(announcement.title || 'إعلان')}
            </h3>

            <span class="badge ${getPriorityClass(priority)}">
              ${escapeHtml(getPriorityLabel(priority))}
            </span>
          </div>

          ${
            subjectName
              ? `<p class="text-sm text-muted mt-1">${escapeHtml(subjectName)}</p>`
              : ''
          }

          <p class="text-sm mt-2" style="white-space:pre-wrap">${escapeHtml(announcement.content || announcement.body || '')}</p>

          ${
            joinUrl
              ? `<div class="mt-2"><a href="${escapeHtml(joinUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">${escapeHtml(announcement.link_label || 'دخول السيكشن أونلاين')}</a></div>`
              : announcement.link_status === 'coming_soon'
                ? '<div class="mt-2"><span class="badge badge-warning">رابط السيكشن قريبًا</span></div>'
                : ''
          }

          ${
            createdText
              ? `<div class="card-meta"><span>${escapeHtml(createdText)}</span></div>`
              : ''
          }
        </article>
      `;
    }).join('');

    initIcons();
  } catch (error) {
    console.error('Announcements loading error:', error);

    showError(
      el,
      'تعذر تحميل الإعلانات. راجع Console وسياسات القراءة في Supabase.'
    );
  }
}

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;

    setActiveNav('announcements');
    initIcons();

    await loadAnnouncements();
  } catch (error) {
    console.error('Announcements page initialization error:', error);

    const el = document.getElementById('announcements-list');

    if (el) {
      showError(el, 'تعذر فتح صفحة الإعلانات. حاول تسجيل الدخول مجددًا.');
    }
  }
}

init();
