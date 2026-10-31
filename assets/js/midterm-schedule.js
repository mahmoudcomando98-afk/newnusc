/**
 * Student midterm exam schedule
 */
import { protectPage } from './auth.js';
import { supabase } from './supabase.js';
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

function timeRange(start, end) {
  const a = formatTimeAr(start);
  const b = formatTimeAr(end);
  if (a && b) return `${a} – ${b}`;
  return a || b || '—';
}

function formatDateLabel(isoDate) {
  try {
    const d = new Date(isoDate + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return isoDate;
    const weekday = WEEKDAYS_AR[d.getDay()] || '';
    const formatted = d.toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return { weekday, formatted };
  } catch {
    return { weekday: '', formatted: isoDate };
  }
}

async function loadMeta() {
  const { data } = await supabase
    .from('midterm_schedule_meta')
    .select('title, subtitle, note, footer_note')
    .eq('id', 1)
    .maybeSingle();
  return data || {};
}

async function loadExams() {
  const { data, error } = await supabase
    .from('midterm_exams')
    .select('id, exam_date, start_time, end_time, subject_name, location, notes, sort_order')
    .eq('is_active', true)
    .order('exam_date', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data || [];
}

function renderTable(exams) {
  const root = document.getElementById('mt-table-root');
  if (!exams.length) {
    root.innerHTML = '<div class="midterm-empty">لسه مفيش مواعيد ميد تيرم. لما الأدمن يضيف الجدول هيظهر هنا.</div>';
    return;
  }

  const byDate = new Map();
  exams.forEach((e) => {
    const key = String(e.exam_date).slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(e);
  });

  const dates = [...byDate.keys()].sort();
  let body = '';
  dates.forEach((dateKey) => {
    const { weekday, formatted } = formatDateLabel(dateKey);
    body += `<tr class="day-row"><td colspan="3">
      ${escapeHtml(weekday)}${weekday ? ' · ' : ''}${escapeHtml(formatted)}
    </td></tr>`;
    (byDate.get(dateKey) || []).forEach((e, i) => {
      const alt = i % 2 === 1 ? ' alt' : '';
      const notes = e.notes
        ? `<span class="exam-notes">${escapeHtml(e.notes)}</span>`
        : '';
      body += `
        <tr class="exam-row${alt}">
          <td class="time-cell">${escapeHtml(timeRange(e.start_time, e.end_time))}</td>
          <td class="subject-cell">${escapeHtml(e.subject_name || '')}${notes}</td>
          <td class="location-cell">${escapeHtml(e.location || '—')}</td>
        </tr>`;
    });
  });

  root.innerHTML = `
    <div class="midterm-table-wrap">
      <table class="midterm-table" role="table">
        <thead>
          <tr>
            <th>الوقت</th>
            <th>المادة</th>
            <th>المكان</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

async function init() {
  const ok = await protectPage();
  if (!ok) return;
  initIcons();

  try {
    const [meta, exams] = await Promise.all([loadMeta(), loadExams()]);
    document.getElementById('mt-title').textContent = meta.title || 'جدول الميد تيرم';
    document.getElementById('mt-subtitle').textContent = meta.subtitle || '';
    document.getElementById('mt-note').textContent = meta.note || '';
    document.getElementById('mt-footer').textContent = meta.footer_note || 'الأوقات بتوقيت القاهرة';
    document.title = `${meta.title || 'جدول الميد تيرم'} | NUSC`;
    renderTable(exams);
  } catch (err) {
    console.error(err);
    document.getElementById('mt-table-root').innerHTML =
      '<div class="midterm-empty">تعذر تحميل الجدول. لو الجداول لسه مش موجودة، نفّذ ملف SQL: supabase/midterm_schedule.sql</div>';
    showToast('تعذر تحميل جدول الميد تيرم.', 'error');
  }
}

init();
