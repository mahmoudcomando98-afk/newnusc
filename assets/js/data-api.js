/**
 * Shared lightweight Supabase loaders used across student pages.
 * Keep queries simple (select *) so schema differences don't break pages.
 */
import { supabase } from './supabase.js';

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

async function selectAll(table, { order = 'created_at', ascending = false, limit = 50 } = {}) {
  let q = supabase.from(table).select('*');
  if (order) q = q.order(order, { ascending });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchSubjects(limit = 50) {
  const rows = await selectAll('subjects', { order: 'name', ascending: true, limit });
  return rows.filter(isVisibleRow);
}

export async function fetchAnnouncements(limit = 40) {
  const rows = await selectAll('announcements', { order: 'created_at', ascending: false, limit });
  return rows.filter(isVisibleRow).sort((a, b) => {
    const pin = Number(!!b.is_pinned) - Number(!!a.is_pinned);
    if (pin) return pin;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
}

export async function fetchMaterials(limit = 40) {
  const rows = await selectAll('materials', { order: 'created_at', ascending: false, limit });
  return rows.filter(isVisibleRow);
}

export async function fetchQuizzes(limit = 30) {
  try {
    const rows = await selectAll('quizzes', { order: 'start_at', ascending: true, limit });
    return rows.filter(isVisibleRow);
  } catch {
    const rows = await selectAll('quizzes', { order: 'created_at', ascending: false, limit });
    return rows.filter(isVisibleRow);
  }
}

export async function fetchLectureFeed(limit = 20) {
  let lectureRows = [];
  try {
    const rows = await selectAll('lectures', { order: 'created_at', ascending: false, limit });
    lectureRows = rows.filter(isVisibleRow);
  } catch {
    lectureRows = [];
  }

  let materialLectures = [];
  try {
    const mats = await fetchMaterials(30);
    materialLectures = mats.filter((m) => {
      const t = String(m.material_type || 'lecture').toLowerCase();
      return !['section', 'assignment', 'quiz'].includes(t);
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
  // Prefer schedules, fall back to schedule
  try {
    const rows = await selectAll('schedules', { order: 'day_of_week', ascending: true, limit });
    return rows.filter(isVisibleRow);
  } catch {
    try {
      const rows = await selectAll('schedule', { order: 'day_of_week', ascending: true, limit });
      return rows.filter(isVisibleRow);
    } catch (e) {
      throw e;
    }
  }
}
