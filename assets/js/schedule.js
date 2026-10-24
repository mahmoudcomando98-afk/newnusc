/**
 * Student schedule — same data source as admin (schedule_items).
 */

import { supabase } from './supabase.js';
import { protectPage } from './auth.js';

import {
  escapeHtml,
  formatDate,
  formatTime,
  showEmpty,
  showError,
  initIcons,
  setActiveNav,
  WEEKDAYS_AR
} from './utils.js';

let events = [];
let currentView = 'list';

const typeLabels = {
  lecture: 'محاضرة',
  section: 'سكشن',
  quiz: 'كويز',
  exam: 'امتحان',
  other: 'أخرى'
};

/** Mount works with schedule-content, schedule-root, or injects into page */
function getMount() {
  let el =
    document.getElementById('schedule-content') ||
    document.getElementById('schedule-root');

  if (el) return el;

  const page = document.querySelector('.page-content') || document.querySelector('main');
  if (!page) return null;

  el = document.createElement('div');
  el.id = 'schedule-content';
  page.appendChild(el);
  return el;
}

function getEventDay(event) {
  if (event.day_of_week !== null && event.day_of_week !== undefined && event.day_of_week !== '') {
    const day = Number(event.day_of_week);
    if (Number.isInteger(day) && day >= 0 && day <= 6) return day;
  }
  if (event.event_date) {
    const d = new Date(String(event.event_date).slice(0, 10) + 'T12:00:00');
    if (!Number.isNaN(d.getTime())) return d.getDay();
  }
  return null;
}

function getEventType(event) {
  const t = event.event_type || event.type || 'other';
  return typeLabels[t] || t;
}

function getEventTime(event) {
  if (!event.start_time) return '';
  const start = formatTime(event.start_time);
  if (!event.end_time) return start;
  return `${start} – ${formatTime(event.end_time)}`;
}

function sortEvents(list) {
  return [...list].sort((a, b) => {
    const da = getEventDay(a);
    const db = getEventDay(b);
    if (da !== null && db !== null && da !== db) return da - db;
    if (da !== null && db === null) return -1;
    if (da === null && db !== null) return 1;
    return String(a.start_time || '').localeCompare(String(b.start_time || ''));
  });
}

function eventCard(event) {
  const day = getEventDay(event);
  const subjectName = event.subject_name || '';
  return `
    <article class="card schedule-card mb-2">
      <div class="list-item" style="align-items:flex-start">
        <div class="list-item-icon" data-icon="calendar"></div>
        <div class="list-item-body" style="flex:1">
          <div class="list-item-title">${escapeHtml(event.title || 'موعد دراسي')}</div>
          <div class="list-item-desc">
            <span class="badge badge-primary">${escapeHtml(getEventType(event))}</span>
            ${subjectName ? ` · ${escapeHtml(subjectName)}` : ''}
            ${day !== null ? ` · ${escapeHtml(WEEKDAYS_AR[day] || '')}` : ''}
            ${event.event_date ? ` · ${escapeHtml(formatDate(event.event_date))}` : ''}
            ${getEventTime(event) ? ` · ${escapeHtml(getEventTime(event))}` : ''}
            ${event.location ? ` · ${escapeHtml(event.location)}` : ''}
          </div>
          ${event.notes ? `<p class="text-sm text-muted mt-1">${escapeHtml(event.notes)}</p>` : ''}
        </div>
      </div>
    </article>`;
}

function renderList(el) {
  if (!events.length) {
    showEmpty(el, 'لا توجد مواعيد في الجدول حاليًا');
    return;
  }
  el.innerHTML = sortEvents(events).map(eventCard).join('');
  initIcons();
}

