/**
 * NUSC Student Hub - Schedule Page
 * Live DB uses schedule_items; schema.sql uses schedules — support both.
 * Works with #schedule-content or legacy #schedule-root.
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

function ensureScheduleMount() {
  let el = document.getElementById('schedule-content');
  if (el) return el;

  const pageContent =
    document.getElementById('schedule-root') ||
    document.querySelector('.page-content') ||
    document.querySelector('main .container');

  if (!pageContent) return null;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="tabs" id="view-tabs" role="tablist" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <button type="button" class="tab active" data-view="list" role="tab">قائمة</button>
      <button type="button" class="tab" data-view="week" role="tab">حسب اليوم</button>
    </div>
    <div id="schedule-content" aria-live="polite"></div>
  `;

  if (pageContent.id === 'schedule-root') {
    pageContent.innerHTML = '';
    pageContent.appendChild(wrap);
  } else if (!document.getElementById('view-tabs')) {
    const header = pageContent.querySelector('.section-header');
    if (header && header.nextSibling) header.parentNode.insertBefore(wrap, header.nextSibling);
    else pageContent.appendChild(wrap);
  }

  return document.getElementById('schedule-content');
}

function bindViewTabs() {
  document.querySelectorAll('#view-tabs .tab[data-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#view-tabs .tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentView = tab.dataset.view || 'list';
      render();
    });
  });
}

function getEventDay(event) {
  if (event.day_of_week !== null && event.day_of_week !== undefined && event.day_of_week !== '') {
    const day = Number(event.day_of_week);
    if (Number.isInteger(day) && day >= 0 && day <= 6) return day;
  }
  if (event.event_date) {
    const date = new Date(String(event.event_date).slice(0, 10) + 'T12:00:00');
    if (!Number.isNaN(date.getTime())) return date.getDay();
  }
  return null;
}

function getEventType(event) {
  const type = event.event_type || event.type || 'other';
  return typeLabels[type] || type;
}

function getEventTime(event) {
  if (!event.start_time) return '';
  const start = formatTime(event.start_time);
  if (!event.end_time) return start;
  return `${start} – ${formatTime(event.end_time)}`;
}

function sortEvents(list) {
  return [...list].sort((a, b) => {
    const dayA = getEventDay(a);
    const dayB = getEventDay(b);
    if (dayA !== null && dayB !== null && dayA !== dayB) return dayA - dayB;
    if (dayA !== null && dayB === null) return -1;
    if (dayA === null && dayB !== null) return 1;
    return String(a.start_time || '').localeCompare(String(b.start_time || ''));
  });
}

function isVisibleRow(r) {
  if (r.is_published === false) return false;
  if (r.is_active === false) return false;
  return true;
}

function eventCard(event) {
  const day = getEventDay(event);
  const date = event.event_date || null;
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
            ${date ? ` · ${escapeHtml(formatDate(date))}` : ''}
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
    showEmpty(el, 'لا توجد مواعيد. من حساب الأدمن: إدارة الجدول ← أضف موعد.');
    return;
  }
  el.innerHTML = sortEvents(events).map(eventCard).join('');
  initIcons();
}

function renderWeek(el) {
  const byDay = Array.from({ length: 7 }, () => []);
  events.forEach((event) => {
    const day = getEventDay(event);
    if (day !== null) byDay[day].push(event);
  });
  if (!byDay.some((d) => d.length)) {
    showEmpty(el, 'لا توجد مواعيد مرتبطة بأيام الأسبوع');
    return;
  }
  el.innerHTML = byDay
    .map((dayEvents, dayIndex) => {
      if (!dayEvents.length) return '';
      return `<section class="card mb-2"><h3 class="card-title">${escapeHtml(WEEKDAYS_AR[dayIndex] || '')}</h3>${sortEvents(dayEvents)
        .map(
          (event) => `<div class="list-item"><div class="list-item-icon" data-icon="calendar"></div><div class="list-item-body"><div class="list-item-title">${escapeHtml(event.title || 'موعد')}</div><div class="list-item-desc">${escapeHtml(getEventType(event))}${event.subject_name ? ` · ${escapeHtml(event.subject_name)}` : ''}${getEventTime(event) ? ` · ${escapeHtml(getEventTime(event))}` : ''}${event.location ? ` · ${escapeHtml(event.location)}` : ''}</div></div></div>`
        )
        .join('')}</section>`;
    })
    .join('');
  initIcons();
}

function render() {
  const el = ensureScheduleMount();
  if (!el) return;
  if (currentView === 'week') renderWeek(el);
  else renderList(el);
}

async function tryTable(name) {
  const { data, error } = await supabase.from(name).select('*');
  if (error) return { data: null, error };
  return { data: (data || []).filter(isVisibleRow), error: null };
}

async function fetchScheduleRows() {
  // Production DB currently has schedule_items (schedules table may not exist)
  let result = await tryTable('schedule_items');
  if (!result.error) return result.data || [];

  result = await tryTable('schedules');
  if (!result.error) return result.data || [];

  throw result.error || new Error('تعذر قراءة الجدول');
}

async function loadSchedule() {
  const el = ensureScheduleMount();
  if (!el) return;

  el.innerHTML =
    '<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>';

  try {
    const rows = await fetchScheduleRows();

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
    if (/relation|does not exist|PGRST205|42P01/i.test(msg)) {
      showError(el, 'مفيش جدول مواعيد في قاعدة البيانات. أنشئ schedule_items أو schedules في Supabase.');
    } else if (/permission|RLS|42501|denied/i.test(msg)) {
      showError(
        el,
        'مفيش صلاحية قراءة الجدول. نفّذ supabase/fix_schedule_grants.sql في SQL Editor.'
      );
    } else {
      showError(el, 'تعذر تحميل الجدول. حاول مرة أخرى.');
    }
  }
}

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;
    setActiveNav('schedule');
    ensureScheduleMount();
    bindViewTabs();
    initIcons();
    await loadSchedule();
  } catch (error) {
    console.error('Schedule init:', error);
    const el = ensureScheduleMount();
    if (el) showError(el, 'تعذر فتح الجدول. سجّل الدخول مرة أخرى.');
  }
}

init();
