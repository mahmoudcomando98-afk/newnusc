/**
 * COMANDO — دردشة الدفعة (الإرسال/التحميل + تمرير + شريط المقروء)
 */
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml } from './utils.js';

const $ = (id) => document.getElementById(id);
const SUPABASE_FUNCTIONS_PATH = '/functions/v1/chat';

// تثبيت ارتفاع الصفحة على ارتفاع الـ visual viewport — عشان الكيبورد مايرفعش الشات لفوق
(function initViewportFix() {
  const vv = window.visualViewport;
  const apply = () => {
    if (!vv) return;
    const h = Math.round(vv.height) + 'px';
    document.documentElement.style.setProperty('--vvh', h);
    // لو iOS حاول يزحزح الصفحة مع فتح الكيبورد — رجعها مكانها
    if (window.scrollY > 0) window.scrollTo(0, 0);
  };
  if (vv) {
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    apply();
  }
  window.addEventListener('orientationchange', () => window.setTimeout(apply, 120));
})();

const state = {
  messages: [],
  sending: false,
  pollHandle: 0,
  renderedFingerprint: null,
  renderedIds: new Set(),
  isAdmin: false,
  replyTo: null, /* {id, author, text} */
  renderedIsAdmin: undefined,
  ban: null,     /* { untilMs } */
  banTimer: 0,
  menuMsg: null,
  toastTimer: 0
};

const KEY_LAST_SEEN = 'comando_chat_last_seen';
const KEY_UNREAD = 'comando_chat_unread';
const KEY_CONV = 'comando_chat_conv';

function getToken() {
  try {
    const raw = localStorage.getItem('nusc-auth-token');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.access_token || null;
  } catch { return null; }
}

function colorFor(id /*string\*/) {
  var sum = 0;
  for (var i = 0; i < String(id || '').length; i++) sum += String(id).charCodeAt(i);
  var hue = sum % 360;
  return 'hsl(' + hue + ' 68% 54%)';
}

async function callChat(body) {
  const token = getToken();
  if (!token) throw new Error('انتهت الجلسة.');
  const res = await fetch(SUPABASE_URL + SUPABASE_FUNCTIONS_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const err = new Error(data?.error || ('HTTP ' + res.status));
    err.banned = data?.banned === true;
    err.bannedUntil = data?.banned_until || null;
    err.seconds = data?.seconds || 0;
    err.struck = data?.struck === true;
    throw err;
  }
  return data;
}

