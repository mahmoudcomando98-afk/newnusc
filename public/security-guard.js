/*
 * NUSC: lightweight deterrent only.
 * Browser-side code cannot securely prevent DevTools or source inspection.
 * Never rely on this file to protect data, credentials, or privileged actions.
 */
(() => {
  'use strict';

  document.addEventListener('keydown', (event) => {
    const key = String(event.key || '').toLowerCase();
    const devToolsShortcut =
      key === 'f12' ||
      (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
      (event.ctrlKey && key === 'u');

    if (devToolsShortcut) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, { capture: true });
})();
