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
    let announcements = [];

    const matFull = await supabase
      .from('materials')
      .select('id, title, file_type, created_at, is_important, subject_id, subjects(name)')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(30);

    if (
      matFull.error &&
      /is_important|column .* does not exist|PGRST204|42703/i.test(
        String(matFull.error.message || '') + String(matFull.error.code || '')
      )
    ) {
      const basic = await supabase
        .from('materials')
        .select('id, title, file_type, created_at, subject_id, subjects(name)')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(30);
      if (basic.error) throw basic.error;
      materials = basic.data || [];
    } else if (matFull.error) {
      throw matFull.error;
    } else {
      materials = matFull.data || [];
    }

    const ann = await supabase
      .from('announcements')
      .select('id, title, content, body, created_at, importance, priority, is_pinned, is_published')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(30);
    if (ann.error) throw ann.error;
    announcements = ann.data || [];

    const feed = [
      ...materials.map((m) => ({
        kind: 'material',
        id: m.id,
        title: m.title || 'ملف',
        subtitle: m.subjects?.name || m.file_type || 'ملف',
        created_at: m.created_at,
        is_important: m.is_important,
        href: m.subject_id ? `/subject-details.html?id=${encodeURIComponent(m.subject_id)}` : '/subjects.html'
      })),
      ...announcements.map((a) => ({
        kind: 'announcement',
        id: a.id,
        title: a.title || 'إعلان',
        subtitle: String(a.content || a.body || '').slice(0, 100),
        created_at: a.created_at,
        importance: a.importance || a.priority,
        is_pinned: a.is_pinned,
        href: '/announcements.html'
      }))
    ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    if (!feed.length) {
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