async function init() {
  const ok = await protectPage();
  if (!ok) return;
  document.documentElement.classList.remove('admin-auth-pending');

  // اطلب عرض آخر 30 رسالة
  await poll();

  const form = $('chat-form');
  const input = $('chat-input');
  const btn = $('chat-send');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q || state.sending) return;
    input.value = '';
    input.focus();
    const replyTo = state.replyTo ? state.replyTo.id : undefined;
    clearReply();
    try {
      state.sending = true;
      btn.disabled = true;
      await callChat({ action: 'send', text: q, reply_to_id: replyTo });
      await poll(); // طبّق فورًا بدل ما ننتظر البول
    } catch (err) {
      if (err?.banned) {
        input.value = '';
        state.ban = { untilMs: err.bannedUntil ? Date.parse(err.bannedUntil) : Date.now() + (Number(err.seconds) || 3600) * 1000 };
        syncBanUI();
      } else {
        input.value = q;
        showToast(String(err?.message || err || 'تعذر الإرسال — حاول تاني'));
      }
    } finally {
      state.sending = false;
      btn.disabled = false;
    }
  });

  // حالة الاختفاء التلقائي للحالة الفارغة أول ما الشخص يبدأ يكتب
  input.addEventListener('input', () => {
    const body = $('chat-messages');
    const empty = body?.querySelector('.chat-empty');
    if (!empty) return;
    empty.classList.toggle('chat-empty--hidden', !!input.value.trim());
  });

  // إلغاء الرد من بار الرد أو بزر Escape
  $('chat-reply-cancel')?.addEventListener('click', clearReply);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearReply(); });

  // زرار مسح الرسالة للأدمن (delegation)
  const msgsBody = $('chat-messages');
  msgsBody?.addEventListener('click', async (e) => {
    const btnDel = e.target.closest?.('[data-del]');
    if (!btnDel) return;
    const id = btnDel.getAttribute('data-del');
    if (!id) return;
    if (!window.confirm('تمسح الرسالة دي؟')) return;
    try {
      await callChat({ action: 'delete', id });
      await poll();
    } catch (err) {
      alert(String(err?.message || err || 'تعذر مسح الرسالة'));
    }
  });

  // اسحب الرسالة يمين/شمال للرد عليها (delegation)
  let swipe = null;
  msgsBody?.addEventListener('pointerdown', (e) => {
    if (e.target.closest?.('[data-del]')) return;
    const row = e.target.closest?.('.chat-msg');
    if (!row) return;
    swipe = { row, startX: e.clientX, startY: e.clientY, dx: 0, active: false };
    try { row.setPointerCapture(e.pointerId); } catch {}
    row.classList.remove('swipe-anim');
  });
  msgsBody?.addEventListener('pointermove', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.startX;
    const dy = e.clientY - swipe.startY;
    if (!swipe.active) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) swipe.active = true;
      else if (Math.abs(dy) > 12) { swipe = null; return; }
      else return;
    }
    swipe.dx = dx;
    const clamped = Math.max(-72, Math.min(72, dx * 0.85));
    swipe.row.style.transform = 'translateX(' + clamped + 'px)';
    const arrow = swipe.row.querySelector('.chat-swipe-arrow');
    if (arrow) {
      const progress = Math.min(1, Math.abs(dx) / 56);
      arrow.style.opacity = String(progress);
      if (dx > 0) { arrow.style.insetInlineStart = '10px'; arrow.style.insetInlineEnd = 'auto'; }
      else { arrow.style.insetInlineEnd = '10px'; arrow.style.insetInlineStart = 'auto'; }
      arrow.style.transform = 'translateY(-50%) scale(' + (0.6 + progress * 0.5) + ')';
    }
  });
  const endSwipe = () => {
    if (!swipe) return;
    const row = swipe.row;
    const dx = swipe.dx;
    const wasActive = swipe.active;
    row.classList.add('swipe-anim');
    row.style.transform = '';
    const arrow = row.querySelector('.chat-swipe-arrow');
    if (arrow) { arrow.style.opacity = '0'; arrow.style.transform = 'translateY(-50%)'; }
    const fire = wasActive && Math.abs(dx) >= 44;
    const msg = wasActive ? state.messages.find((m) => String(m.id) === row.dataset.id) : null;
    swipe = null;
    if (fire && msg) setReply(msg);
  };
  msgsBody?.addEventListener('pointerup', endSwipe);
  msgsBody?.addEventListener('pointercancel', endSwipe);

  // ═══ الضغطة الطويلة → قائمة الرسالة (رد / تعديل / حذف) ═══
  let lp = null;
  const cancelLp = () => { if (lp) { window.clearTimeout(lp.timer); lp = null; } };
  msgsBody?.addEventListener('pointerdown', (e) => {
    if (e.target.closest?.('[data-del], button, input, a, .chat-menu')) { cancelLp(); return; }
    const row = e.target.closest?.('.chat-msg');
    if (!row) { cancelLp(); return; }
    const x = e.clientX, y = e.clientY;
    cancelLp();
    lp = { row, x, y, timer: window.setTimeout(() => {
      if (navigator.vibrate) { try { navigator.vibrate(25); } catch {} }
      openChatMenu(row, x, y);
      lp = null;
    }, 470) };
  });
  msgsBody?.addEventListener('pointermove', (e) => {
    if (!lp) return;
    if (Math.abs(e.clientX - lp.x) > 10 || Math.abs(e.clientY - lp.y) > 10) cancelLp();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => msgsBody?.addEventListener(ev, cancelLp));
  msgsBody?.addEventListener('scroll', cancelLp, { passive: true });
  msgsBody?.addEventListener('contextmenu', (e) => {
    if (e.target.closest?.('[data-del], button, input, a')) return;
    const row = e.target.closest?.('.chat-msg');
    if (!row) return;
    e.preventDefault();
    openChatMenu(row, e.clientX, e.clientY);
  });

  // قائمة الرسالة
  const menu = $('chat-menu');
  menu?.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-menu]');
    if (!btn) { closeChatMenu(); return; }
    const action = btn.getAttribute('data-menu');
    const msg = state.menuMsg;
    closeChatMenu();
    if (!msg) return;
    if (action === 'reply') { setReply(msg); return; }
    if (action === 'edit') {
      if (!msg.is_me) return;
      const row = msgsBody?.querySelector('.chat-msg[data-id="' + msg.id + '"]');
      if (row) startInlineEdit(row, msg);
      return;
    }
    if (action === 'delete') openDeleteModal(msg);
  });
  document.addEventListener('pointerdown', (e) => {
    if (menu && !menu.hidden && !e.target.closest?.('#chat-menu')) closeChatMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeChatMenu(); closeDeleteModal(); } });

  // شيت الحذف
  const delModal = $('chat-delete-modal');
  delModal?.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-del-cancel')) closeDeleteModal();
  });
  $('del-for-me')?.addEventListener('click', async () => {
    const msg = state.menuMsg;
    closeDeleteModal();
    if (!msg) return;
    try {
      await callChat({ action: 'hide', id: msg.id });
      await poll();
      showToast('الرسالة اتشالت عندك بس.');
    } catch (err) {
      showToast(String(err?.message || err || 'تعذر الحذف'));
    }
  });
  $('del-for-everyone')?.addEventListener('click', async () => {
    const msg = state.menuMsg;
    closeDeleteModal();
    if (!msg) return;
    try {
      await callChat({ action: 'delete', id: msg.id });
      await poll();
    } catch (err) {
      showToast(String(err?.message || err || 'تعذر الحذف'));
    }
  });

  // استعلام كل 4 ثواني أثناء فتح الشات + تراجع لو الوثيقة مهملة
  const tick = () => {
    if (document.hidden) {
      state.pollHandle = window.setTimeout(tick, 4000);
      return;
    }
    poll();
    state.pollHandle = window.setTimeout(tick, 4000);
  };
  tick();

  // علامة unseen تُمحى عند فتح الشات
  markAllSeen();
}

