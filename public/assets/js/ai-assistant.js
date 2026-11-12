/**
 * COMANDO — المساعد الذكي (زر عائم + لوحة شات)
 *
 * السلوك المطلوب (من طلب المستخدم):
 * - الزر العائم موجود دائمًا للطالب المسجل
 * - اللوحة تتفتح تلقائيًا مرة واحدة فقط على الصفحة الرئيسية عقب تسجيل الدخول (كمظهر ترحيبي)
 * - زر الإغلاق يمنع التلقائي طوال الجلسة (حتى logout/login)
 * - لا يوجد تخزين للمحادثة محليًا — كل صفحة تحميل تبدأ شات جديد فارغ تمامًا
 */

var SUPABASE_URL = 'https://bmqqacvgtevogcuqfryq.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_pg_buypRU6LXEbY1uIwNCw_ZatgDQjp';
var SESSION_KEY = 'nusc-auth-token';
var AUTO_OPEN_KEY = 'ai_auto_open_done'; // sessionStorage — ترحيب مرة واحدة لكل تسجيل دخول

var ROBOT_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="8.5" rx="3.5"/><path d="M12 6.5v4"/><circle cx="12" cy="5" r="1.2"/><circle cx="9.5" cy="15" r="0.95" fill="currentColor" stroke="none"/><circle cx="14.5" cy="15" r="0.95" fill="currentColor" stroke="none"/></svg>';
var SEND_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
var CLOSE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

var state = { open: false, sending: false, messages: [] };

function $(id) { return document.getElementById(id); }
function getToken() {
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return parsed?.access_token || null;
  } catch { return null; }
}
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function getBody() { return $('ai-body'); }
function scrollToBottom() { var body = getBody(); if (body) body.scrollTop = body.scrollHeight; }

function emptyStateHtml() {
  return (
    '<div class="ai-empty">' +
      'اسألني عن المواد، الملفات، الكويزات أو مذاكرة الامتحانات — أنا هنا عشانك' +
      '<div class="ai-chips">' +
        '<button class="ai-chip" type="button" data-q="إيه عندي النهاردة؟">إيه عندي النهاردة؟</button>' +
        '<button class="ai-chip" type="button" data-q="اكتبلي ملخص سريع لأقوى المواد عندي">ملخص المواد</button>' +
        '<button class="ai-chip" type="button" data-q="فين أقرب موعد كويز عندي؟">موعد أقرب كويز</button>' +
      '</div>' +
    '</div>'
  );
}

function renderMessages() {
  var body = getBody();
  if (!body) return;
  if (!state.messages.length) {
    body.innerHTML = emptyStateHtml();
    return;
  }
  body.innerHTML = state.messages
    .map(function (m) { return '<div class="ai-msg ai-msg-' + escapeHtml(m.role) + '">' + escapeHtml(m.content) + '</div>'; })
    .join('');
  scrollToBottom();
}

function addMessage(role, content) {
  state.messages.push({ role: role, content: content });
  renderMessages();
}

function setSending(sending) {
  state.sending = sending;
  var send = $('ai-send');
  var input = $('ai-input');
  if (send) send.disabled = sending;
  if (input) input.disabled = sending;
  var existing = document.getElementById('ai-typing');
  if (sending && !existing) {
    var body = getBody();
    if (body) {
      var el = document.createElement('div');
      el.id = 'ai-typing';
      el.className = 'ai-typing';
      el.innerHTML = '<span></span><span></span><span></span>';
      body.appendChild(el);
      scrollToBottom();
    }
  } else if (!sending && existing) {
    existing.remove();
  }
}

function friendlyError(errText) {
  var msg = String(errText || '').toLowerCase();
  if (msg.indexOf('429') !== -1) return 'محاولات كتير — استنى دقيقة وجرب تاني.';
  if (msg.indexOf('401') !== -1 || msg.indexOf('jwt') !== -1) return 'انتهت جلستك — سجّل دخول تاني.';
  return 'حصلت مشكلة — جرّب تاني.';
}

async function callAi(body) {
  var token = getToken();
  var res = await fetch(SUPABASE_URL + '/functions/v1/ai-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + (token || '')
    },
    body: JSON.stringify(body)
  });
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok || data?.error) {
    var err = data?.error || ('HTTP ' + res.status);
    throw new Error(err);
  }
  if (!data?.reply) throw new Error('رد فاضي');
  return data;
}

async function sendQuestion(question) {
  var q = String(question || '').trim();
  if (!q || state.sending) return;
  addMessage('user', q);
  setSending(true);
  var history = state.messages.map(function (m) { return { role: m.role, content: m.content }; });
  try {
    var data = await callAi({ messages: history });
    addMessage('assistant', data.reply);
  } catch (err) {
    var body = getBody();
    if (body) {
      var el = document.createElement('div');
      el.className = 'ai-msg ai-msg-error';
      el.textContent = friendlyError(err?.message || err);
      body.appendChild(el);
      scrollToBottom();
    }
  } finally {
    setSending(false);
  }
}

