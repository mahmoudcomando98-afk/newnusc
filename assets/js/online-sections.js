/**
 * Student online sections timetable
 */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, formatTime, showEmpty, showError, initIcons, setActiveNav, WEEKDAYS_AR } from './utils.js';

function formatRange(start, end) {
  if (!start) return '—';
  const s = formatTime(start);
  if (!end) return s;
  return `${s}\n${formatTime(end)}`;
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const da = Number(a.day_of_week);
    const db = Number(b.day_of_week);
    if (da !== db) return da - db;
    if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
    return String(a.start_time || '').localeCompare(String(b.start_time || ''));
  });
}

function renderTable(rows) {
  const byDay = new Map();
  sortRows(rows).forEach((row) => {
    const day = Number(row.day_of_week);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(row);
  });

  const body = [];
  [...byDay.keys()].sort((a, b) => a - b).forEach((day) => {
    const dayName = WEEKDAYS_AR[day] || `يوم ${day}`;
    body.push(`<tr class="os-day-row"><td colspan="3">${escapeHtml(dayName)}</td></tr>`);
    byDay.get(day).forEach((row) => {
      const timeHtml = formatRange(row.start_time, row.end_time)
        .split('\n')
        .map((line) => escapeHtml(line))
        .join('<br />');
      body.push(`
        <tr class="os-item">
          <td class="os-time">${timeHtml}</td>
          <td class="os-course">${escapeHtml(row.course_name || '—')}</td>
          <td class="os-instructor">${escapeHtml(row.instructor || '—')}</td>
        </tr>`);
    });
  });

  return `
    <div class="os-table-wrap">
      <table class="os-table">
        <thead>
          <tr>
            <th>الوقت</th>
            <th>المقرر</th>
            <th>المعيد</th>
          </tr>
        </thead>
        <tbody>${body.join('')}</tbody>
      </table>
    </div>
    <p class="os-footer">الأوقات بتوقيت القاهرة</p>`;
}

async function load() {
  const el = document.getElementById('os-root');
  try {
    const { data, error } = await supabase
      .from('online_sections')
      .select('id, day_of_week, start_time, end_time, course_name, instructor, sort_order, is_published')
      .eq('is_published', true)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;
    if (!data?.length) {
      showEmpty(el, 'لسه مفيش جدول سكاشن أونلاين. الأدمن هيضيفه قريب.');
      return;
    }
    el.innerHTML = renderTable(data);
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