async function poll() {
  try {
    const data = await callChat({ action: 'list' });
    state.isAdmin = !!data?.is_admin;
    if (data?.ban && data.ban.banned_until) {
      state.ban = { untilMs: Date.parse(String(data.ban.banned_until)) || 0 };
    } else {
      state.ban = null;
    }
    syncBanUI();
    const list = Array.isArray(data?.messages) ? data.messages : [];
    state.messages = list;
    renderMessages();
    // عدد الأعضاء الفعّالين
    const countEl = $('chat-count');
    if (countEl) {
      const n = data?.members_count;
      if (typeof n === 'number') countEl.textContent = String(n);
    }
    // علامة "شفتهم كلهم"
    const lastCreated = list[list.length - 1]?.created_at;
    if (lastCreated) {
      localStorage.setItem(KEY_LAST_SEEN, new Date(String(lastCreated)).toISOString());
    }
    localStorage.setItem(KEY_UNREAD, '0');
  } catch (err) {
    console.warn('[chat] list failed:', err);
    // لو فشل التحميل بسبب الجلسة أو شبكة — نتجاهل ببس عشان ما يزعجش
  }
}

function msgFingerprint(m) {
  return String(m.id || '') + '|' + (m.is_me ? '1' : '0') + '|' + String(m.text || '') +
    '|e:' + (m.edited ? '1' : '') +
    '|b:' + (m.is_bot ? '1' : '') +
    (state.isAdmin ? '|A' : '') +
    (m.reply_to_id ? (m.reply ? 'r:' + m.reply.author + ':' + m.reply.text : 'r:missing') : '');
}

function fingerprint(list) {
  return list.map(msgFingerprint).join('§');
}

