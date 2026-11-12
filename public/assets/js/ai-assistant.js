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

// روبوت "الشباب" — الكريمي/الدهبي (الروبوت الأول) — مقسّم لمجموعات (أرجل/أذرع/رأس) للتحريك الاحترافي
var BOY_ROBOT_SVG =
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
    '<g class="ai-robot">' +
      '<rect x="16.5" y="36.5" width="6" height="5" rx="1.6" fill="url(#aig-metal)" stroke="#3f2f1c" stroke-width="1"/>' +
      '<rect x="25.5" y="36.5" width="6" height="5" rx="1.6" fill="url(#aig-metal)" stroke="#3f2f1c" stroke-width="1"/>' +
      '<g class="ai-arm-l"><rect x="6.2" y="22.5" width="5" height="9.5" rx="2.5" fill="url(#aig-metal)" stroke="#3f2f1c" stroke-width="1"/></g>' +
      '<g class="ai-arm-r"><rect x="36.8" y="22.5" width="5" height="9.5" rx="2.5" fill="url(#aig-metal)" stroke="#3f2f1c" stroke-width="1"/></g>' +
      '<rect x="12.5" y="20.5" width="23" height="17" rx="4.5" fill="url(#aig-body)" stroke="#4d3a22" stroke-width="1.2"/>' +
      '<circle cx="24" cy="29" r="4.6" fill="#2b211a" stroke="#4d3a22" stroke-width="1"/>' +
      '<circle class="ai-bot-core" cx="24" cy="29" r="2.6" fill="url(#aig-core)"/>' +
      '<line x1="24" y1="8" x2="24" y2="4.5" stroke="#6d5230" stroke-width="1.6" stroke-linecap="round"/>' +
      '<circle class="ai-bot-bulb" cx="24" cy="3.3" r="3.2" fill="url(#aig-glow)"/>' +
      '<circle class="ai-bot-bulb" cx="24" cy="3.3" r="1.9" fill="#fff0b8"/>' +
      '<g class="ai-head">' +
        '<rect x="11" y="8.5" width="26" height="13.5" rx="4.5" fill="url(#aig-head)" stroke="#4d3a22" stroke-width="1.2"/>' +
        '<circle cx="10" cy="15" r="2.4" fill="url(#aig-metal)" stroke="#3f2f1c" stroke-width="1"/>' +
        '<circle cx="38" cy="15" r="2.4" fill="url(#aig-metal)" stroke="#3f2f1c" stroke-width="1"/>' +
        '<rect x="14.5" y="11.3" width="19" height="7.8" rx="3.9" fill="#241c17" stroke="#4d3a22" stroke-width="1"/>' +
        '<g class="ai-pupils-move">' +
          '<g class="ai-bot-eyes">' +
            '<circle cx="20" cy="15.2" r="1.75" fill="#ffd56b"/>' +
            '<circle cx="28" cy="15.2" r="1.75" fill="#ffd56b"/>' +
            '<circle cx="20.6" cy="14.6" r="0.55" fill="#fffbe3"/>' +
            '<circle cx="28.6" cy="14.6" r="0.55" fill="#fffbe3"/>' +
          '</g>' +
        '</g>' +
        '<line x1="20.5" y1="17.9" x2="27.5" y2="17.9" stroke="#ffd56b" stroke-width="0.7" stroke-linecap="round" opacity="0.75"/>' +
      '</g>' +
    '</g>' +
  '</svg>';

