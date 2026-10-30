/**
 * Mark items as "new" since last visit and "important" when flagged.
 */

const LAST_VISIT_KEY = 'nusc_last_visit_at';
const SESSION_MARKED_KEY = 'nusc_visit_touched';

export function getLastVisitAt() {
  try {
    const raw = localStorage.getItem(LAST_VISIT_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Call once after the student has seen the current lists on this visit. */
export function touchLastVisit() {
  try {
    if (sessionStorage.getItem(SESSION_MARKED_KEY)) return;
    sessionStorage.setItem(SESSION_MARKED_KEY, '1');
    // Keep "new" visible through this session paint
    window.setTimeout(() => {
      try {
        localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    }, 8000);
  } catch {
    /* ignore */
  }
}

export function isNewItem(item, lastVisit = getLastVisitAt()) {
  if (!item) return false;
  const raw = item.created_at || item.published_at || item.updated_at;
  if (!raw) return false;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return false;
  // First ever visit: items from last 5 days
  if (!lastVisit) {
    return Date.now() - t < 5 * 24 * 60 * 60 * 1000;
  }
  return t > lastVisit;
}

export function isImportantItem(item) {
  if (!item) return false;
  if (item.is_important === true || item.is_important === 'true' || item.is_important === 1) return true;
  const level = String(item.importance || item.priority || '').toLowerCase();
  return level === 'high' || level === 'urgent' || level === 'important';
}

export function freshnessBadgesHtml(item) {
  const parts = [];
  if (isImportantItem(item)) {
    parts.push('<span class="badge-important-flag" title="مهم">مهم</span>');
  }
  if (isNewItem(item)) {
    const firstVisit = !getLastVisitAt();
    const label = firstVisit ? 'جديد' : 'جديد منذ زيارتك';
    parts.push(
      `<span class="badge-new-visit" title="اتضاف بعد آخر زيارة ليك للمنصة">${label}</span>`
    );
  }
  return parts.join('');
}