function buildMessageNode(m) {
  const mine = !!m.is_me;
  const initial = escapeHtml(String(m.initial || '?').slice(0, 1)).toUpperCase();
  const author = escapeHtml(String(m.author || 'طالب'));
  const text = escapeHtml(String(m.text || ''));
  const time = new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' })
    .format(new Date(String(m.created_at)));
  const bg = mine ? '' : 'background:' + colorFor(String(m.user_id || '')) + ';';

  let quote = '';
  if (m.reply_to_id) {
    if (m.reply) {
      quote =
        '<div class="chat-quote">' +
          '<span class="chat-quote-author">' + escapeHtml(String(m.reply.author || 'طالب')) + '</span>' +
          '<span class="chat-quote-text">' + escapeHtml(String(m.reply.text || '')) + '</span>' +
        '</div>';
    } else {
      quote =
        '<div class="chat-quote chat-quote--missing">' +
          '<span class="chat-quote-text">الرسالة الأصلية اتمسحت</span>' +
        '</div>';
    }
  }

  const delBtn = state.isAdmin
    ? '<button type="button" class="chat-del" data-del="' + escapeHtml(m.id) + '" aria-label="مسح الرسالة">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
      '</button>'
    : '';

  const isBot = !!m.is_bot;
  const editedMark = m.edited ? '<span class="chat-edited">متعدلة</span>' : '';

  const article = document.createElement('article');
  article.className = 'chat-msg ' + (mine ? 'me' : 'them') + (isBot ? ' bot' : '');
  article.dataset.id = String(m.id);
  article.dataset.fp = msgFingerprint(m);
  article.innerHTML =
    '<span class="chat-swipe-arrow" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>' +
    '</span>' +
    (mine
      ? ''
      : isBot
        ? '<div class="chat-avatar chat-avatar-bot" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="8.5" width="15" height="10.5" rx="3"/><path d="M12 8.5V5.5"/><circle cx="12" cy="3.5" r="1.4"/><path d="M9.4 13.6h.01M14.6 13.6h.01"/><path d="M9.5 19v2.4M14.5 19v2.4"/></svg></div>'
        : '<div class="chat-avatar" style="' + bg + '" aria-hidden="true">' + initial + '</div>'
    ) +
    '<div class="chat-bubble">' +
      quote +
      '<div class="chat-meta">' +
        (mine ? '' : isBot
          ? '<span class="chat-bot-chip">بوت COMANDO</span>'
          : '<span class="chat-author">' + author + '</span>') +
        '<time>' + escapeHtml(time) + '</time>' +
        editedMark +
      '</div>' +
      '<div class="chat-text">' + text + '</div>' +
    '</div>' +
    delBtn;
  return article;
}

function renderMessages() {
  const body = $('chat-messages');
  if (!body) return;
  const fp = fingerprint(state.messages);

  if (fp === state.renderedFingerprint) return; // مفيش جديد — مفيش يومض
  state.renderedFingerprint = fp;

  if (!state.messages.length) {
    body.innerHTML =
      '<div class="chat-empty">' +
        '<div class="chat-empty-stage">' +
          '<div class="chat-empty-ring"></div>' +
          '<div class="chat-empty-ring-2"></div>' +
          '<div class="chat-empty-orb" aria-hidden="true">' +
            '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
          '</div>' +
        '</div>' +
      '</div>';
    state.renderedIds = new Set();
    return;
  }

  // امسح أي سكيليتونات/حالة فارغة لسه مترميين في الـ DOM
  body.querySelectorAll('.chat-skeleton, .chat-empty').forEach((n) => n.remove());

  const byId = {};
  for (const m of state.messages) byId[String(m.id)] = m;

  // امسح المحذوف — واستبدل اللي اتغيرت (تعديل/دور الأدمن/حل الاقتباس)
  body.querySelectorAll('.chat-msg[data-id]').forEach((node) => {
    const id = node.dataset.id;
    const m = byId[id];
    if (!m) {
      node.remove();
      return;
    }
    if (node.dataset.fp !== msgFingerprint(m)) {
      if (node.querySelector('.chat-edit-input')) return; // لسه بيعدل — ما نلمسش الرسالة
      node.replaceWith(buildMessageNode(m));
    }
  });

  // أضف الجديد في مكان مناسب باختصار
  const existing = new Set();
  body.querySelectorAll('.chat-msg[data-id]').forEach((n) => existing.add(n.dataset.id));
  let appended = 0;

  for (const m of state.messages) {
    if (existing.has(String(m.id))) continue;
    body.appendChild(buildMessageNode(m));
    appended += 1;
  }

  // If messages were inserted in the middle (unlikely), re-order by data-id
  if (appended === 0 && body.children.length > 1) {
    const map = {};
    for (const m of state.messages) map[m.id] = m;
    const nodes = Array.from(body.querySelectorAll('.chat-msg[data-id]'));
    nodes.sort((a, b) => {
      const ta = new Date(String(map[a.dataset.id].created_at)).getTime();
      const tb = new Date(String(map[b.dataset.id].created_at)).getTime();
      return ta - tb;
    });
    for (const n of nodes) body.appendChild(n);
  }

  // Scroll للأسفل لو فيه جديد
  if (appended > 0) body.scrollTop = body.scrollHeight;
}

