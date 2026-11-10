/**
 * Shared lightweight Supabase loaders.
 * Narrow selects first; fall back to * if schema differs.
 * Timeouts so desktop never hangs on a slow request.
 */
import { supabase } from './supabase.js';

const QUERY_MS = 10000;

function withTimeout(promise, ms = QUERY_MS, label = 'query') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('انتهت مهلة تحميل البيانات (' + label + ')')), ms)
    )
  ]);
}

export function isVisibleRow(row) {
  if (!row) return false;
  if (row.is_published === false) return false;
  if (row.is_active === false) return false;
  if (row.publish_at) {
    const t = new Date(row.publish_at).getTime();
    if (!Number.isNaN(t) && t > Date.now()) return false;
  }
  if (row.expires_at) {
    const t = new Date(row.expires_at).getTime();
    if (!Number.isNaN(t) && t < Date.now()) return false;
  }
  return true;
}

async function selectCols(table, cols, { order = 'created_at', ascending = false, limit = 50 } = {}) {
  let q = supabase.from(table).select(cols);
  if (order) q = q.order(order, { ascending });
  if (limit) q = q.limit(limit);
  const { data, error } = await withTimeout(q, QUERY_MS, table);
  if (error) throw error;
  return data || [];
}

/* تذكر نتيجة الـ narrow select لكل جدول خلال الجلسة:
   - أول مرة: جرّب الأعمدة المطلوبة (سريع).
   - لو فشلت (الداتابيز متأخر عن الكود): استخدم * مباشرة بدون رسائل خطأ متكررة. */
const narrowState = new Map(); // table -> 'failed'

async function selectSafe(table, preferredCols, opts) {
  if (narrowState.get(table) !== 'failed') {
    try {
      return await selectCols(table, preferredCols, opts);
    } catch (err) {
      console.warn('[data-api] narrow select failed for', table, err?.message || err);
      narrowState.set(table, 'failed');
    }
  }
  try {
    return await selectCols(table, '*', opts);
  } catch (err2) {
    console.warn('[data-api] * select failed for', table, err2?.message || err2);
    return [];
  }
}

function isLectureMaterialType(type) {
  const t = String(type || 'lecture').toLowerCase().trim();
  const excluded = new Set([
    'section',
    'sections',
    'assignment',
    'assignments',
    'quiz',
    'past_exam',
    'summary',
    'summaries'
  ]);
  return !excluded.has(t);
}

export async function fetchSubjects(limit = 50) {
  const rows = await selectSafe(
    'subjects',
    'id, name, code, instructor, description, sort_order, is_published, is_active, created_at',
    { order: 'name', ascending: true, limit }
  );
  return rows.filter(isVisibleRow);
}

export async function fetchAnnouncements(limit = 40) {
  const rows = await selectSafe(
    'announcements',
    'id, title, content, body, importance, priority, is_pinned, is_published, publish_at, expires_at, subject_id, created_at',
    { order: 'created_at', ascending: false, limit }
  );
  return rows.filter(isVisibleRow).sort((a, b) => {
    const pin = Number(!!b.is_pinned) - Number(!!a.is_pinned);
    if (pin) return pin;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
}

export async function fetchMaterials(limit = 40) {
  const rows = await selectSafe(
    'materials',
    'id, title, subject_id, material_type, file_type, file_size, is_published, publish_at, is_important, is_pinned, is_delivered, due_at, download_count, created_at',
    { order: 'created_at', ascending: false, limit }
  );
  return rows.filter(isVisibleRow);
}

export async function fetchQuizzes(limit = 30) {
  try {
    const rows = await selectSafe(
      'quizzes',
      'id, title, subject_id, status, start_at, end_at, is_published, is_active, created_at',
      { order: 'start_at', ascending: true, limit }
    );
    return rows.filter(isVisibleRow);
  } catch {
    const rows = await selectSafe(
      'quizzes',
      'id, title, subject_id, status, start_at, end_at, is_published, is_active, created_at',
      { order: 'created_at', ascending: false, limit }
    );
    return rows.filter(isVisibleRow);
  }
}

export async function fetchLectureFeed(limit = 20) {
  const [matsResult, lecResult] = await Promise.all([
    selectSafe(
      'materials',
      'id, title, subject_id, material_type, file_type, created_at, is_published, publish_at, is_active, is_pinned',
      { order: 'created_at', ascending: false, limit: Math.max(limit * 4, 30) }
    ).catch(() => []),
    selectSafe(
      'lectures',
      'id, title, subject_id, lecture_number, lecture_date, published_at, created_at, is_published, is_active',
      { order: 'created_at', ascending: false, limit }
    ).catch(() => [])
  ]);

  const materialLectures = (matsResult || [])
    .filter(isVisibleRow)
    .filter((m) => isLectureMaterialType(m.material_type));
  const lectureRows = (lecResult || []).filter(isVisibleRow);

  const subjectIds = [
    ...new Set([...lectureRows, ...materialLectures].map((x) => x.subject_id).filter(Boolean))
  ];
  const names = await fetchSubjectNames(subjectIds);

  return [
    ...lectureRows.map((lec) => ({
      key: 'lec-' + lec.id,
      title: lec.title || 'محاضرة',
      subject: names[lec.subject_id] || '',
      created_at: lec.published_at || lec.created_at,
      href: `/lecture-details.html?id=${encodeURIComponent(lec.id)}`
    })),
    ...materialLectures.map((m) => ({
      key: 'mat-' + m.id,
      title: m.title || 'محاضرة',
      subject: names[m.subject_id] || m.file_type || '',
      created_at: m.created_at,
      href: m.subject_id
        ? `/subject-details.html?id=${encodeURIComponent(m.subject_id)}`
        : '/subjects.html'
    }))
  ]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, limit);
}

export async function fetchSubjectNames(ids) {
  if (!ids?.length) return {};
  try {
    const { data, error } = await withTimeout(
      supabase.from('subjects').select('id, name').in('id', ids),
      QUERY_MS,
      'subject-names'
    );
    if (error) throw error;
    return Object.fromEntries((data || []).map((s) => [s.id, s.name]));
  } catch {
    return {};
  }
}

export async function fetchScheduleRows(limit = 100) {
  const cols =
    'id, day_of_week, start_time, end_time, course_name, subject_name, instructor, location, room, is_published, is_active';
  try {
    const rows = await selectSafe('schedules', cols, {
      order: 'day_of_week',
      ascending: true,
      limit
    });
    return rows.filter(isVisibleRow);
  } catch {
    try {
      const rows = await selectSafe('schedule', cols, {
        order: 'day_of_week',
        ascending: true,
        limit
      });
      return rows.filter(isVisibleRow);
    } catch (e) {
      throw e;
    }
  }
}
