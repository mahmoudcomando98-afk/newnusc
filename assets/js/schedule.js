/**
 * NUSC Student Hub - Schedule Page
 * Reads from public.schedules (schema.sql)
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

function getEventDay(event) {
  if (event.day_of_week !== null && event.day_of_week !== undefined && event.day_of_week !== '') {
    const day = Number(event.day_of_week);
    if (Number.isInteger(day) && day >= 0 && day <= 6) return day;
  }
  if (event.event_date) {
    const date = new Date(event.event_date + 'T12:00:00');
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
    </article>
  `;
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
      const sorted = sortEvents(dayEvents);
      return `
        <section class="card mb-2">
          <h3 class="card-title">${escapeHtml(WEEKDAYS_AR[dayIndex] || '')}</h3>
          ${sorted
            .map(
              (event) => `
            <div class="list-item">
              <div class="list-item-icon" data-icon="calendar"></div>
              <div class="list-item-body">
                <div class="list-item-title">${escapeHtml(event.title || 'موعد دراسي')}</div>
                <div class="list-item-desc">
                  ${escapeHtml(getEventType(event))}
                  ${event.subject_name ? ` · ${escapeHtml(event.subject_name)}` : ''}
                  ${getEventTime(event) ? ` · ${escapeHtml(getEventTime(event))}` : ''}
                  ${event.location ? ` · ${escapeHtml(event.location)}` : ''}
                </div>
                ${event.notes ? `<p class="text-sm text-muted mt-1">${escapeHtml(event.notes)}</p>` : ''}
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
  const el = document.getElementById('schedule-content');
  if (!el) return;
  if (currentView === 'week') renderWeek(el);
  else renderList(el);
}

async function loadSchedule() {
  const el = document.getElementById('schedule-content');
  if (!el) {
    console.error('Missing #schedule-content');
    return;
  }

  el.innerHTML =
    '<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>';

  try {
    // Schema table is public.schedules (not schedule_items)
    let query = supabase
      .from('schedules')
      .select('id, title, event_type, day_of_week, event_date, start_time, end_time, location, notes, subject_id, is_published')
      .eq('is_published', true)
      .order('day_of_week', { ascending: true, nullsFirst: false })
      .order('start_time', { ascending: true, nullsFirst: false });

    let { data, error } = await query;

    // Fallback if is_published column missing on older DBs
    if (error && /is_published|column/i.test(String(error.message || ''))) {
      const retry = await supabase
        .from('schedules')
        .select('id, title, event_type, day_of_week, event_date, start_time, end_time, location, notes, subject_id')
        .order('day_of_week', { ascending: true, nullsFirst: false })
        .order('start_time', { ascending: true, nullsFirst: false });
      data = retry.data;
      error = retry.error;
    }

    // Last resort: legacy table name some installs used
    if (error && /relation|does not exist|PGRST/i.test(String(error.message || '') + String(error.code || ''))) {
      const legacy = await supabase.from('schedule_items').select('*');
      if (!legacy.error) {
        data = legacy.data;
        error = null;
      }
    }

    if (error) throw error;

    const rows = data || [];
    let subjectNames = {};
    const subjectIds = [...new Set(rows.map((r) => r.subject_id).filter(Boolean))];

    if (subjectIds.length) {
      const { data: subjects } = await supabase
        .from('subjects')
        .select('id, name')
        .in('id', subjectIds);
      subjectNames = Object.fromEntries((subjects || []).map((s) => [s.id, s.name]));
    }

    events = rows.map((r) => ({
      ...r,
      subject_name: subjectNames[r.subject_id] || r.subject_name || ''
    }));

    render();
  } catch (err) {
    console.error('[NUSC] loadSchedule:', err);
    const msg = String(err?.message || '');
    if (/relation|does not exist|PGRST205/i.test(msg)) {
      showError(el, 'جدول المواعيد غير موجود في قاعدة البيانات. تأكد من إنشاء جدول public.schedules.');
    } else if (/permission|RLS|42501/i.test(msg)) {
      showError(el, 'لا توجد صلاحية لقراءة الجدول. راجع سياسات RLS لجدول schedules.');
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
    initIcons();

    document.querySelectorAll('#view-tabs .tab[data-view]').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#view-tabs .tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        currentView = tab.dataset.view || 'list';
        render();
      });
    });

    await loadSchedule();
  } catch (error) {
    console.error('Schedule init:', error);
    const el = document.getElementById('schedule-content');
    if (el) showError(el, 'تعذر فتح الجدول. حاول تسجيل الدخول مجددًا.');
  }
}

init();
