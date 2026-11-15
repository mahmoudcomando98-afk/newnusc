/**
 * COMANDO — الجدول الأسبوعي (محاضرات + سكاشن).
 */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, formatTime, showEmpty, showError, initIcons, setActiveNav, WEEKDAYS_AR } from './utils.js';

const TYPE_LABEL = { lecture: 'المحاضرة', section: 'السكشن', quiz: 'كويز', exam: 'امتحان', other: 'أخرى' };
const CHIP = { lecture: 'chip-lecture', section: 'chip-section', quiz: 'chip-quiz', exam: 'chip-exam', other: 'chip-other' };

let events = [];
let currentFilter = 'all';

function getSubjectName(ev) {
  return ev.subject_name || '';
}
function getDay(ev) {
  if (ev.day_of_week !== null && ev.day_of_week !== undefined && ev.day_of_week !== '') {
    const d = Number(ev.day_of_week);
    if (Number.isInteger(d) && d >= 0 && d <= 6) return d;
  }
  return null;
}
function timePair(ev) {
  if (!ev.start_time) return { start: '', end: '' };
  const fmt = (v) => {
    const t = String(v).slice(0, 5);
    const [h, m] = t.split(':').map((n) => parseInt(n, 10));
    if (isNaN(h)) return t;
    const d = new Date();
    d.setHours(h, isNaN(m) ? 0 : m, 0, 0);
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };
  return { start: fmt(ev.start_time), end: ev.end_time ? fmt(ev.end_time) : '' };
}

function sortEvents(list) {
  return [...list].sort((a, b) => {
    const da = getDay(a), db = getDay(b);
    if (da !== null && db !== null && da !== db) return da - db;
    return String(a.start_time || '').localeCompare(String(b.start_time || ''));
  });
}

/* دمج السكاشن اللي نفس المادة + نفس اليوم + نفس الوقت + نفس المكان في كارت واحد */
function groupEvents(list) {
  const map = new Map();
  for (const ev of list) {
    const key = [
      String(ev.event_type || 'other'),
      getDay(ev) ?? 'na',
      String(ev.start_time || ''),
      String(ev.end_time || ''),
      String(ev.subject_id || ''),
      String(ev.title || ''),
      String(ev.location || ''),
      String(ev.instructor || '')
    ].join('|');
    const g = map.get(key);
    if (g) g.items.push(ev);
    else map.set(key, { base: ev, items: [ev] });
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.sectionNumbers = [...new Set(g.items.map((i) => i.section_number).filter((n) => n != null))]
      .sort((a, b) => Number(a) - Number(b));
  }
  return groups;
}

function filterEvents(list) {
  if (currentFilter === 'all') return list;
  return list.filter((ev) => (ev.event_type || 'other') === currentFilter);
}

function eventIcon(ev) {
  if ((ev.event_type || '') === 'section') {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>';
  }
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
}

function chipFor(ev) {
  const t = String(ev.event_type || 'other').toLowerCase();
  const label = TYPE_LABEL[t] || ev.event_type || 'أخرى';
  const cls = CHIP[t] || CHIP.other;
  return '<span class="chip ' + cls + '">' + escapeHtml(label) + '</span>';
}

function sectionBoxHtml(sections) {
  const nums = (sections || []).filter((n) => n != null);
  if (!nums.length) return '';
  if (nums.length === 1) {
    return (
      '<span class="slot-section">' +
        '<span class="slot-section-label">سكشن</span>' +
        '<span class="slot-section-num">' + escapeHtml(String(nums[0])) + '</span>' +
      '</span>'
    );
  }
  return (
    '<span class="slot-section">' +
      '<span class="slot-section-label">سكاشن</span>' +
      '<span class="slot-section-nums">' + nums.map((n) => escapeHtml(String(n))).join('<i>،</i>') + '</span>' +
    '</span>'
  );
}

