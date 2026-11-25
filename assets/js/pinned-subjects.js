/** Feature cancelled */
export function getPinnedSubjectIds() {
  return [];
}
export function isSubjectPinned() {
  return false;
}
export function togglePinnedSubject() {
  return { pinned: false, list: [], full: false };
}
export function getMaxPinned() {
  return 0;
}
