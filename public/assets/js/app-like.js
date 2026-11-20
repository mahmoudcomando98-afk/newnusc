/**
 * COMANDO — منع قوائم المتصفح والسحب والتلميحات على العناصر (سلوك تطبيق)
 * الحقول والروابط الإدارية اللي بتستخدم drag & drop مستثناة.
 */
(function () {
  function isEditable(target) {
    if (!target || !target.closest) return false;
    return !!target.closest('input, textarea, select, [contenteditable="true"], .selectable');
  }

  function isUploadZone(target) {
    if (!target || !target.closest) return false;
    return !!target.closest('input[type="file"], [data-dropzone], .dropzone, .upload-dropzone');
  }

  document.addEventListener('contextmenu', function (e) {
    if (!isEditable(e.target)) e.preventDefault();
  });

  document.addEventListener('dragstart', function (e) {
    if (isEditable(e.target) || isUploadZone(e.target)) return;
    e.preventDefault();
  });

  document.addEventListener('selectstart', function (e) {
    if (!isEditable(e.target)) e.preventDefault();
  });

  function stripTitles() {
    document.querySelectorAll('a[title], button[title]').forEach(function (el) {
      var title = el.getAttribute('title');
      if (!title) return;
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', title);
      el.removeAttribute('title');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', stripTitles, { once: true });
  } else {
    stripTitles();
  }
})();
