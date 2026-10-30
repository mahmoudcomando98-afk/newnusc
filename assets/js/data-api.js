/**
 * Shared lightweight Supabase loaders used across student pages.
 * Column lists are explicit to reduce payload / egress.
 */
import { supabase } from './supabase.js';

const SUBJECT_COLS =
  'id, name, code, subject_code, instructor, doctor_name, is_published, is_active, created_at';
const ANNOUNCEMENT_COLS =
  'id, title, content, body, importance, priority, is_pinned, is_published, expires_at, subject_id, created_at';
const MATERIAL_LIST_COLS =
  'id, title, subject_id, material_type, file_type, file_size, is_published, is_important, is_pinned, created_at';
const QUIZ_COLS =
  'id, title, subject_id, status, start_at, end_at, is_published, is_active, created_at';
const LECTURE_COLS =
  'id, title, subject_id, lecture_number, lecture_date, published_at, created_at, is_published, is_active';

export function isVisibleRow(row) {
  if (!row) return false;
  if (row.is_published === false) return false;
  if (row.is_active === false) return false;
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
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchSubjects(limit = 50) {
  const rows = await selectCols('subjects', SUBJECT_COLS, {
    order: 'name',
    ascending: true,
    limit
  });
  return rows.filter(isVisibleRow);
}

export async function fetchAnnouncements(limit = 40) {
  const rows = await selectCols('announcements', ANNOUNCEMENT_COLS, {
    order: 'created_at',
    ascending: false,
    limit
  });
  return rows.filter(isVisibleRow).sort((a, b) => {
    const pin = Number(!!b.is_pinned) - Number(!!a.is_pinned);
    if (pin) return pin;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
}

export async function fetchMaterials(limit = 40) {
  const rows = await selectCols('materials', MATERIAL_LIST_COLS, {
    order: 'created_at',
    ascending: false,
    limit
  });
  return rows.filter(isVisibleRow);
}

export async function fetchQuizzes(limit = 30) {
  try {
    const rows = await selectCols('quizzes', QUIZ_COLS, {
      order: 'start_at',
      ascending: true,
      limit
    });
    return rows.filter(isVisibleRow);
  } catch {
    const rows = await selectCols('quizzes', QUIZ_COLS, {
      order: 'created_at',
      ascending: false,
      limit
    });
    return rows.filter(isVisibleRow);
  }
}

export async function fetchLectureFeed(limit = 20) {
  let lectureRows = [];
  try {
    const rows = await selectCols('lectures', LECTURE_COLS, {
      order: 'created_at',
      ascending: false,
      limit
    });
    lectureRows = rows.filter(isVisibleRow);
  } catch {
    lectureRows = [];
  }

  let materialLectures = [];
  try {
    // Only enough materials to fill the feed — not a full dump
    const mats = await fetchMaterials(Math.max(limit, 12));
    materialLectures = mats.filter((m) => {
      const t = String(m.material_type || 'lecture').toLowerCase();
      return !['section', 'assignment', 'quiz', 'past_exam', 'summary'].includes(t);
    });
  } catch {
    materialLectures = [];
  }

  const subjectIds = [
    ...new Set([...lectureRows, ...materialLectures].map((x) => x.subject_id).filter(Boolean))
  ];
  const names = await fetchSubjectNames(subjectIds);

  const feed = [
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

  return feed;
}

export async function fetchSubjectNames(ids) {
  if (!ids?.length) return {};
  try {
    const { data, error } = await supabase.from('subjects').select('id, name').in('id', ids);
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
    const rows = await selectCols('schedules', cols, {
      order: 'day_of_week',
      ascending: true,
      limit
    });
    return rows.filter(isVisibleRow);
  } catch {
    try {
      const rows = await selectCols('schedule', cols, {
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
