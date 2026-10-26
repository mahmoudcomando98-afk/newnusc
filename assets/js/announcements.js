
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
import { cachedStaleWhileRevalidate } from './cache.js';

function getPriority(announcement) {
  return String(announcement.importance || announcement.priority || 'normal').toLowerCase();
}

function priorityLabel(priority) {
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
    if (!Number.isNaN(expiryTime) && expiryTime < Date.now()) return false;
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
    const data = await cachedStaleWhileRevalidate(
      'page:announcements',
      async () => {
        const { data, error } = await supabase.from('announcements').select('*');
        if (error) throw error;
        return data || [];
      },
      { ttlMs: 2 * 60 * 1000 }
    );

    const announcements = (data || [])
      .filter(isAnnouncementVisible)
      .sort((a, b) => {
        const pinnedA = a.is_pinned ? 1 : 0;
        const pinnedB = b.is_pinned ? 1 : 0;
        if (pinnedA !== pinnedB) return pinnedB - pinnedA;
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      })
      .slice(0, 50);

    if (!announcements.length) {
      showEmpty(el, 'لا توجد إعلانات منشورة حاليًا');
      return;
    }

    let subjectNames = {};
    try {
      const { data: subjects, error: subjectsError } = await supabase
        .from('subjects')
        .select('id, name');
      if (subjectsError) throw subjectsError;
      subjectNames = Object.fromEntries(
        (subjects || []).map((subject) => [subject.id, subject.name])
      );
    } catch (subjectError) {
      console.warn('Could not load announcement subject names:', subjectError.message);
    }

    el.innerHTML = announcements
      .map((announcement) => {
        const priority = getPriority(announcement);
        const subjectName =
          announcement.subjects?.name ||
          subjectNames[announcement.subject_id] ||
          '';
        const body = announcement.content || announcement.body || '';
        return `
        <article class="card announcement-card ${['urgent', 'high'].includes(priority) ? 'announcement-important' : ''}">
          <div class="card-header-row">
            <h3 class="card-title">${announcement.is_pinned ? '📌 ' : ''}${escapeHtml(announcement.title || 'إعلان')}</h3>
            <span class="badge ${getPriorityClass(priority)}">${escapeHtml(priorityLabel(priority))}</span>
          </div>
          ${subjectName ? `<p class="text-sm text-muted">${escapeHtml(subjectName)}</p>` : ''}
          <p class="mt-1">${escapeHtml(String(body))}</p>
          <p class="text-sm text-muted mt-2">${timeAgo(announcement.created_at)}</p>
        </article>`;
      })
      .join('');

    initIcons();
  } catch (error) {
    console.error('Announcements loading error:', error);
    showError(el, 'تعذر تحميل الإعلانات. حاول مرة أخرى.');
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
    console.error('Announcements init error:', error);
    const el = document.getElementById('announcements-list');
    if (el) showError(el, 'تعذر فتح صفحة الإعلانات.');
  }
}

init();
