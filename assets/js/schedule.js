/**
 * NUSC Student Hub - Schedule
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

async function init() {
  const result = await protectPage();
  if (!result) return;

  setActiveNav('schedule');
  initIcons();

  document.querySelectorAll('#view-tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#view-tabs .tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentView = tab.dataset.view;
      render();
    });
  });

  await loadSchedule();
}

async function loadSchedule() {
  const el = document.getElementById('schedule-content');
  try {
    const { data, error } = await supabase
      .from('schedules')
      .select('id, title, event_type, day_of_week, event_date, start_time, end_time, location, notes, subjects(name)')
      .eq('is_published', true)
      .order('day_of_week')
      .order('start_time');

    if (error) throw error;
    events = data || [];
    render();
  } catch (err) {
    console.error(err);
    showError(el, 'تعذر تحميل الجدول');
  }
}

function render() {
  const el = document.getElementById('schedule-content');
  if (!events.length) {
    showEmpty(el, 'لا توجد مواعيد في الجدول حالياً');
    return;
  }

  if (currentView === 'week') {
    renderWeek(el);
  } else {
    renderList(el);
  }
}

function renderList(el) {
  el.innerHTML = `<div class="card">${events.map((e) => `
    <div class="list-item">
      <div class="list-item-icon" data-icon="calendar"></div>
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(e.title)}</div>
        <div class="list-item-desc">
          <span class="badge badge-primary">${typeLabels[e.event_type] || e.event_type}</span>
          ${e.subjects?.name ? escapeHtml(e.subjects.name) + ' \u00b7 ' : ''}
          ${e.day_of_week != null ? WEEKDAYS_AR[e.day_of_week] : ''}
          ${e.event_date ? formatDate(e.event_date) : ''}
          ${e.start_time ? formatTime(e.start_time) : ''}
          ${e.end_time ? ' - ' + formatTime(e.end_time) : ''}
          ${e.location ? ' \u00b7 ' + escapeHtml(e.location) : ''}
        </div>
        ${e.notes ? `<p class="text-xs text-muted mt-1">${escapeHtml(e.notes)}</p>` : ''}
      </div>
    </div>
  `).join('')}</div>`;
  initIcons();
}

function renderWeek(el) {
  const byDay = {};
  for (let i = 0; i < 7; i++) byDay[i] = [];

  events.forEach((e) => {
    if (e.day_of_week != null) {
      byDay[e.day_of_week].push(e);
    }
  });

  el.innerHTML = Object.entries(byDay)
    .filter(([, list]) => list.length)
    .map(([day, list]) => `
      <div class="card mb-2">
        <h3 class="card-title">${WEEKDAYS_AR[day]}</h3>
        ${list.map((e) => `
          <div class="list-item">
            <div class="list-item-body">
              <div class="list-item-title">${escapeHtml(e.title)}</div>
              <div class="list-item-desc">
                ${typeLabels[e.event_type] || ''}
                ${e.start_time ? formatTime(e.start_time) : ''}
                ${e.end_time ? ' - ' + formatTime(e.end_time) : ''}
                ${e.location ? ' \u00b7 ' + escapeHtml(e.location) : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('') || '<div class="empty-state"><p>لا توجد مواعيد أسبوعية محددة</p></div>';
}

init();
