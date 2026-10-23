/**
 * NUSC Student Hub - Announcements
 */

import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import {
  escapeHtml,
  timeAgo,
  showEmpty,
  showError,
  initIcons,
  setActiveNav,
  importanceLabel
} from './utils.js';

async function init() {
  const result = await protectPage();
  if (!result) return;

  setActiveNav('announcements');
  initIcons();
  await loadAnnouncements();
}

async function loadAnnouncements() {
  const el = document.getElementById('announcements-list');
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, importance, is_pinned, created_at, subjects(name)')
      .eq('is_published', true)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    if (!data?.length) {
      showEmpty(el, 'لا توجد إعلانات حالياً');
      return;
    }

    const importanceBadge = {
      urgent: 'badge-danger',
      high: 'badge-warning',
      normal: 'badge-info',
      low: 'badge-primary'
    };

    el.innerHTML = data.map((a) => `
      <div class="card mb-2">
        <div class="flex justify-between items-center flex-wrap gap-1">
          <h3 class="card-title">${a.is_pinned ? '📌 ' : ''}${escapeHtml(a.title)}</h3>
          <span class="badge ${importanceBadge[a.importance] || 'badge-info'}">${importanceLabel(a.importance)}</span>
        </div>
        <p class="text-sm mt-1" style="white-space:pre-wrap">${escapeHtml(a.content)}</p>
        <div class="card-meta">
          ${a.subjects?.name ? `<span>${escapeHtml(a.subjects.name)}</span>` : ''}
          <span>${timeAgo(a.created_at)}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
    showError(el, 'تعذر تحميل الإعلانات');
  }
}

init();
