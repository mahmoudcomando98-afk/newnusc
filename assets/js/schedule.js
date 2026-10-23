
/**
 * NUSC Student Hub - Schedule Page
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
  if (
    event.day_of_week !== null &&
    event.day_of_week !== undefined &&
    event.day_of_week !== ''
  ) {
    const day = Number(event.day_of_week);

    if (Number.isInteger(day) && day >= 0 && day <= 6) {
      return day;
    }
  }

  if (event.event_date) {
    const date = new Date(event.event_date);

    if (!Number.isNaN(date.getTime())) {
      return date.getDay();
    }
  }

  return null;
}

function getEventDate(event) {
  return event.event_date || event.schedule_date || null;
}

function getEventType(event) {
  const type = event.event_type || event.type || 'other';

  return typeLabels[type] || type;
}

function getEventTime(event) {
  if (!event.start_time) return '';

  const start = formatTime(event.start_time);

  if (!event.end_time) return start;

  return `${start} - ${formatTime(event.end_time)}`;
}

function sortEvents(list) {
  return [...list].sort((a, b) => {
    const dayA = getEventDay(a);
    const dayB = getEventDay(b);

    if (dayA !== null && dayB !== null && dayA !== dayB) {
      return dayA - dayB;
    }

    if (dayA !== null && dayB === null) return -1;
    if (dayA === null && dayB !== null) return 1;

    const timeA = a.start_time || '';
    const timeB = b.start_time || '';

    return String(timeA).localeCompare(String(timeB));
  });
}

async function loadSchedule() {
  const el = document.getElementById('schedule-content');

  if (!el) {
    console.error('Missing #schedule-content in schedule.html');
    return;
  }

  el.innerHTML =
    '<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>';

  try {
    const { data, error } = await supabase
      .from('schedules')
      .select('*');

    if (error) throw error;

    const visibleEvents = (data || []).filter(
      (event) => event.is_published !== false
    );

    // نحاول تحميل أسماء المواد بشكل منفصل لتفادي اعتماد العرض
    // على وجود join مباشر بين الجدولين.
    let subjectNames = {};

    try {
      const { data: subjects, error: subjectsError } = await supabase
        .from('subjects')
        .select('id, name');

      if (subjectsError) throw subjectsError;

      subjectNames = Object.fromEntries(
        (subjects || []).map((subject) => [
          subject.id,
          subject.name
        ])
      );
    } catch (subjectError) {
      console.warn(
        'Could not load schedule subject names:',
        subjectError.message
      );
    }

    events = sortEvents(
      visibleEvents.map((event) => ({
        ...event,
        subject_name:
          event.subjects?.name ||
          subjectNames[event.subject_id] ||
          event.subject_name ||
          ''
      }))
    );

    render();
  } catch (error) {
    console.error('Schedule loading error:', error);

    showError(
      el,
      'تعذر تحميل الجدول. راجع أسماء الأعمدة وسياسات القراءة في Supabase.'
    );
  }
}

function render() {
  const el = document.getElementById('schedule-content');
  if (!el) return;

  if (!events.length) {
    showEmpty(el, 'لا توجد مواعيد في الجدول حاليًا');
    return;
  }

  if (currentView === 'week') {
    renderWeek(el);
  } else {
    renderList(el);
  }
}

function renderList(el) {
  el.innerHTML = `
    <div class="card">
      ${events.map((event) => {
        const day = getEventDay(event);
        const date = getEventDate(event);
        const subjectName = event.subject_name || '';

        return `
          <div class="list-item">
            <div class="list-item-icon" data-icon="calendar"></div>

            <div class="list-item-body">
              <div class="list-item-title">
                ${escapeHtml(event.title || 'موعد دراسي')}
              </div>

              <div class="list-item-desc">
                <span class="badge badge-primary">
                  ${escapeHtml(getEventType(event))}
                </span>

                ${
                  subjectName
                    ? ` ${escapeHtml(subjectName)} ·`
                    : ''
                }

                ${
                  day !== null
                    ? ` ${escapeHtml(WEEKDAYS_AR[day])}`
                    : ''
                }

                ${
                  date
                    ? ` · ${escapeHtml(formatDate(date))}`
                    : ''
                }

                ${
                  getEventTime(event)
                    ? ` · ${escapeHtml(getEventTime(event))}`
                    : ''
                }

                ${
                  event.location
                    ? ` · ${escapeHtml(event.location)}`
                    : ''
                }
              </div>

              ${
                event.notes
                  ? `<p class="text-xs text-muted mt-1">${escapeHtml(event.notes)}</p>`
                  : ''
              }
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  initIcons();
}

function renderWeek(el) {
  const byDay = Array.from({ length: 7 }, () => []);

  events.forEach((event) => {
    const day = getEventDay(event);

    if (day !== null) {
      byDay[day].push(event);
    }
  });

  const hasWeeklyEvents = byDay.some((dayEvents) => dayEvents.length);

  if (!hasWeeklyEvents) {
    showEmpty(el, 'لا توجد مواعيد مرتبطة بأيام الأسبوع حاليًا');
    return;
  }

  el.innerHTML = byDay
    .map((dayEvents, dayIndex) => {
      if (!dayEvents.length) return '';

      return `
        <section class="card mb-2">
          <h3 class="card-title">
            ${escapeHtml(WEEKDAYS_AR[dayIndex])}
          </h3>

          ${dayEvents.map((event) => `
            <div class="list-item">
              <div class="list-item-icon" data-icon="calendar"></div>

              <div class="list-item-body">
                <div class="list-item-title">
                  ${escapeHtml(event.title || 'موعد دراسي')}
                </div>

                <div class="list-item-desc">
                  ${escapeHtml(getEventType(event))}

                  ${
                    event.subject_name
                      ? ` · ${escapeHtml(event.subject_name)}`
                      : ''
                  }

                  ${
                    getEventTime(event)
                      ? ` · ${escapeHtml(getEventTime(event))}`
                      : ''
                  }

                  ${
                    event.location
                      ? ` · ${escapeHtml(event.location)}`
                      : ''
                  }
                </div>

                ${
                  event.notes
                    ? `<p class="text-xs text-muted mt-1">${escapeHtml(event.notes)}</p>`
                    : ''
                }
              </div>
            </div>
          `).join('')}
        </section>
      `;
    })
    .join('');

  initIcons();
}

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;

    setActiveNav('schedule');
    initIcons();

    document.querySelectorAll('#view-tabs .tab[data-view]').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#view-tabs .tab').forEach((item) => {
          item.classList.remove('active');
        });

        tab.classList.add('active');
        currentView = tab.dataset.view || 'list';

        render();
      });
    });

    await loadSchedule();
  } catch (error) {
    console.error('Schedule page initialization error:', error);

    const el = document.getElementById('schedule-content');

    if (el) {
      showError(el, 'تعذر فتح الجدول. حاول تسجيل الدخول مجددًا.');
    }
  }
}

init();
