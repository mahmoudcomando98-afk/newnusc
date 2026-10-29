/*
 * NUSC browser-side deterrent.
 * This blocks common shortcuts and the context menu only; it cannot securely
 * prevent DevTools, source inspection, or direct network requests.
 */
(() => {
  'use strict';

  document.addEventListener('keydown', (event) => {
    const key = String(event.key || '').toLowerCase();
    const blocked =
      key === 'f12' ||
      (event.ctrlKey && event.shiftKey && ['i', 'j', 'c', 'k'].includes(key)) ||
      (event.ctrlKey && ['u', 's'].includes(key));

    if (blocked) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  }, true);
})();