function cardHtml(group) {
  const ev = group.base;
  const subs = group.items.map((i) => i.notes).filter(Boolean);
  const uniqNotes = [...new Set(subs)].join(' · ');
  const sub = getSubjectName(ev);
  const { start, end } = timePair(ev);
  const range = start && end ? start + ' ← ' + end : (start || '');
  const loc = [ev.location, ev.instructor].filter(Boolean).map(escapeHtml).join(' · ');
  const multi = (group.sectionNumbers || []).length > 1;

  return (
    '<article class="slot" aria-label="' + escapeHtml(ev.title || 'موعد') + '">' +
      '<div class="slot-time" aria-label="الوقت">' +
        '<strong>' + escapeHtml(start || '؟') + '</strong>' +
        (end ? '<small>' + escapeHtml(end) + '</small>' : '') +
      '</div>' +
      '<div class="slot-body">' +
        '<h3 class="slot-title">' + escapeHtml(ev.title || 'موعد دراسي') + '</h3>' +
        '<div class="slot-meta">' +
          chipFor(ev) +
          (sub ? '<span class="chip chip-subject">' + escapeHtml(sub) + '</span>' : '') +
          (multi ? '<span class="chip chip-section-no">' + group.sectionNumbers.length + ' سكاشن</span>' : '') +
        '</div>' +
        (loc ? '<div class="slot-meta"><span>' + loc + '</span></div>' : '') +
        (uniqNotes ? '<small style="color:var(--text-muted); font-size:.74rem">' + escapeHtml(uniqNotes) + '</small>' : '') +
      '</div>' +
      sectionBoxHtml(group.sectionNumbers) +
    '</article>'
  );
}

function render() {
  const mount = document.getElementById('schedule-content');
  if (!mount) return;

  const list = sortEvents(filterEvents(events));
  const groups = groupEvents(list);

  if (!list.length) {
    mount.innerHTML =
      '<div class="empty">' +
        '<h2>الجدول فاض لسه</h2>' +
        '<p>الأستاذ هينزل المحاضرات والسكاشن قريب — تابعها هنا أول بأول.</p>' +
      '</div>';
    return;
  }

  const byDay = Array.from({ length: 7 }, () => []);
  for (const g of groups) {
    const d = getDay(g.base);
    if (d !== null) byDay[d].push(g);
  }

  const sectionsOrder = [0, 1, 2, 3, 4, 5, 6];
  const chunks = [];
  for (const day of sectionsOrder) {
    const block = byDay[day];
    if (!block.length) continue;
    chunks.push(
      '<section class="day-block">' +
        '<div class="day-title"><span>' + escapeHtml(WEEKDAYS_AR[day] || '') + '</span>' +
          '<span class="day-count">' + block.length + ' موعد</span>' +
        '</div>' +
        block.map(cardHtml).join('') +
      '</section>'
    );
  }

  if (!chunks.length) {
    mount.innerHTML =
      '<div class="empty"><h2>الجدول فاض</h2><p>مفيش مواعيد ثابتة من غير أيام محددة دلوقتي.</p></div>';
    return;
  }

  mount.innerHTML = chunks.join('');
  initIcons();
}

async function loadSchedule() {
  const mount = document.getElementById('schedule-content');
  if (!mount) return;

  mount.innerHTML =
    '<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text"></div></div>';

  try {
    const { data, error } = await supabase
      .from('schedule_items')
      .select('id, subject_id, title, event_type, day_of_week, start_time, end_time, location, instructor, notes, is_active, section_number')
      .order('day_of_week', { ascending: true, nullsFirst: false })
      .order('start_time', { ascending: true });

    if (error) throw error;
    const rows = data || [];

    const subjectIds = [...new Set(rows.map((r) => r.subject_id).filter(Boolean))];
    let subjectNames = {};
    if (subjectIds.length) {
      const { data: subs } = await supabase.from('subjects').select('id, name').in('id', subjectIds);
      subjectNames = Object.fromEntries((subs || []).map((s) => [s.id, s.name]));
    }

    events = rows
      .filter((r) => r.is_active !== false)
      .map((r) => ({ ...r, subject_name: subjectNames[r.subject_id] || '' }));

    render();
  } catch (err) {
    console.error('[NUSC] loadSchedule:', err);
    showError(mount, 'تعذر تحميل الجدول: ' + (err?.message || 'خطأ'));
  }
}

function bindTabs() {
  document.querySelectorAll('#filters .flt').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#filters .flt').forEach((t) => {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      currentFilter = tab.dataset.filter || 'all';
      render();
    });
  });
}

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;
    setActiveNav('schedule');
    bindTabs();
    await loadSchedule();
  } catch (err) {
    console.error('[NUSC] init schedule:', err);
  }
}

init();
