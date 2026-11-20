/**
 * COMANDO — دوال نقية للفصول الدراسية (قابلة للاختبار بدون Supabase)
 */

export const TERM_STATUS_AR = {
  draft: 'مسودة',
  active: 'مفعّل',
  paused: 'موقوف',
  archived: 'مؤرشف'
};

export function normalizeTerm(row) {
  if (!row || !row.id) return null;
  return {
    id: String(row.id),
    name: String(row.name || 'بدون اسم'),
    academic_year: row.academic_year ? String(row.academic_year) : '',
    description: row.description ? String(row.description) : '',
    status: TERM_STATUS_AR[row.status] ? row.status : 'draft',
    is_default: !!row.is_default,
    is_public: row.is_public !== false,
    sort_order: Number(row.sort_order) || 0
  };
}

export function termLabel(term, { withYear = true } = {}) {
  if (!term) return '—';
  const year = withYear && term.academic_year ? ` (${term.academic_year})` : '';
  return `${term.name}${year}`;
}

/**
 * هل يقدر المستخدم يختار الترم؟ المنطق ده بيتطابق مع RLS في قاعدة البيانات.
 */
export function canSelectTerm({ term, isSuperAdmin = false, memberTermIds = [], publicTermIds = [] }) {
  if (!term) return false;
  if (isSuperAdmin) return true;
  if (term.status !== 'active') return false;
  return (
    term.is_public === true ||
    memberTermIds.includes(term.id) ||
    publicTermIds.includes(term.id) ||
    term.is_default === true
  );
}

export function canSelectTerms(terms, ctx) {
  return (terms || []).filter((term) => canSelectTerm({ term, ...ctx }));
}

export function sortTerms(terms) {
  return [...(terms || [])].sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    const s = (a.sort_order || 0) - (b.sort_order || 0);
    if (s) return s;
    return String(a.name).localeCompare(String(b.name), 'ar');
  });
}
