/**
 * يعرض اختصارات المواد المثبتة في الرئيسية (حد أقصى 3)
 * يعمل مستقلًا بجانب home.js
 */
import { getPinnedSubjectIds } from './pinned-subjects.js';
import { fetchSubjects } from './data-api.js';
import { escapeHtml, initIcons } from './utils.js';
import { protectPage } from './auth.js';
import { readProfileCache } from './supabase.js';

async function resolveUserId() {
  try {
    const cached = readProfileCache();
    if (cached?.id) return cached.id;
  } catch {
    /* ignore */
  }
  try {
    const result = await protectPage();
    return result?.profile?.id || result?.user?.id || null;
  } catch {
    return null;
  }
}

function renderPinned(items) {
  const section = document.getElementById('pinned-subjects-section');
  const el = document.getElementById('pinned-subjects-list');
  if (!section || !el) return;
  if (!items.length) {
    section.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  section.classList.remove('hidden');
  el.innerHTML = items
    .map((s) => {
      const title = s.name || s.title || 'مادة';
      const code = s.code || s.subject_code || '';
      return (
        '<a class="home-pinned-chip" href="/subject-details.html?id=' +
        encodeURIComponent(s.id) +
        '"><span class="home-pinned-chip-pin" data-icon="pin"></span><span class="home-pinned-chip-text"><strong>' +
        escapeHtml(title) +
        '</strong>' +
        (code ? '<small>' + escapeHtml(code) + '</small>' : '') +
        '</span></a>'
      );
    })
    .join('');
  try {
    initIcons();
  } catch {
    /* ignore */
  }
}

async function boot() {
  const userId = await resolveUserId();
  const pinnedIds = getPinnedSubjectIds(userId);
  if (!pinnedIds.length) {
    renderPinned([]);
    return;
  }
  try {
    const rows = await fetchSubjects(60);
    const byId = new Map((rows || []).map((s) => [String(s.id), s]));
    const items = pinnedIds.map((id) => byId.get(String(id))).filter(Boolean);
    renderPinned(items);
  } catch (err) {
    console.warn('[COMANDO] pinned subjects:', err);
    renderPinned([]);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    boot().catch(() => {});
  });
} else {
  boot().catch(() => {});
}
