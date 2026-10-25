/**
 * Latest updates: materials + announcements in one feed.
 */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, timeAgo, showEmpty, showError, initIcons, setActiveNav } from './utils.js';
import { freshnessBadgesHtml, touchLastVisit } from './freshness.js';

async function loadUpdates() {
  const el = document.getElementById('updates-list');
  if (!el) return;

  try {
    let materials = [];
    const matRes = await supabase
      .from('materials')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40);

    if (matRes.error) {
      console.warn('[NUSC] materials:', matRes.error.message);
    } else {
      materials = (matRes.data || []).filter((m) => m.is_published !== false);
    }

    let announcements = [];
    const annRes = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40);

    if (annRes.error) {
      console.warn('[NUSC] announcements:', annRes.error.message);
    } else {
      const now = Date.now();
      announcements = (annRes.data || [])
        .filter((a) => a.is_published !== false)
        .filter((a) => {
          if (!a.expires_at) return true;
          const t = new Date(a.expires_at).getTime();
          return Number.isNaN(t) || t > now;
        });
    }

    const subjectIds = [
      ...new Set(materials.map((m) => m.subject_id).filter(Boolean))
    ];
    let subjectNames = {};
    if (subjectIds.length) {
      try {
        const { data: subjects } = await supabase
          .from('subjects')
          .select('id, name')
          .in('id', subjectIds);
        subjectNames = Object.fromEntries((subjects || []).map((s) => [s.id, s.name]));
      } catch (e) {
        console.warn('[NUSC] subject names:', e);
      }
    }

    const feed = [
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

    if (!feed.length) {
      if (matRes.error && annRes.error) {
        showError(
          el,
          'تعذر تحميل التحديثات. تأكد من صلاحيات القراءة على materials و announcements.'
        );
        return;
      }
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
