/**
 * COMANDO — المساعد الذكي (زر عائم + لوحة شات)
 *
 * السلوك المطلوب (من طلب المستخدم):
 * - الزر العائم موجود دائمًا للطالب المسجل
 * - اللوحة لا تُفتح تلقائيًا أبدًا — بتتفتح بس لما الطالب يضغط الزر
 * - الفتح والقفل بأنيميشن احترافي عبر GSAP (مع fallback CSS لو الـ CDN مش متاح)
 * - زر الإغلاق لا يقفل الجلسة — بس بيخفي اللوحة والطالب يقدر يفتحها تاني في أي وقت
 * - لا يوجد تخزين للمحادثة محليًا — كل صفحة تحميل تبدأ شات جديد فارغ تمامًا
 */

var SUPABASE_URL = 'https://bmqqacvgtevogcuqfryq.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_pg_buypRU6LXEbY1uIwNCw_ZatgDQjp';
var SESSION_KEY = 'nusc-auth-token';
var GSAP_SRC = 'https://cdn.jsdelivr.net/npm/gsap@3.12.7/dist/gsap.min.js';

// روبوت مفصّل — عينان بتومض + لمبة رأس مضيئة + قلب "كور" بينبض (الأنيميشن في ai-assistant.css)
var ROBOT_SVG =
  '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" role="img">' +
    '<defs>' +
      '<linearGradient id="aig-body" x1="0" y1="14" x2="0" y2="40" gradientUnits="userSpaceOnUse">' +
        '<stop offset="0" stop-color="#fff7e8"/><stop offset="0.5" stop-color="#f1dcb8"/><stop offset="1" stop-color="#d8bd8b"/>' +
      '</linearGradient>' +
      '<linearGradient id="aig-head" x1="0" y1="6" x2="0" y2="22" gradientUnits="userSpaceOnUse">' +
        '<stop offset="0" stop-color="#fffdf4"/><stop offset="0.6" stop-color="#efdcb4"/><stop offset="1" stop-color="#cbb284"/>' +
      '</linearGradient>' +
      '<linearGradient id="aig-metal" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#8a6a3a"/><stop offset="0.5" stop-color="#6d5230"/><stop offset="1" stop-color="#4d3a22"/>' +
      '</linearGradient>' +
      '<radialGradient id="aig-glow" cx="0.5" cy="0.5" r="0.5">' +
        '<stop offset="0" stop-color="#ffe9a6"/><stop offset="0.45" stop-color="#ffc966"/><stop offset="1" stop-color="#ffc966" stop-opacity="0"/>' +
      '</radialGradient>' +
      '<radialGradient id="aig-core" cx="0.5" cy="0.5" r="0.5">' +
        '<stop offset="0" stop-color="#fff3b8"/><stop offset="0.55" stop-color="#f0b545"/><stop offset="1" stop-color="#b06f1d"/>' +
      '</radialGradient>' +
    '</defs>' +
    '<g class="ai-bot">' +
      // الأرجل
      '<rect x="16.5" y="36.5" width="6" height="5" rx="1.6" fill="url(#aig-metal)" stroke="#3f2f1c" stroke-width="1"/>' +
      '<rect x="25.5" y="36.5" width="6" height="5" rx="1.6" fill="url(#aig-metal)" stroke="#3f2f1c" stroke-width="1"/>' +
      // الأذرع
      '<rect x="6.2" y="22.5" width="5" height="9.5" rx="2.5" fill="url(#aig-metal)" stroke="#3f2f1c" stroke-width="1"/>' +
      '<rect x="36.8" y="22.5" width="5" height="9.5" rx="2.5" fill="url(#aig-metal)" stroke="#3f2f1c" stroke-width="1"/>' +
      // الجسم
      '<rect x="12.5" y="20.5" width="23" height="17" rx="4.5" fill="url(#aig-body)" stroke="#4d3a22" stroke-width="1.2"/>' +
      // قلب الجسم "الكور"
      '<circle cx="24" cy="29" r="4.6" fill="#2b211a" stroke="#4d3a22" stroke-width="1"/>' +
      '<circle class="ai-bot-core" cx="24" cy="29" r="2.6" fill="url(#aig-core)"/>' +
      // Antenna
      '<line x1="24" y1="8" x2="24" y2="4.5" stroke="#6d5230" stroke-width="1.6" stroke-linecap="round"/>' +
      '<circle class="ai-bot-bulb" cx="24" cy="3.3" r="3.2" fill="url(#aig-glow)"/>' +
      '<circle class="ai-bot-bulb" cx="24" cy="3.3" r="1.9" fill="#fff0b8"/>' +
      // الرأس
      '<rect x="11" y="8.5" width="26" height="13.5" rx="4.5" fill="url(#aig-head)" stroke="#4d3a22" stroke-width="1.2"/>' +
      // ودانتين جانبتين
      '<circle cx="10" cy="15" r="2.4" fill="url(#aig-metal)" stroke="#3f2f1c" stroke-width="1"/>' +
      '<circle cx="38" cy="15" r="2.4" fill="url(#aig-metal)" stroke="#3f2f1c" stroke-width="1"/>' +
      // الشاشة / الفيسر
      '<rect x="14.5" y="11.3" width="19" height="7.8" rx="3.9" fill="#241c17" stroke="#4d3a22" stroke-width="1"/>' +
      // العينين (بتتومض)
      '<g class="ai-bot-eyes">' +
        '<circle cx="20" cy="15.2" r="1.75" fill="#ffd56b"/>' +
        '<circle cx="28" cy="15.2" r="1.75" fill="#ffd56b"/>' +
        '<circle cx="20.6" cy="14.6" r="0.55" fill="#fffbe3"/>' +
        '<circle cx="28.6" cy="14.6" r="0.55" fill="#fffbe3"/>' +
      '</g>' +
      // خطوط الفم تحت العينين
      '<line x1="20.5" y1="17.9" x2="27.5" y2="17.9" stroke="#ffd56b" stroke-width="0.7" stroke-linecap="round" opacity="0.75"/>' +
    '</g>' +
  '</svg>';
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

