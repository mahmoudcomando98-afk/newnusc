/**
 * يحمّل ملف Cairo المحلي على أي صفحة تستورد supabase.
 */
(function ensureCairoFont() {
  if (typeof document === 'undefined') return;

  function inject() {
    if (!document.getElementById('comando-cairo-css')) {
      const link = document.createElement('link');
      link.id = 'comando-cairo-css';
      link.rel = 'stylesheet';
      link.href = '/comando-cairo.css?v=3';
      document.head.appendChild(link);
    }

    if (!document.getElementById('comando-cairo-font-style')) {
      const style = document.createElement('style');
      style.id = 'comando-cairo-font-style';
      style.textContent =
        'html,body,button,input,select,textarea,.btn,.card,.app-header,.bottom-nav,a,p,h1,h2,h3,h4,h5,h6,span,label,li,td,th{' +
        'font-family:"Cairo",Tahoma,Arial,sans-serif!important}';
      document.head.appendChild(style);
    }
  }

  if (document.head) inject();
  else document.addEventListener('DOMContentLoaded', inject, { once: true });
})();