// إغلاق → منع التلقائي طوال الجلسة
// بصمة الجلسة الحالية — عشان الترحيب يفتح تلقائي مرة واحدة فقط لكل تسجيل دخول
// (حتى لو سجّل الطالب خروج ودخول تاني في نفس التبويب)
function sessionFingerprint() {
  var token = getToken() || '';
  var hash = 0;
  for (var i = 0; i < token.length; i++) {
    hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
  }
  return String(hash) + ':' + token.length;
}
function markSeen() {
  try { sessionStorage.setItem(AUTO_OPEN_KEY, sessionFingerprint()); } catch { /* ignore */ }
}
function canAutoOpen() {
  var path = (window.location.pathname || '').toLowerCase();
  var isHome = path === '/' || path.endsWith('/home.html') || path.endsWith('/index.html');
  if (!isHome) return false;
  try { return sessionStorage.getItem(AUTO_OPEN_KEY) !== sessionFingerprint(); } catch { return false; }
}
function togglePanel(force, { welcome = false } = {}) {
  var panel = $('ai-panel');
  var fab = $('ai-fab');
  if (!panel || !fab) return;
  var open = typeof force === 'boolean' ? force : !state.open;
  state.open = open;
  panel.hidden = !open;
  fab.setAttribute('aria-expanded', String(open));
  if (open) {
    setTimeout(function () { $('ai-input') && $('ai-input').focus(); }, 60);
    if (welcome && state.messages.length === 0) {
      callAi({ action: 'welcome' })
        .then(function (data) { addMessage('assistant', data.reply); })
        .catch(function () { /* تجاهل — المستخدم هيقدر يكتب عادي */ });
    }
  }
}

function buildPanel() {
  if ($('ai-panel')) return;

  var fab = document.createElement('button');
  fab.id = 'ai-fab';
  fab.type = 'button';
  fab.className = 'ai-fab';
  fab.setAttribute('aria-label', 'المساعد الذكي');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = ROBOT_SVG + '<span class="ai-fab-badge" aria-hidden="true"></span>';
  fab.addEventListener('click', function () { togglePanel(); });
  document.body.appendChild(fab);

  var panel = document.createElement('section');
  panel.id = 'ai-panel';
  panel.className = 'ai-panel';
  panel.hidden = true; // تبدأ مخفية — لا تظهر إلا بالزر
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'المساعد الذكي — COMANDO');
  panel.innerHTML =
    '<div class="ai-header">' +
      '<div class="ai-header-icon">' + ROBOT_SVG + '</div>' +
      '<div class="ai-header-text">' +
        '<p class="ai-header-title">مساعد COMANDO الذكي</p>' +
        '<p class="ai-header-sub">يعرف مجال الدراسة والجدول والامتحانات</p>' +
      '</div>' +
      '<button type="button" class="ai-close" id="ai-close" aria-label="إغلاق">' + CLOSE_SVG + '</button>' +
    '</div>' +
    '<div class="ai-body" id="ai-body" aria-live="polite"></div>' +
    '<form class="ai-input-bar" id="ai-form" autocomplete="off">' +
      '<textarea class="ai-input" id="ai-input" rows="1" placeholder="اسألني عن المواد، الملفات، المواعيد…" aria-label="اكتب سؤالك" required></textarea>' +
      '<button type="submit" class="ai-send" id="ai-send" aria-label="إرسال">' + SEND_SVG + '</button>' +
    '</form>';
  document.body.appendChild(panel);

  $('ai-close').addEventListener('click', function () {
    markSeen();
    togglePanel(false);
  });
  $('ai-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('ai-input');
    var q = input ? input.value : '';
    if (input) input.value = '';
    sendQuestion(q);
  });
  $('ai-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      var input = $('ai-input');
      var q = input ? input.value : '';
      if (input) input.value = '';
      sendQuestion(q);
    }
  });
  getBodyChips();
  function getBodyChips() {
    $('ai-body').addEventListener('click', function (e) {
      var chip = e.target.closest ? e.target.closest('.ai-chip') : null;
      if (chip && chip.dataset && chip.dataset.q) sendQuestion(chip.dataset.q);
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.open) {
      markSeen();
      togglePanel(false);
    }
  });

  renderMessages();
}

function init() {
  var path = (window.location.pathname || '').toLowerCase();
  if (/admin/i.test(path)) return;
  if (!getToken()) return;

  // تنظيف مفاتيح قديمة من نسخ سابقة كانت بتحفظ المحادثة محليًا
  try { localStorage.removeItem('ai_chat_history_v1'); } catch { /* ignore */ }

  state.messages = []; // دائمًا شات نظيف في كل صفحة
  buildPanel();

  // ترحيب تلقائي مرة واحدة فقط على الصفحة الرئيسية لكل جلسة تسجيل
  if (canAutoOpen()) {
    markSeen(); // في حال ضُغط X الآن أو أي شيء ثاني
    togglePanel(true, { welcome: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
