/**
 * يحمّل خط Cairo فورًا على أي صفحة تستورد supabase / auth.
 * مش معتمد على كاش الـ CSS القديم.
 */
(function ensureCairoFont() {
  if (typeof document === 'undefined') return;

  function inject() {
    if (!document.getElementById('comando-cairo-preconnect-gstatic')) {
      const pre1 = document.createElement('link');
      pre1.id = 'comando-cairo-preconnect-googleapis';
      pre1.rel = 'preconnect';
      pre1.href = 'https://fonts.googleapis.com';
      document.head.appendChild(pre1);

      const pre2 = document.createElement('link');
      pre2.id = 'comando-cairo-preconnect-gstatic';
      pre2.rel = 'preconnect';
      pre2.href = 'https://fonts.gstatic.com';
      pre2.crossOrigin = 'anonymous';
      document.head.appendChild(pre2);
    }

    if (!document.getElementById('comando-cairo-font-link')) {
      const link = document.createElement('link');
      link.id = 'comando-cairo-font-link';
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap';
      document.head.appendChild(link);
    }

    if (!document.getElementById('comando-cairo-font-style')) {
      const style = document.createElement('style');
      style.id = 'comando-cairo-font-style';
      style.textContent =
        'html,body,button,input,select,textarea,.btn,.card,.app-header,.bottom-nav,a,p,h1,h2,h3,h4,h5,h6,span,label,li,td,th{' +
        'font-family:"Cairo",system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif!important}';
      document.head.appendChild(style);
    }
  }

  if (document.head) inject();
  else document.addEventListener('DOMContentLoaded', inject, { once: true });
})();