// روبوت "البنات" — Kawaii بينك، عيون sparkle، فيونكة، خدود محمرة، فم قطي ω
var GIRL_ROBOT_SVG =
  '<svg viewBox="0 0 64 64" fill="none" aria-hidden="true" role="img">' +
    '<defs>' +
      '<linearGradient id="aig-body" x1="32" y1="11" x2="32" y2="57" gradientUnits="userSpaceOnUse">' +
        '<stop offset="0" stop-color="#ffd2e3"/><stop offset="0.45" stop-color="#f79ec2"/><stop offset="1" stop-color="#e0709b"/>' +
      '</linearGradient>' +
      '<linearGradient id="aig-head" x1="32" y1="9" x2="32" y2="34" gradientUnits="userSpaceOnUse">' +
        '<stop offset="0" stop-color="#ffd6e6"/><stop offset="0.5" stop-color="#f79ec2"/><stop offset="1" stop-color="#e4709d"/>' +
      '</linearGradient>' +
      '<linearGradient id="aig-limb" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#f8a9c8"/><stop offset="1" stop-color="#d6648f"/>' +
      '</linearGradient>' +
      '<linearGradient id="aig-arm" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#ffc7dd"/><stop offset="1" stop-color="#e0709d"/>' +
      '</linearGradient>' +
      '<radialGradient id="aig-heart" cx="0.5" cy="0.45" r="0.6">' +
        '<stop offset="0" stop-color="#ff9dbf"/><stop offset="0.55" stop-color="#f4528b"/><stop offset="1" stop-color="#c22a63"/>' +
      '</radialGradient>' +
      '<radialGradient id="aig-heartglow" cx="0.5" cy="0.5" r="0.5">' +
        '<stop offset="0" stop-color="#ffb3d1"/><stop offset="0.45" stop-color="#ff6fa8"/><stop offset="1" stop-color="#ff6fa8" stop-opacity="0"/>' +
      '</radialGradient>' +
      '<radialGradient id="aig-eye" cx="0.5" cy="0.42" r="0.55">' +
        '<stop offset="0" stop-color="#54314a"/><stop offset="1" stop-color="#2e1c2c"/>' +
      '</radialGradient>' +
      '<radialGradient id="aig-blush" cx="0.5" cy="0.5" r="0.5">' +
        '<stop offset="0" stop-color="#ff9fbc"/><stop offset="1" stop-color="#ff9fbc" stop-opacity="0"/>' +
      '</radialGradient>' +
    '</defs>' +
    '<g class="ai-robot">' +
      // القدمين الكارتيرية
      '<rect x="20" y="52" width="9" height="6.5" rx="3.2" fill="#d6648f" stroke="#a3496e" stroke-width="1.3"/>' +
      '<rect x="35" y="52" width="9" height="6.5" rx="3.2" fill="#d6648f" stroke="#a3496e" stroke-width="1.3"/>' +
      '<path d="M23.5 55.8 H26.5 M37.5 55.8 H40.5" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity="0.7"/>' +
      // الأذرع + إيدين دائريين
      '<g class="ai-arm-l"><rect x="10.5" y="33" width="6.5" height="12" rx="3.25" fill="url(#aig-arm)" stroke="#a3496e" stroke-width="1.3"/><circle cx="13.75" cy="46.5" r="3.9" fill="#ffd7e6" stroke="#a3496e" stroke-width="1.3"/></g>' +
      '<g class="ai-arm-r"><rect x="47" y="33" width="6.5" height="12" rx="3.25" fill="url(#aig-arm)" stroke="#a3496e" stroke-width="1.3"/><circle cx="50.25" cy="46.5" r="3.9" fill="#ffd7e6" stroke="#a3496e" stroke-width="1.3"/></g>' +
      // الجذع الكبير
      '<rect x="13" y="30" width="38" height="22" rx="11" fill="url(#aig-body)" stroke="#a3496e" stroke-width="1.5"/>' +
      '<path d="M18 35.5 Q32 29.5 46 35.5" fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" opacity="0.45"/>' +
      // بطن كريمي + قلب نابض
      '<ellipse cx="32" cy="43.5" rx="10.5" ry="7" fill="#fff4f9"/>' +
      '<path class="ai-bot-core" d="M32 47 C28.6 44.2 27 42.1 27 39.7 C27 37.8 28.5 36.6 30.2 36.6 C31.2 36.6 31.75 37.1 32 38 C32.25 37.1 32.8 36.6 33.8 36.6 C35.5 36.6 37 37.8 37 39.7 C37 42.1 35.4 44.2 32 47 Z" fill="url(#aig-heart)"/>' +
      // انتنا + لمبة قلب متوهجة
      '<line x1="32" y1="9.5" x2="32" y2="6" stroke="#a3496e" stroke-width="1.7" stroke-linecap="round"/>' +
      '<circle class="ai-bot-bulb" cx="32" cy="3.4" r="4.4" fill="url(#aig-heartglow)"/>' +
      '<path class="ai-bot-bulb" d="M32 5.2 C29.4 3.3 28.2 1.8 28.2 0.9 C28.2 0.4 30 0 32 1.6 C34 0 35.8 0.4 35.8 0.9 C35.8 1.8 34.6 3.3 32 5.2 Z" fill="#ff8fb8" stroke="#d6336c" stroke-width="0.9" stroke-linejoin="round"/>' +
      // الرأس الكبير
      '<g class="ai-head">' +
        '<rect x="9" y="9" width="46" height="24" rx="12" fill="url(#aig-head)" stroke="#a3496e" stroke-width="1.5"/>' +
        // الفيونكة على جنب الراس
        '<path d="M17.5 11.4 L11.6 7.2 L12.7 15.1 Z" fill="#d6336c" stroke="#a3496e" stroke-width="1.2" stroke-linejoin="round"/>' +
        '<path d="M21.6 11.8 L28.9 8.6 L26.7 15.9 Z" fill="#d6336c" stroke="#a3496e" stroke-width="1.2" stroke-linejoin="round"/>' +
        '<circle cx="19.7" cy="11.8" r="2" fill="#ff8fb8" stroke="#a3496e" stroke-width="1.1"/>' +
        '<circle cx="14.1" cy="10.7" r="0.55" fill="#ffd9e6" opacity="0.9"/>' +
        '<circle cx="25.3" cy="11" r="0.55" fill="#ffd9e6" opacity="0.9"/>' +
        // ودانتين جانبيتين
        '<circle cx="8.4" cy="21.5" r="3.2" fill="#f79ec2" stroke="#a3496e" stroke-width="1.3"/>' +
        '<circle cx="55.6" cy="21.5" r="3.2" fill="#f79ec2" stroke="#a3496e" stroke-width="1.3"/>' +
        '<circle cx="8.4" cy="21.5" r="1.15" fill="#fff4f9"/>' +
        '<circle cx="55.6" cy="21.5" r="1.15" fill="#fff4f9"/>' +
        // لوح الوجه الكريمي
        '<rect x="14.5" y="13.5" width="35" height="16.5" rx="9.2" fill="#fff4f9" stroke="#ecc0d3" stroke-width="1.2"/>' +
        // العيون الكبيرة + sparkles
        '<g class="ai-pupils-move">' +
          '<g class="ai-bot-eyes">' +
            '<ellipse cx="24" cy="21.6" rx="3.15" ry="3.7" fill="url(#aig-eye)"/>' +
            '<ellipse cx="40" cy="21.6" rx="3.15" ry="3.7" fill="url(#aig-eye)"/>' +
            '<circle cx="22.9" cy="20.2" r="1.15" fill="#ffffff"/>' +
            '<circle cx="25.3" cy="23.2" r="0.5" fill="#ffffff" opacity="0.9"/>' +
            '<circle cx="38.9" cy="20.2" r="1.15" fill="#ffffff"/>' +
            '<circle cx="41.3" cy="23.2" r="0.5" fill="#ffffff" opacity="0.9"/>' +
          '</g>' +
        '</g>' +
        // خدود محمرة
        '<ellipse cx="18.6" cy="25.8" rx="2.4" ry="1.3" fill="url(#aig-blush)"/>' +
        '<ellipse cx="45.4" cy="25.8" rx="2.4" ry="1.3" fill="url(#aig-blush)"/>' +
        // فم ω القطي
        '<path d="M29 25.35 Q30.85 27.9 32.65 25.35 Q34.5 27.9 36.35 25.35" fill="none" stroke="#c9427f" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</g>' +
    '</g>' +
  '</svg>';
