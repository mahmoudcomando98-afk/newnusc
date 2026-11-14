/**
 * COMANDO — آخر التحديثات: ملفات المواد + الإعلانات في feed واحد مرتب
 */
import { protectPage } from './auth.js';
import { escapeHtml, timeAgo, showToast, initIcons, setActiveNav } from './utils.js';
import { freshnessBadgesHtml, touchLastVisit } from './freshness.js';
import { cachedStaleWhileRevalidate } from './cache.js';
import { fetchMaterials, fetchAnnouncements, fetchSubjectNames } from './data-api.js';

let items = [];
let activeFilter = 'all';

const $ = (id) => document.getElementById(id);

const TYPE_LABEL = {
  lecture: 'محاضرة',
  section: 'سكشن',
  assignment: 'واجب',
  exam: 'امتحان',
  past_exam: 'امتحان سابق',
  notes: 'مذكرات',
  summary: 'ملخص',
  other: 'ملف'
};

function typeTileClass(t) {
  const v = String(t || 'other').toLowerCase();
  if (v === 'lecture' || v === 'course' || v === 'course_note') return 'lecture';
  if (v === 'section') return 'section';
  if (v === 'assignment' || v === 'homework') return 'assignment';
  if (v === 'exam' || v === 'final' || v === 'midterm' || v === 'quiz') return 'exam';
  if (v === 'past_exam') return 'past_exam';
  if (v === 'notes' || v === 'note') return 'notes';
  if (v === 'summary') return 'summary';
  return 'other';
}

function groupOf(ts) {
  const d = new Date(ts);
  const now = new Date();
  const dayStart = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.floor((dayStart(now) - dayStart(d)) / 86400000);
  if (days <= 0) return { key: 'today', label: 'النهاردة', order: 1 };
  if (days === 1) return { key: 'yesterday', label: 'إمبارح', order: 2 };
  if (days <= 7) return { key: 'week', label: 'هذا الأسبوع', order: 3 };
  return { key: 'older', label: 'أقدم', order: 4 };
}

function passesFilter(item) {
  if (activeFilter === 'all') return true;
  if (activeFilter === 'files') return item.kind === 'material';
  if (activeFilter === 'announcements') return item.kind === 'announcement';
  return true;
}

function typeLabel(item) {
  if (item.kind === 'announcement') return 'إعلان';
  return TYPE_LABEL[String(item.material_type || 'other').toLowerCase()] || 'ملف';
}

