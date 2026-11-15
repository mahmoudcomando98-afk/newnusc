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
let currentSection = 'all';

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

function filterEvents(list) {
  return list.filter((ev) => {
    if (currentFilter !== 'all' && (ev.event_type || 'other') !== currentFilter) return false;
    if (currentSection !== 'all') {
      /* السكاشن بأرقامها بتتصفّل، والمواعيد من غير سكشن (المحاضرات العامة) بتفضل ظاهرة للكل */
      const n = ev.section_number;
      if (n == null) return true;
      return String(n) === String(currentSection);
    }
    return true;
  });
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

function sectionBoxHtml(ev) {
  const n = ev.section_number;
  if (n == null) return '';
  return (
    '<span class="slot-section">' +
      '<span class="slot-section-label">سكشن</span>' +
      '<span class="slot-section-num">' + escapeHtml(String(n)) + '</span>' +
    '</span>'
  );
}

function cardHtml(ev) {
  const sub = getSubjectName(ev);
  const { start, end } = timePair(ev);
  const range = start && end ? start + ' ← ' + end : (start || '');
  const loc = [ev.location, ev.instructor].filter(Boolean).map(escapeHtml).join(' · ');

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
        '</div>' +
        (loc ? '<div class="slot-meta"><span>' + loc + '</span></div>' : '') +
        (ev.notes ? '<small style="color:var(--text-muted); font-size:.74rem">' + escapeHtml(ev.notes) + '</small>' : '') +
      '</div>' +
      sectionBoxHtml(ev) +
    '</article>'
  );
}

function render() {
  const mount = document.getElementById('schedule-content');
  if (!mount) return;

  const list = sortEvents(filterEvents(events));

  if (!list.length) {
    const sectionHint = currentSection !== 'all'
      ? '<p>السكشن ' + escapeHtml(String(currentSection)) + ' مالوش مواعيد مدرجة دلوقتي — جرّب سكشن تاني أو «الكل».</p>'
      : '<p>الأستاذ هينزل المحاضرات والسكاشن قريب — تابعها هنا أول بأول.</p>';
    mount.innerHTML =
      '<div class="empty">' +
        '<h2>الجدول فاض لسه</h2>' +
        sectionHint +
      '</div>';
    return;
  }

  const byDay = Array.from({ length: 7 }, () => []);
  for (const ev of list) {
    const d = getDay(ev);
    if (d !== null) byDay[d].push(ev);
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

    renderSectionFilters();
    render();
  } catch (err) {
    console.error('[NUSC] loadSchedule:', err);
    showError(mount, 'تعذر تحميل الجدول: ' + (err?.message || 'خطأ'));
  }
}

function uniqueSections() {
  return [...new Set(events.map((e) => e.section_number).filter((n) => n != null))]
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

function renderSectionFilters() {
  const row = document.getElementById('section-filters');
  if (!row) return;
  const secs = uniqueSections();
  if (secs.length < 2) {
    row.classList.add('hidden');
    row.innerHTML = '';
    currentSection = 'all';
    return;
  }
  row.classList.remove('hidden');
  row.innerHTML =
    '<button type="button" class="flt' + (currentSection === 'all' ? ' is-active' : '') + '" data-section="all" role="tab" aria-selected="' + String(currentSection === 'all') + '">الكل</button>' +
    secs
      .map((n) =>
        '<button type="button" class="flt' + (String(currentSection) === String(n) ? ' is-active' : '') +
        '" data-section="' + escapeHtml(String(n)) + '" role="tab" aria-selected="' +
        String(String(currentSection) === String(n)) + '">سكشن ' + escapeHtml(String(n)) + '</button>'
      )
      .join('');
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
  const row = document.getElementById('section-filters');
  if (row) {
    row.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.flt') : null;
      if (!btn) return;
      currentSection = btn.dataset.section || 'all';
      row.querySelectorAll('.flt').forEach((t) => {
        const active = t === btn;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      });
      render();
    });
  }
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