var SEND_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
var CLOSE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

var state = { open: false, sending: false, messages: [], gender: null };

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
      { autoAlpha: 0, scale: 0.35, y: 34, transformOrigin: '32px bottom' },
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
        autoAlpha: 0, scale: 0.3, y: 34, transformOrigin: '32px bottom',
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

// معرفة الجنس تلقائيًا من بروفايل الطالب (الاسم الأول — مفيش أي خانة للاختيار)
function fetchGender() {
  return new Promise(function (resolve) {
    var timer = setTimeout(function () { resolve(null); }, 1500);
    function done(value) {
      clearTimeout(timer);
      resolve(value === 'male' || value === 'female' ? value : null);
    }
    try {
      var token = getToken();
      if (!token) { done(null); return; }
      var parts = String(token).split('.');
      if (parts.length !== 3) { done(null); return; }
      var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      var uid = payload && payload.sub;
      if (!uid) { done(null); return; }
      fetch(SUPABASE_URL + '/rest/v1/profiles?select=gender&id=eq.' + encodeURIComponent(uid), {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
      })
        .then(function (r) { return r.json(); })
        .then(function (rows) {
          var g = rows && rows[0] && rows[0].gender;
          done(g);
        })
        .catch(function () { done(null); });
    } catch (e) {
      done(null);
    }
  });
}

function assistantTheme() {
  return state.gender === 'female' ? 'female' : 'male';
}
function robotFor() {
  return assistantTheme() === 'female' ? GIRL_ROBOT_SVG : BOY_ROBOT_SVG;
}

