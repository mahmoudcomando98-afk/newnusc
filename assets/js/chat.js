/**
 * COMANDO — دردشة الدفعة (الإرسال/التحميل + تمرير + شريط المقروء)
 */
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml } from './utils.js';

const $ = (id) => document.getElementById(id);
const SUPABASE_FUNCTIONS_PATH = '/functions/v1/chat';

const state = {
  messages: [],
  sending: false,
  pollHandle: 0,
  renderedFingerprint: '',
  renderedIds: new Set(),
  isAdmin: false,
  replyTo: null, /* {id, author, text} */
  renderedIsAdmin: undefined
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
    throw new Error(data?.error || ('HTTP ' + res.status));
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
      input.value = q;
      alert(String(err?.message || err || 'تعذر الإرسال — حاول تاني'));
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

function fingerprint(list) {
  return list.map((m) =>
    String(m.id || '') + '|' + (m.is_me ? '1' : '0') + '|' + String(m.text || '') + '|' +
    (m.reply_to_id ? (m.reply ? 'r:' + m.reply.author + ':' + m.reply.text : 'r:missing') : '')
  ).join('§');
}

function renderMessages() {
  const body = $('chat-messages');
  if (!body) return;
  const fp = fingerprint(state.messages);
  if (fp === state.renderedFingerprint) return; // مفيش جديد — مفيش يومض
  state.renderedFingerprint = fp;

  // دور الأدمن اتغير؟ نعيد بناء الرسايل عشان زرار المسح يظهر/يتشال صح
  if (state.renderedIsAdmin !== state.isAdmin) {
    body.innerHTML = '';
    state.renderedIds = new Set();
    state.renderedIsAdmin = state.isAdmin;
  }

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

  const target = new Set(state.messages.map((m) => m.id));

  // شيل الرسائل اللي اتمسحت من الـ DB
  body.querySelectorAll('.chat-msg[data-id]').forEach((node) => {
    if (!target.has(node.dataset.id)) {
      node.remove();
      state.renderedIds.delete(node.dataset.id);
    }
  });

  // أضف الجديد في مكان مناسب باختصار
  const existing = new Set();
  body.querySelectorAll('.chat-msg[data-id]').forEach((n) => existing.add(n.dataset.id));
  let appended = 0;

  for (const m of state.messages) {
    if (existing.has(m.id)) continue;
    const mine = !!m.is_me;
    const initial = escapeHtml(String(m.initial || '?').slice(0, 1)).toUpperCase();
    const author = escapeHtml(String(m.author || 'طالب'));
    const text = escapeHtml(String(m.text || ''));
    const time = new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' })
      .format(new Date(String(m.created_at)));
    const bg = mine ? '' : 'background:' + colorFor(String(m.user_id || '')) + ';';

    // بلوك الردول (لو الرسالة رد على رسالة تانية)
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

    const article = document.createElement('article');
    article.className = 'chat-msg ' + (mine ? 'me' : 'them');
    article.dataset.id = String(m.id);
    article.innerHTML =
      '<span class="chat-swipe-arrow" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>' +
      '</span>' +
      (mine
        ? ''
        : '<div class="chat-avatar" style="' + bg + '" aria-hidden="true">' + initial + '</div>'
      ) +
      '<div class="chat-bubble">' +
        quote +
        '<div class="chat-meta">' +
          (mine ? '' : '<span class="chat-author">' + author + '</span>') +
          '<time>' + escapeHtml(time) + '</time>' +
        '</div>' +
        '<div class="chat-text">' + text + '</div>' +
      '</div>' +
      delBtn;

    body.appendChild(article);
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
