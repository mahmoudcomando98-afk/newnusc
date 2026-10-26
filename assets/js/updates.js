/**
 * Latest updates: materials + announcements (cached SWR).
 */
import { protectPage } from './auth.js';
import { escapeHtml, timeAgo, showEmpty, showError, initIcons, setActiveNav } from './utils.js';
import { freshnessBadgesHtml, touchLastVisit } from './freshness.js';
import { cachedStaleWhileRevalidate } from './cache.js';
import { fetchMaterials, fetchAnnouncements, fetchSubjectNames } from './data-api.js';

async function buildFeed() {
  const [materials, announcements] = await Promise.all([
    fetchMaterials(40),
    fetchAnnouncements(40)
  ]);

  const subjectIds = [...new Set(materials.map((m) => m.subject_id).filter(Boolean))];
  const subjectNames = await fetchSubjectNames(subjectIds);

  return [
    ...materials.map((m) => ({
      kind: 'material',
      id: m.id,
      title: m.title || 'ملف',
      subtitle: subjectNames[m.subject_id] || m.file_type || 'ملف',
      created_at: m.created_at,
      is_important: m.is_important,
      href: m.subject_id
        ? `/subject-details.html?id=${encodeURIComponent(m.subject_id)}`
        : '/subjects.html'
    })),
    ...announcements.map((a) => ({
      kind: 'announcement',
      id: a.id,
      title: a.title || 'إعلان',
      subtitle: String(a.content || a.body || a.description || '').slice(0, 100),
      created_at: a.created_at,
      importance: a.importance || a.priority,
      is_pinned: a.is_pinned,
      href: '/announcements.html'
    }))
  ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function renderFeed(feed) {
  const el = document.getElementById('updates-list');
  if (!el) return;

  if (!feed?.length) {
    showEmpty(el, 'مفيش تحديثات حالياً');
    return;
  }

  el.innerHTML = feed
    .slice(0, 40)
    .map((item) => {
      const kindLabel = item.kind === 'material' ? 'ملف' : 'إعلان';
      return `
        <a class="list-item" href="${escapeHtml(item.href)}" style="text-decoration:none;color:inherit">
          <div class="list-item-icon" data-icon="${item.kind === 'material' ? 'file' : 'megaphone'}"></div>
          <div class="list-item-body">
            <div class="list-item-title">
              ${item.is_pinned ? '📌 ' : ''}${escapeHtml(item.title)}
              ${freshnessBadgesHtml(item)}
            </div>
            <div class="list-item-desc">
              <span class="badge">${kindLabel}</span>
              ${item.subtitle ? ' · ' + escapeHtml(item.subtitle) : ''}
              ${item.created_at ? ' · ' + escapeHtml(timeAgo(item.created_at)) : ''}
            </div>
          </div>
        </a>`;
    })
    .join('');

  initIcons();
  touchLastVisit();
}

async function loadUpdates() {
  const el = document.getElementById('updates-list');
  if (!el) return;

  try {
    const feed = await cachedStaleWhileRevalidate('page:updates', buildFeed, {
      ttlMs: 2 * 60 * 1000,
      onUpdate: renderFeed
    });
    renderFeed(feed);
  } catch (err) {
    console.error('[NUSC] loadUpdates:', err);
    showError(el, 'تعذر تحميل التحديثات. حاول مرة أخرى.');
  }
}

async function init() {
  const result = await protectPage();
  if (!result) return;
  setActiveNav('home');
  initIcons();
  await loadUpdates();
}

init();