async function buildFeed() {
  const [materials, announcements] = await Promise.all([
    fetchMaterials(60),
    fetchAnnouncements(40)
  ]);

  const subjectIds = [...new Set(materials.map((m) => m.subject_id).filter(Boolean))];
  const subjectNames = await fetchSubjectNames(subjectIds);

  const feed = [
    ...materials.map((m) => ({
      kind: 'material',
      id: 'mat-' + m.id,
      title: m.title || 'ملف',
      material_type: m.material_type,
      subject: subjectNames[m.subject_id] || '',
      created_at: m.created_at,
      is_important: m.is_important,
      is_pinned: m.is_pinned,
      href: m.subject_id
        ? `/subject-details.html?id=${encodeURIComponent(m.subject_id)}`
        : '/subjects.html'
    })),
    ...announcements.map((a) => ({
      kind: 'announcement',
      id: 'ann-' + a.id,
      title: a.title || 'إعلان',
      body: String(a.content || a.body || a.description || '').trim(),
      created_at: a.created_at,
      importance: a.importance || a.priority,
      is_pinned: a.is_pinned,
      href: null
    }))
  ];

  return feed.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function updateStats(visible) {
  const statsEl = $('updates-stats');
  if (!statsEl) return;
  const total = items.length;
  const files = items.filter((i) => i.kind === 'material').length;
  const announcements = items.filter((i) => i.kind === 'announcement').length;
  $('updates-stat-total').textContent = String(total);
  $('updates-stat-files').textContent = String(files);
  $('updates-stat-announce').textContent = String(announcements);
  statsEl.hidden = total === 0;
}

function render() {
  const listEl = $('updates-list');
  const emptyEl = $('updates-empty');
  const errorEl = $('updates-error');
  if (errorEl) errorEl.hidden = true;

  const visible = items.filter(passesFilter);
  updateStats(visible);

  if (!visible.length) {
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    if (items.length !== 0) {
      // الفلتر هو اللي فاضي
      emptyEl.hidden = true;
      listEl.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:28px 12px;font-size:.85rem">مفيش عناصر في الفلتر ده دلوقتي.</p>';
    }
    return;
  }
  emptyEl.hidden = true;

  const groupsMap = new Map();
  for (const item of visible) {
    const g = groupOf(item.created_at);
    if (!groupsMap.has(g.key)) groupsMap.set(g.key, { label: g.label, order: g.order, items: [] });
    groupsMap.get(g.key).items.push(item);
  }
  const groups = [...groupsMap.values()].sort((a, b) => a.order - b.order);

  listEl.innerHTML = groups.map((group) => {
    const cards = group.items.map((item, idx) => {
      const style = 'style="animation-delay:' + Math.min(idx * 45, 400) + 'ms"';
      if (item.kind === 'announcement') {
        return (
          '<button type="button" class="updates-card updates-card-announcement" data-id="' + escapeHtml(item.id) + '" ' + style + ' aria-expanded="false" aria-label="' + escapeHtml(item.title) + '">' +
            '<span class="updates-tile updates-tile-announce"><span data-icon="megaphone" style="display:flex;width:22px;height:22px"></span></span>' +
            '<span class="updates-card-body">' +
              '<span class="updates-topline">' +
                '<h3 class="updates-card-title">' + (item.is_pinned ? '<span data-icon="pin" class="updates-pin" style="display:inline-flex;width:15px;height:15px;vertical-align:-2px"></span>' : '') + escapeHtml(item.title) + '</h3>' +
                '<span class="updates-kind-tag updates-kind-announce">إعلان</span>' +
              '</span>' +
              (item.body ? '<p class="updates-card-text">' + escapeHtml(item.body) + '</p>' : '') +
              '<span class="updates-card-meta">' +
                '<span>' + escapeHtml(timeAgo(item.created_at)) + '</span>' +
                freshnessBadgesHtml(item) +
              '</span>' +
              '<span class="updates-expand-hint">اضغط للعرض كامل</span>' +
            '</span>' +
            '<span class="updates-chevron"><span data-icon="chevronLeft" style="display:flex;width:18px;height:18px"></span></span>' +
          '</button>'
        );
      }

      const tile = typeTileClass(item.material_type);
      return (
        '<a class="updates-card" href="' + escapeHtml(item.href || '/subjects.html') + '" ' + style + ' aria-label="' + escapeHtml(item.title) + '">' +
          '<span class="updates-tile updates-tile-' + tile + '">' + escapeHtml(typeLabel(item)) + '</span>' +
          '<span class="updates-card-body">' +
            '<span class="updates-topline">' +
              '<h3 class="updates-card-title">' + (item.is_pinned ? '<span data-icon="pin" class="updates-pin" style="display:inline-flex;width:15px;height:15px;vertical-align:-2px"></span>' : '') + escapeHtml(item.title) + '</h3>' +
              '<span class="updates-kind-tag updates-kind-file">' + escapeHtml(typeLabel(item)) + '</span>' +
            '</span>' +
            '<span class="updates-card-meta">' +
              (item.subject ? '<span class="updates-subject-chip">' + escapeHtml(item.subject) + '</span>' : '') +
              '<span>' + escapeHtml(timeAgo(item.created_at)) + '</span>' +
              freshnessBadgesHtml(item) +
            '</span>' +
          '</span>' +
          '<span class="updates-chevron"><span data-icon="chevronLeft" style="display:flex;width:18px;height:18px"></span></span>' +
        '</a>'
      );
    }).join('');

    return (
      '<section class="updates-group">' +
        '<div class="updates-group-head">' +
          '<span class="updates-group-title">' + escapeHtml(group.label) + '</span>' +
          '<span class="updates-group-count">' + group.items.length + '</span>' +
        '</div>' +
        cards +
      '</section>'
    );
  }).join('');

  initIcons();

  // تفعيل التوسيع للإعلانات
  listEl.querySelectorAll('.updates-card-announcement').forEach((card) => {
    card.addEventListener('click', () => {
      const expanded = card.classList.toggle('updates-card-expanded');
      card.setAttribute('aria-expanded', String(expanded));
      const hint = card.querySelector('.updates-expand-hint');
      if (hint) hint.textContent = expanded ? 'اضغط عشان تخفي' : 'اضغط للعرض كامل';
    });
  });
}

async function loadUpdates() {
  const listEl = $('updates-list');
  try {
    const feed = await cachedStaleWhileRevalidate('page:updates', buildFeed, {
      ttlMs: 2 * 60 * 1000,
      onUpdate: render
    });
    items = Array.isArray(feed) ? feed : [];
    render();
  } catch (err) {
    console.error('[NUSC] loadUpdates:', err);
    items = [];
    $('updates-error').hidden = false;
    $('updates-list').innerHTML = '';
    $('updates-empty').hidden = true;
    $('updates-stats')?.setAttribute('hidden', '');
  }
}

async function init() {
  const result = await protectPage();
  if (!result) return;
  setActiveNav('home');

  document.querySelectorAll('.updates-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.updates-chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      activeFilter = chip.dataset.filter || 'all';
      render();
    });
  });

  $('updates-retry')?.addEventListener('click', () => {
    $('updates-error').hidden = true;
    $('updates-list').innerHTML =
      '<div class="updates-skeleton" aria-hidden="true"><div class="updates-skel-card"></div><div class="updates-skel-card"></div><div class="updates-skel-card"></div><div class="updates-skel-card"></div></div>';
    loadUpdates();
  });

  await loadUpdates();
  touchLastVisit();
}

init();