function buildPanel() {
  if ($('ai-panel')) return;
  var robot = robotFor();
  var theme = assistantTheme();

  var fab = document.createElement('button');
  fab.id = 'ai-fab';
  fab.type = 'button';
  fab.className = 'ai-fab ai-gender-' + theme;
  fab.setAttribute('aria-label', 'المساعد الذكي');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = robot;
  fab.addEventListener('click', function () { togglePanel(); });
  document.body.appendChild(fab);

  var panel = document.createElement('section');
  panel.id = 'ai-panel';
  panel.className = 'ai-panel ai-gender-' + theme;
  panel.hidden = true; // تبدأ مخفية — لا تظهر إلا بالزر
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'المساعد الذكي — COMANDO');
  panel.innerHTML =
    '<div class="ai-panel-inner">' +
      '<div class="ai-header">' +
        '<div class="ai-header-icon">' + robot + '</div>' +
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
      '</form>' +
    '</div>';
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

var robotRigStarted = false;

// ريج الروبوت الاحترافي عبر GSAP — طفو + رأس يميل + أيدين بتتمايلان بالتناوب + عينين بتلقط
function rigRobot() {
  if (robotRigStarted) return;
  var fab = document.getElementById('ai-fab');
  if (!fab) return;
  robotRigStarted = true;
  var root = fab.querySelector('.ai-robot');
  var head = fab.querySelector('.ai-head');
  var pupils = fab.querySelector('.ai-pupils-move');
  var armL = fab.querySelector('.ai-arm-l');
  var armR = fab.querySelector('.ai-arm-r');

  if (!window.gsap || !root) {
    if (root) root.classList.add('css-bob');
    return;
  }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  var isFemale = assistantTheme() === 'female';
  var headOrigin = isFemale ? '32 30' : '24 16';
  var armLOrigin = isFemale ? '13.75 34.5' : '8.7 22.5';
  var armROrigin = isFemale ? '50.25 34.5' : '39.3 22.5';

  // طفو مستمر ناعم
  gsap.to(root, { y: -3.6, duration: 1.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  // إمالة رأس هادئة حول الرقبة
  if (head) gsap.to(head, { rotation: isFemale ? 2.4 : 2.6, duration: 2.3, yoyo: true, repeat: -1, ease: 'sine.inOut', svgOrigin: headOrigin });
  // أيدين بتتمايلان بالتناوب من الكتف
  if (armL) gsap.to(armL, { rotation: -8, duration: 1.7, yoyo: true, repeat: -1, ease: 'sine.inOut', svgOrigin: armLOrigin });
  if (armR) gsap.to(armR, { rotation: 8, duration: 1.7, yoyo: true, repeat: -1, ease: 'sine.inOut', svgOrigin: armROrigin });
  // العينين بتلقط يمين/شمال بتوقيت واعي
  if (pupils) {
    gsap.timeline({ repeat: -1, repeatDelay: 1.15, defaults: { ease: 'sine.inOut' } })
      .to(pupils, { x: 1.7, duration: 0.4 })
      .to(pupils, { x: 0, duration: 0.3 }, '+=0.75')
      .to(pupils, { x: -1.7, duration: 0.4 })
      .to(pupils, { x: 0, duration: 0.3 }, '+=0.75');
  }
  // تلميح عند الـ hover (نبضة تكبير خفيفة)
  fab.addEventListener('mouseenter', function () {
    gsap.fromTo(fab, { scale: 1 }, { scale: 1.14, duration: 0.17, yoyo: true, repeat: 1, ease: 'power2.out' });
  });
}

function init() {
  var path = (window.location.pathname || '').toLowerCase();
  if (/admin/i.test(path)) return;
  if (!getToken()) return;

  // تنظيف مفاتيح قديمة من نسخ سابقة كانت بتحفظ المحادثة محليًا أو بتفتح تلقائي
  try { localStorage.removeItem('ai_chat_history_v1'); } catch { /* ignore */ }
  try { sessionStorage.removeItem('ai_auto_open_done'); } catch { /* ignore */ }

  state.messages = []; // دائمًا شات نظيف في كل صفحة
  // تعرف على الجنس تلقائيًا من البروفايل (مفيش خانة اختيار — كل حاجة ذكية)
  fetchGender().then(function (gender) {
    state.gender = gender;
    var skipPage = /login|register|signup|sign-up/.test((window.location.pathname || '').toLowerCase());
    try {
      if (gender === 'female') {
        localStorage.setItem('comando-palette', 'girl');
        if (skipPage) {
          document.documentElement.removeAttribute('data-palette');
        } else {
          document.documentElement.setAttribute('data-palette', 'girl');
        }
      } else {
        localStorage.removeItem('comando-palette');
        document.documentElement.removeAttribute('data-palette');
      }
    } catch { /* private mode */ }
    buildPanel();
    // لو GSAP محمّلة بالفعل (من صفحة سابقة) — شغّل الريج فورًا، وإلا لما توصل
    if (window.gsap) { rigRobot(); } else { loadGsapAsync(function () { rigRobot(); }); }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
