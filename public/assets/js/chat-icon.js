/**
 * COMANDO — زر الـ chat في البار العلوي (يضيف أيقونة دردشة الدفعة مع عدد الرسائل الجديدة
 * يُحقن في كل صفحة طالبة عبر vite plugin (مثل theme.js)
 */

(function () {
  if (typeof document === 'undefined') return;
  const path = (window.location.pathname || '').toLowerCase();
  if (/\/admin\//.test(path)) return;
  if (path.includes('/login') || path.includes('/maintenance') || path.includes('/offline') || path.includes('/banned')) return;

  const UNREAD_KEY = 'comando_chat_unread';
  const LAST_SEEN_KEY = 'comando_chat_last_seen';

  var CHAT_SVG =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  function getUnread() {
    try { return Math.max(0, parseInt(localStorage.getItem(UNREAD_KEY) || '0', 10) || 0); } catch (e) { return 0; }
  }

  function applyBadge(btn, n) {
    var badge = btn.querySelector('.chat-unread-badge');
    if (n > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'chat-unread-badge';
        badge.setAttribute('aria-hidden', 'true');
        btn.appendChild(badge);
      }
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.style.display = '';
    } else if (badge) {
      badge.style.display = 'none';
    }
  }

  function updateBadge() {
    var btn = document.getElementById('chat-icon-btn');
    if (!btn) return;
    applyBadge(btn, getUnread());
  }

  function buildBtn() {
    var btn = document.getElementById('chat-icon-btn');
    if (btn) return btn;

    var anchor = document.querySelector('.notification-header-btn');
    if (!anchor) return null;

    btn = document.createElement('a');
    btn.id = 'chat-icon-btn';
    btn.href = '/chat.html';
    btn.className = 'header-btn chat-icon-btn';
    btn.title = 'دردشة الدفعة';
    btn.setAttribute('aria-label', 'دردشة الدفعة');
    btn.innerHTML = CHAT_SVG;

    anchor.parentNode.insertBefore(btn, anchor);
    applyBadge(btn, getUnread());
    return btn;
  }

  // تقدير الـ unread: كل رسالة أحدث من lastSeen تعتبر غير مقروءة
  async function refreshUnread() {
    try {
      var raw = localStorage.getItem('nusc-auth-token');
      if (!raw) return;
      var token = JSON.parse(raw).access_token;
      if (!token) return;
      var lastSeen = localStorage.getItem(LAST_SEEN_KEY) || '';

      var res = await fetch('https://bmqqacvgtevogcuqfryq.supabase.co/rest/v1/chat_messages?select=id,created_at&order=created_at.desc&limit=30', {
        headers: {
          apikey: 'sb_publishable_pg_buypRU6LXEbY1uIwNCw_ZatgDQjp',
          Authorization: 'Bearer ' + token
        }
      });
      var rows = await res.json().catch(function () { return []; });
      var count = 0;
      for (var i = 0; i < rows.length; i++) {
        if (lastSeen && new Date(rows[i].created_at).getTime() > new Date(lastSeen).getTime()) {
          count += 1;
        }
      }
      if (!lastSeen) count = Math.min(rows.length, 99);
      localStorage.setItem(UNREAD_KEY, String(count));
      updateBadge();
    } catch (e) {
      /* ignore */
    }
  }

  function init() {
    if (!document.querySelector('.notification-header-btn')) return;
    buildBtn();
    refreshUnread();

    // استعلام كل ٦ ثواني لو الشات مش مفتوح
    setInterval(function () {
      if (window.location.pathname.toLowerCase() === '/chat.html') {
        localStorage.setItem(UNREAD_KEY, '0');
        updateBadge();
        return;
      }
      refreshUnread();
    }, 6000);

    window.addEventListener('storage', function (e) {
      if (e.key === UNREAD_KEY) updateBadge();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
