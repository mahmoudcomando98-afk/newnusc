/**
 * Student online sections schedule
 */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, showToast, initIcons, WEEKDAYS_AR } from './utils.js';

function formatTimeAr(t) {
  if (!t) return '';
  const parts = String(t).slice(0, 5).split(':');
  let h = Number(parts[0]);
  const m = parts[1] || '00';
  if (Number.isNaN(h)) return String(t).slice(0, 5);
  const suffix = h >= 12 ? 'م' : 'ص';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m} ${suffix}`;
}

function timeBlock(start, end) {
  const a = formatTimeAr(start);
  const b = formatTimeAr(end);
  if (a && b) return `${a}<br>${b}`;
  return a || b || '—';
}

async function loadMeta() {
  const { data } = await supabase
    .from('online_schedule_meta')
    .select('title, subtitle, note, footer_note')
    .eq('id', 1)
    .maybeSingle();
  return data || {};
}

async function loadSessions() {
  const { data, error } = await supabase
    .from('online_section_sessions')
    .select('id, day_of_week, start_time, end_time, course_name, instructor_name, link_url, sort_order')
    .eq('is_active', true)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data || [];
}

function renderTable(sessions) {
  const root = document.getElementById('os-table-root');
  if (!sessions.length) {
    root.innerHTML = '<div class="online-schedule-empty">لسه مفيش سكاشن أونلاين مضافة.</div>';
    return;
  }

  const byDay = new Map();
  sessions.forEach((s) => {
    const d = Number(s.day_of_week);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(s);
  });

  const days = [...byDay.keys()].sort((a, b) => a - b);
  let body = '';
  days.forEach((day) => {
    const dayName = WEEKDAYS_AR[day] || `يوم ${day}`;
    body += `<tr class="day-row"><td colspan="3">${escapeHtml(dayName)}</td></tr>`;
    (byDay.get(day) || []).forEach((s, i) => {
      const alt = i % 2 === 1 ? ' alt' : '';
      const link = s.link_url
        ? `<a class="session-link" href="${escapeHtml(s.link_url)}" target="_blank" rel="noopener noreferrer">دخول السكشن</a>`
        : '';
      body += `
        <tr class="session-row${alt}">
          <td class="time-cell">${timeBlock(s.start_time, s.end_time)}</td>
          <td class="course-cell">${escapeHtml(s.course_name || '')}${link}</td>
          <td class="instructor-cell">${escapeHtml(s.instructor_name || '—')}</td>
        </tr>`;
    });
  });

  root.innerHTML = `
    <table class="online-table" role="table">
      <thead>
        <tr>
          <th>الوقت</th>
          <th>المقرر</th>
          <th>المعيد</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

async function init() {
  const ok = await protectPage();
  if (!ok) return;
  initIcons();

  try {
    const [meta, sessions] = await Promise.all([loadMeta(), loadSessions()]);
    document.getElementById('os-title').textContent = meta.title || 'جدول الأونلاين';
    document.getElementById('os-subtitle').textContent = meta.subtitle || '';
    document.getElementById('os-note').textContent = meta.note || '';
    document.getElementById('os-footer').textContent = meta.footer_note || 'الأوقات بتوقيت القاهرة';
    document.title = `${meta.title || 'جدول الأونلاين'} | NUSC`;
    renderTable(sessions);
  } catch (err) {
    console.error(err);
    document.getElementById('os-table-root').innerHTML =
      '<div class="online-schedule-empty">تعذر تحميل الجدول. تأكد من تنفيذ SQL في Supabase.</div>';
    showToast('تعذر تحميل جدول الأونلاين.', 'error');
  }
}

init();
