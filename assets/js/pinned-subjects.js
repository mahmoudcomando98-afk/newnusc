/**
 * اختصارات المواد المثبتة (حد أقصى 3) — محلي على الجهاز لكل مستخدم
 */
const MAX_PINNED = 3;
const PREFIX = 'comando_pinned_subjects_v1';

function storageKey(userId) {
  return PREFIX + ':' + String(userId || 'guest');
}

export function getPinnedSubjectIds(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const arr = JSON.parse(raw || '[]');
    if (!Array.isArray(arr)) return [];
    return arr.map(String).filter(Boolean).slice(0, MAX_PINNED);
  } catch {
    return [];
  }
}

function savePinnedSubjectIds(userId, ids) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(ids.slice(0, MAX_PINNED)));
  } catch {
    /* ignore quota */
  }
}

export function isSubjectPinned(userId, subjectId) {
  return getPinnedSubjectIds(userId).includes(String(subjectId));
}

export function togglePinnedSubject(userId, subjectId) {
  const id = String(subjectId || '');
  if (!id) return { pinned: false, list: getPinnedSubjectIds(userId), full: false };

  let list = getPinnedSubjectIds(userId);
  if (list.includes(id)) {
    list = list.filter((x) => x !== id);
    savePinnedSubjectIds(userId, list);
    return { pinned: false, list, full: false };
  }

  if (list.length >= MAX_PINNED) {
    return { pinned: false, list, full: true };
  }

  list = [id, ...list].slice(0, MAX_PINNED);
  savePinnedSubjectIds(userId, list);
  return { pinned: true, list, full: false };
}

export function getMaxPinned() {
  return MAX_PINNED;
}