/* تحميل GSAP بشكل كسول — بدون ما يحجز الصفحة، ومع fallback لأي صفحة لو الـ CDN مش متاح */
var gsapState = { loading: false };
function loadGsapAsync(done) {
  if (window.gsap) { done(true); return; }
  if (gsapState.loading) {
    var iv = setInterval(function () {
      if (window.gsap || !gsapState.loading) {
        clearInterval(iv);
        done(!!window.gsap);
      }
    }, 80);
    return;
  }
  gsapState.loading = true;
  var script = document.createElement('script');
  script.src = GSAP_SRC;
  script.async = true;
  script.onload = function () { gsapState.loading = false; done(true); };
  script.onerror = function () { gsapState.loading = false; done(false); };
  document.head.appendChild(script);
}

function killPanelTweens(panel) {
  if (window.gsap && panel) { try { gsap.killTweensOf(panel); } catch { /* ignore */ } }
}

// فتح اللوحة بأنيميشن احترافي (GSAP) — أو CSS fallback لو المكتبة مش متاحة
function openPanel({ welcome = true } = {}) {
  var panel = $('ai-panel');
  var fab = $('ai-fab');
  if (!panel || !fab || state.open) return;
  state.open = true;
  fab.setAttribute('aria-expanded', 'true');

  killPanelTweens(panel);
  panel.classList.remove('css-close');
  panel.hidden = false;

  if (window.gsap) {
    gsap.set(panel, { visibility: 'visible' });
    gsap.fromTo(panel,
      { autoAlpha: 0, scale: 0.5, y: 36, transformOrigin: 'bottom left' },
      { autoAlpha: 1, scale: 1, y: 0, duration: 0.55, ease: 'back.out(1.7)' });
    gsap.fromTo(fab,
      { scale: 1, rotate: 0 },
      { scale: 1.22, rotate: 6, duration: 0.16, yoyo: true, repeat: 1, ease: 'power2.out' });
  } else {
    panel.classList.add('css-open');
    panel.addEventListener('animationend', function onEnd() {
      panel.classList.remove('css-open');
      panel.removeEventListener('animationend', onEnd);
    });
  }

  // ملاحظة متعمدة: مفيش focus تلقائي على الخانة — عشان الكيبورد ميفتحش لوحده على الموبايل
  if (welcome && state.messages.length === 0) {
    callAi({ action: 'welcome' })
      .then(function (data) { addMessage('assistant', data.reply); })
      .catch(function () { /* تجاهل — الطالب يقدر يسأل عادي */ });
  }
}

// إغلاق اللوحة بأنيميشن مرتب (GSAP) — أو CSS fallback
function closePanel() {
  var panel = $('ai-panel');
  var fab = $('ai-fab');
  if (!panel || !fab || !state.open) return;
  state.open = false;
  fab.setAttribute('aria-expanded', 'false');

  killPanelTweens(panel);

  if (window.gsap) {
    gsap.set(panel, { visibility: 'visible' });
    gsap.to(panel,
      {
        autoAlpha: 0, scale: 0.55, y: 34, transformOrigin: 'bottom left',
        duration: 0.32, ease: 'power3.in',
        onComplete: function () { panel.hidden = true; }
      });
  } else {
    panel.classList.add('css-close');
    panel.addEventListener('animationend', function onEnd() {
      panel.classList.remove('css-close');
      panel.removeEventListener('animationend', onEnd);
      panel.hidden = true;
    });
  }
}

function togglePanel() {
  if (state.open) closePanel();
  else openPanel({ welcome: true });
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

  $('ai-close').addEventListener('click', function () { closePanel(); });
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
    if (e.key === 'Escape' && state.open) closePanel();
  });

  renderMessages();
}

function init() {
  var path = (window.location.pathname || '').toLowerCase();
  if (/admin/i.test(path)) return;
  if (!getToken()) return;

  // تنظيف مفاتيح قديمة من نسخ سابقة كانت بتحفظ المحادثة محليًا أو بتفتح تلقائي
  try { localStorage.removeItem('ai_chat_history_v1'); } catch { /* ignore */ }
  try { sessionStorage.removeItem('ai_auto_open_done'); } catch { /* ignore */ }

  state.messages = []; // دائمًا شات نظيف في كل صفحة
  buildPanel();
  loadGsapAsync(function () { /* الـ GSAP بيتحمل في الخلفية — مش بنستنى */ });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