function renderWeek(el) {
  const byDay = Array.from({ length: 7 }, () => []);
  events.forEach((ev) => {
    const day = getEventDay(ev);
    if (day !== null) byDay[day].push(ev);
  });

  if (!byDay.some((d) => d.length)) {
    // Fall back to list if no day_of_week set
    renderList(el);
    return;
  }

  el.innerHTML = byDay
    .map((dayEvents, idx) => {
      if (!dayEvents.length) return '';
      return `
        <section class="card mb-2">
          <h3 class="card-title">${escapeHtml(WEEKDAYS_AR[idx] || '')}</h3>
          ${sortEvents(dayEvents)
            .map(
              (event) => `
            <div class="list-item">
              <div class="list-item-icon" data-icon="calendar"></div>
              <div class="list-item-body">
                <div class="list-item-title">${escapeHtml(event.title || 'موعد')}</div>
                <div class="list-item-desc">
                  ${escapeHtml(getEventType(event))}
                  ${event.subject_name ? ` · ${escapeHtml(event.subject_name)}` : ''}
                  ${getEventTime(event) ? ` · ${escapeHtml(getEventTime(event))}` : ''}
                  ${event.location ? ` · ${escapeHtml(event.location)}` : ''}
                </div>
              </div>
            </div>`
            )
            .join('')}
        </section>`;
    })
    .join('');
  initIcons();
}

function render() {
  const el = getMount();
  if (!el) return;
  if (currentView === 'week') renderWeek(el);
  else renderList(el);
}

/**
 * Same table + same rows as admin panel.
 * No extra client filters — if admin sees it, student sees it (RLS permitting).
 */
async function loadSchedule() {
  const el = getMount();
  if (!el) {
    console.error('[NUSC] schedule mount missing');
    return;
  }

  el.innerHTML =
    '<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>';

  try {
    // Primary: production table used by admin
    let { data, error } = await supabase
      .from('schedule_items')
      .select('*')
      .order('day_of_week', { ascending: true, nullsFirst: false })
      .order('start_time', { ascending: true, nullsFirst: false });

    // Fallback schema name
    if (error && /PGRST205|42P01|does not exist|relation/i.test(String(error.message || '') + String(error.code || ''))) {
      const retry = await supabase
        .from('schedules')
        .select('*')
        .order('day_of_week', { ascending: true, nullsFirst: false })
        .order('start_time', { ascending: true, nullsFirst: false });
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;

    const rows = data || [];

    // Resolve subject names (optional)
    let subjectNames = {};
    const subjectIds = [...new Set(rows.map((r) => r.subject_id).filter(Boolean))];
    if (subjectIds.length) {
      const { data: subjects } = await supabase.from('subjects').select('id, name').in('id', subjectIds);
      subjectNames = Object.fromEntries((subjects || []).map((s) => [s.id, s.name]));
    }

    events = rows.map((r) => ({
      ...r,
      subject_name: subjectNames[r.subject_id] || r.subject_name || ''
    }));

    render();
  } catch (err) {
    console.error('[NUSC] loadSchedule:', err);
    const msg = String(err?.message || err?.code || '');
    if (/permission|RLS|42501|denied/i.test(msg)) {
      showError(
        el,
        'مفيش صلاحية لقراءة الجدول. نفّذ supabase/fix_schedule_grants.sql في Supabase SQL Editor.'
      );
    } else if (/relation|does not exist|PGRST205|42P01/i.test(msg)) {
      showError(el, 'جدول المواعيد غير موجود (schedule_items).');
    } else {
      showError(el, 'تعذر تحميل الجدول: ' + (err?.message || 'خطأ غير معروف'));
    }
  }
}

function bindTabs() {
  document.querySelectorAll('#view-tabs .tab[data-view], .tab[data-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab[data-view]').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentView = tab.dataset.view || 'list';
      render();
    });
  });
}

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;

    setActiveNav('schedule');
    initIcons();
    bindTabs();
    await loadSchedule();
  } catch (error) {
    console.error('Schedule init:', error);
    const el = getMount();
    if (el) showError(el, 'تعذر فتح الجدول. سجّل الدخول مرة أخرى.');
  }
}

init();