function syncBanUI() {
  const form = $('chat-form');
  const banBox = $('chat-ban');
  const replyBar = $('chat-reply-bar');
  if (!form || !banBox) return;
  if (state.ban && state.ban.untilMs > Date.now()) {
    form.classList.add('chat-hidden');
    if (replyBar) replyBar.classList.add('chat-hidden');
    banBox.hidden = false;
    renderBanCountdown();
    if (!state.banTimer) {
      state.banTimer = window.setInterval(renderBanCountdown, 1000);
    }
  } else {
    form.classList.remove('chat-hidden');
    if (replyBar) replyBar.classList.remove('chat-hidden');
    banBox.hidden = true;
    if (state.banTimer) { window.clearInterval(state.banTimer); state.banTimer = 0; }
  }
}

function renderBanCountdown() {
  if (!state.ban) return;
  const secs = Math.max(0, Math.floor((state.ban.untilMs - Date.now()) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  const el = $('ban-countdown');
  if (el) el.textContent = mm + ':' + ss;
  if (secs <= 0) {
    state.ban = null;
    if (state.banTimer) { window.clearInterval(state.banTimer); state.banTimer = 0; }
    syncBanUI();
    poll();
  }
}

function showToast(text) {
  const t = $('chat-toast');
  if (!t) return;
  t.textContent = String(text);
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('chat-toast-show'));
  clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    t.classList.remove('chat-toast-show');
    t.hidden = true;
  }, 4200);
}

function openChatMenu(row, x, y) {
  const menu = $('chat-menu');
  if (!menu) return;
  const msg = state.messages.find((m) => String(m.id) === row?.dataset.id);
  if (!msg) return;
  state.menuMsg = msg;
  const editBtn = menu.querySelector('[data-menu="edit"]');
  if (editBtn) editBtn.style.display = msg.is_me ? '' : 'none';
  menu.hidden = false;
  const mw = 170, mh = msg.is_me ? 150 : 105;
  const left = Math.min(Math.max(8, x), window.innerWidth - mw - 8);
  const top = Math.min(Math.max(8, y), window.innerHeight - mh - 8);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

function closeChatMenu() {
  const menu = $('chat-menu');
  if (menu) menu.hidden = true;
}

function openDeleteModal(msg) {
  state.menuMsg = msg;
  const delEveryone = $('del-for-everyone');
  if (delEveryone) delEveryone.style.display = (msg.is_me || state.isAdmin) ? '' : 'none';
  const modal = $('chat-delete-modal');
  if (modal) modal.hidden = false;
}

function closeDeleteModal() {
  const modal = $('chat-delete-modal');
  if (modal) modal.hidden = true;
}

function startInlineEdit(row, msg) {
  const textEl = row.querySelector('.chat-text');
  if (!textEl) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'chat-edit-wrap';
  wrapper.innerHTML =
    '<input class="chat-edit-input" maxlength="600" aria-label="تعديل الرسالة" />' +
    '<div class="chat-edit-actions">' +
      '<button type="button" class="chat-edit-ok" aria-label="حفظ"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 10"/></svg></button>' +
      '<button type="button" class="chat-edit-cancel" aria-label="إلغاء"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
    '</div>';
  textEl.replaceWith(wrapper);
  const input = wrapper.querySelector('.chat-edit-input');
  input.value = msg.text;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    if (save) {
      const v = input.value.trim();
      if (v && v !== msg.text) {
        try {
          await callChat({ action: 'edit', id: msg.id, text: v });
        } catch (err) {
          showToast(String(err?.message || err || 'تعذر الحفظ'));
        }
      }
    }
    await poll();
  };
  wrapper.querySelector('.chat-edit-ok').addEventListener('click', () => finish(true));
  wrapper.querySelector('.chat-edit-cancel').addEventListener('click', () => finish(false));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') finish(false);
  });
}

function setReply(m) {
  state.replyTo = { id: m.id, author: String(m.author || 'طالب'), text: String(m.text || '') };
  const bar = $('chat-reply-bar');
  const authorEl = $('chat-reply-author');
  const textEl = $('chat-reply-text');
  if (authorEl) authorEl.textContent = 'رد على: ' + state.replyTo.author;
  if (textEl) textEl.textContent = state.replyTo.text;
  if (bar) bar.hidden = false;
  $('chat-input')?.focus();
}

function clearReply() {
  state.replyTo = null;
  const bar = $('chat-reply-bar');
  if (bar) bar.hidden = true;
}

function markAllSeen() {
  localStorage.setItem(KEY_UNREAD, '0');
  window.dispatchEvent(new CustomEvent('comando:chat-unread', { detail: 0 }));
}

init().catch((err) => {
  console.error('[chat] init error:', err);
  document.documentElement.classList.remove('admin-auth-pending');
});
