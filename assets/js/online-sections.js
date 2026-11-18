/**
 * Student online sections timetable
 */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, formatTime, showEmpty, showError, initIcons, setActiveNav, WEEKDAYS_AR } from './utils.js';

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const da = Number(a.day_of_week);
    const db = Number(b.day_of_week);
    if (da !== db) return da - db;
    if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
    return String(a.start_time || '').localeCompare(String(b.start_time || ''));
  });
}

function renderMakeup(rows) {
  const items = sortRows(rows)
    .map((row) => {
      const start = row.start_time ? formatTime(row.start_time) : '—';
      const end = row.end_time ? formatTime(row.end_time) : '';
      const instructor = row.instructor
        ? `<p class="os-instructor"><strong>المعيد:</strong> ${escapeHtml(row.instructor)}</p>`
        : '';

      return `
            <li class="os-item os-item--makeup">
              <div class="os-time">
                <span class="os-time-start">${escapeHtml(start)}</span>
                ${end ? `<span class="os-time-end">${escapeHtml(end)}</span>` : ''}
              </div>
              <div class="os-body">
                <p class="os-course">${escapeHtml(row.course_name || '—')}</p>
                ${instructor}
                <p class="os-makeup-tag"><span data-icon="clock"></span>تعويض</p>
              </div>
            </li>`;
    })
    .join('');

  return `
    <section class="os-makeup" aria-label="سيكشن تعويضي">
      <header class="os-makeup-head">
        <h2 class="os-makeup-title">سيكشن تعويضي</h2>
        <span class="os-day-count">${rows.length === 1 ? 'سكشن واحد' : `${rows.length} سكاشن`}</span>
      </header>
      <ul class="os-list">${items}</ul>
      <p class="os-makeup-note">السكاشن دي إضافية — مش بتتعرض مع السكاشن العادية.</p>
    </section>`;
}

function renderSchedule(rows) {
  if (!rows.length) {
    return `<div class="os-days"><p class="os-empty-regular">لسه مفيش سكاشن عادية — بس السكاشن التعويضية تحت.</p></div>`;
  }
  const byDay = new Map();
  sortRows(rows).forEach((row) => {
    const day = Number(row.day_of_week);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(row);
  });

  const daysHtml = [...byDay.keys()]
    .sort((a, b) => a - b)
    .map((day) => {
      const items = byDay.get(day);
      const dayName = WEEKDAYS_AR[day] || `يوم ${day}`;
      const countLabel = items.length === 1 ? 'سكشن واحد' : `${items.length} سكاشن`;

      const itemsHtml = items
        .map((row) => {
          const start = row.start_time ? formatTime(row.start_time) : '—';
          const end = row.end_time ? formatTime(row.end_time) : '';
          const instructor = row.instructor
            ? `<p class="os-instructor"><strong>المعيد:</strong> ${escapeHtml(row.instructor)}</p>`
            : '';

          return `
            <li class="os-item">
              <div class="os-time">
                <span class="os-time-label">من</span>
                <span class="os-time-start">${escapeHtml(start)}</span>
                ${end ? `<span class="os-time-label">إلى</span><span class="os-time-end">${escapeHtml(end)}</span>` : ''}
              </div>
              <div class="os-body">
                <p class="os-course">${escapeHtml(row.course_name || '—')}</p>
                ${instructor}
              </div>
            </li>`;
        })
        .join('');

      return `
        <section class="os-day" aria-label="${escapeHtml(dayName)}">
          <header class="os-day-head">
            <h2 class="os-day-name">${escapeHtml(dayName)}</h2>
            <span class="os-day-count">${escapeHtml(countLabel)}</span>
          </header>
          <ul class="os-list">${itemsHtml}</ul>
        </section>`;
    })
    .join('');

  return `
    <div class="os-days">${daysHtml}</div>
    <p class="os-footer">الأوقات بتوقيت القاهرة</p>`;
}

async function load() {
  const el = document.getElementById('os-root');
  try {
    let { data, error } = await supabase
      .from('online_sections')
      .select('id, day_of_week, start_time, end_time, course_name, instructor, sort_order, is_published, is_compensatory')
      .eq('is_published', true)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (error && /is_compensatory/i.test(String(error.message || ''))) {
      ({ data, error } = await supabase
        .from('online_sections')
        .select('id, day_of_week, start_time, end_time, course_name, instructor, sort_order, is_published')
        .eq('is_published', true)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true }));
    }

    if (error) throw error;
    if (!data?.length) {
      showEmpty(el, 'لسه مفيش جدول سكاشن أونلاين. الأدمن هيضيفه قريب.');
      return;
    }
    const makeup = data.filter((row) => row.is_compensatory === true);
    const regular = data.filter((row) => row.is_compensatory !== true);
    const makeupHtml = makeup.length ? renderMakeup(makeup) : '';
    el.innerHTML = makeupHtml + renderSchedule(regular);
  } catch (err) {
    console.error(err);
    showError(
      el,
      err.message?.includes('relation') || err.code === '42P01'
        ? 'جدول السكاشن مش موجود. نفّذ supabase/online_sections.sql في Supabase.'
        : 'تعذر تحميل جدول السكاشن. حاول مرة أخرى.'
    );
  }
}

async function init() {
  const ok = await protectPage();
  if (!ok) return;
  initIcons();
  setActiveNav?.('schedule');
  await load();
}

init();
