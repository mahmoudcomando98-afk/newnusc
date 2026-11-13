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
  renderedIds: new Set()
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
    try {
      state.sending = true;
      btn.disabled = true;
      await callChat({ action: 'send', text: q });
      await poll(); // طبّق فورًا بدل ما ننتظر البول
    } catch (err) {
      input.value = q;
      alert(String(err?.message || err || 'تعذر الإرسال — حاول تاني'));
    } finally {
      state.sending = false;
      btn.disabled = false;
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
    const list = Array.isArray(data?.messages) ? data.messages : [];
    state.messages = list;
    renderMessages();
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
  return list.map((m) => String(m.id || '') + '|' + (m.is_me ? '1' : '0') + '|' + String(m.text || '')).join('§');
}

function renderMessages() {
  const body = $('chat-messages');
  if (!body) return;
  const fp = fingerprint(state.messages);
  if (fp === state.renderedFingerprint) return; // مفيش جديد — مفيش يومض
  state.renderedFingerprint = fp;

  if (!state.messages.length) {
    body.innerHTML =
      '<div style="text-align:center;padding:60px 20px;color:var(--text-muted,#777)">' +
        '<p style="font-size:1.1rem;font-weight:800;color:var(--text,#25232e);margin-bottom:8px">مافيش رسائل تاني…</p>' +
        '<p>اكتب سؤالك هيلاقي حد جواب. 🤝</p>' +
      '</div>';
    state.renderedIds = new Set();
    return;
  }

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

    const article = document.createElement('article');
    article.className = 'chat-msg ' + (mine ? 'me' : 'them');
    article.dataset.id = String(m.id);
    article.innerHTML =
      (mine
        ? ''
        : '<div class="chat-avatar" style="' + bg + '" aria-hidden="true">' + initial + '</div>'
      ) +
      '<div class="chat-bubble">' +
        '<div class="chat-meta">' +
          (mine ? '' : '<span class="chat-author">' + author + '</span>') +
          '<time>' + escapeHtml(time) + '</time>' +
        '</div>' +
        '<div class="chat-text">' + text + '</div>' +
      '</div>';

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

function markAllSeen() {
  localStorage.setItem(KEY_UNREAD, '0');
  window.dispatchEvent(new CustomEvent('comando:chat-unread', { detail: 0 }));
}

init().catch((err) => {
  console.error('[chat] init error:', err);
  document.documentElement.classList.remove('admin-auth-pending');
});
