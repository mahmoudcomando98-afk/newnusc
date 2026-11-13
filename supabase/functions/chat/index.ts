// دردشة الدفعة — رسائل مشفرة AES-256-GCM + ردود + مسح الأدمن + بوت ذكي + تعديل/حذف + حظر الشتايم
// Deploy: npx supabase functions deploy chat --project-ref bmqqacvgtevogcuqfryq
// Secret: supabase secrets set --project-ref ... CHAT_KEY=<64 hex chars>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

function toByteaHex(arr: Uint8Array): string {
  return '\\x' + [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseBytea(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v)) return new Uint8Array(v);
  const s = String(v ?? '').trim();
  if (!s) return new Uint8Array(0);
  if (s.startsWith('\\x') || s.startsWith('x') || s.startsWith('\\X')) {
    const hex = s.replace(/^\\x/i, '');
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return out;
  }
  return new TextEncoder().encode(s);
}

async function getKey(): Promise<CryptoKey> {
  const hex = (Deno.env.get('CHAT_KEY') || '').trim();
  if (!hex || hex.length !== 64) throw new Error('CHAT_KEY غير صالح.');
  return await crypto.subtle.importKey('raw', hexToBytes(hex), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encrypt(text: string, key: CryptoKey): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { iv, ciphertext: new Uint8Array(ct) };
}

async function decrypt(ct: Uint8Array, iv: Uint8Array, key: CryptoKey): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

function nameOf(p: { full_name?: string | null; email?: string | null } | undefined) {
  const raw = String(p?.full_name || p?.email || 'طالب').trim();
  const name = raw ? raw.split(/\s+/)[0] : 'طالب';
  return { name, initial: (name.charAt(0) || 'ط').toUpperCase() };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BOT_ID = '00000000-0000-4000-8000-00000000000b';
const BAN_DURATION_MS = 60 * 60 * 1000; // ساعة

const AR_DIGITS: Record<string, string> = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };

function normalizeAr(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => AR_DIGITS[d] || d);
}

const BAD_WORDS = [
  'كس', 'طيز', 'عرص', 'عاهر', 'عاهره', 'شرموطه', 'قحبه', 'متناك', 'متناكه', 'متنيك',
  'زبر', 'زباله', 'سافل', 'سافله', 'خول', 'فاجر', 'فاجره', 'منيوك', 'منيوكه', 'تانك',
  'يلعن', 'يابن الشرموطه', 'يابن الوسخ', 'وسق', 'حمار', 'ساقط', 'وسخ', 'وسخه',
  'fuck', 'shit', 'bitch', 'asshole', 'slut', 'whore', 'dick', 'motherfucker', 'bastard'
];

function findBadWord(norm: string): string | null {
  for (const w of BAD_WORDS) {
    if (norm.includes(w)) return w;
  }
  return null;
}

function cairoParts(d: Date) {
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'Africa/Cairo' };
  const dateStr = new Intl.DateTimeFormat('en-CA', { ...opts, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const weekday = new Intl.DateTimeFormat('en-US', { ...opts, weekday: 'short' }).format(d);
  const dayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
  const time = new Intl.DateTimeFormat('ar-EG', { ...opts, hour: '2-digit', minute: '2-digit' }).format(d);
  const dateHuman = new Intl.DateTimeFormat('ar-EG', { ...opts, weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return { dateStr, dayIdx, time, dateHuman };
}

function fmtDateTime(d: Date): string {
  return new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(d);
}

// ── بوت الشات: بيرد بس لو عارف حقيقي، لو مش عارف يسكت خالص ─────────────────────
async function botAnswer(raw: string, admin: ReturnType<typeof createClient>, askerId: string): Promise<string | null> {
  const norm = normalizeAr(raw);
  const stripped = norm.replace(/[\s؟!?\.,،؛…\-]+$/g, '').trim();

  // سلام
  if (/^(ازيك|ازي حالك|كيف حالك|عامل ايه|ايه اخبارك|اخبارك|هاي|اهلا|صباح الخير|مساء الخير)/.test(stripped)) {
    return 'الحمدلله ربنا كويس، انت اخبارك النهاردة؟';
  }
  // مين انت
  if (/(مين انت|انت مين|مين البوت|ايه ده البوت|انت روبوت)/.test(stripped)) {
    return 'أنا بوت COMANDO — اسألني عن الواجبات والجدول والامتحانات والإعلانات، ولو مش عارف سؤالك هسكت خالص';
  }
  // شكرا
  if (/^(شكرا|مرسي|تسلم|متشكر)/.test(stripped)) {
    return 'على الرحب، لو محتاج حاجة تانية قول';
  }

  const now = new Date();
  const today = cairoParts(now);
  const tomorrowDate = new Date(now.getTime() + 24 * 3600 * 1000);
  const tomorrow = cairoParts(tomorrowDate);

  // الواجبات
  if (/(واجب|واجبات|assignment|هومورك|homework|تكليف)/.test(norm)) {
    const { data } = await admin
      .from('materials')
      .select('title, due_at, subject_id, subjects(name)')
      .eq('material_type', 'assignment')
      .eq('is_published', true)
      .not('due_at', 'is', null)
      .gte('due_at', new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString())
      .order('due_at', { ascending: true })
      .limit(20);
    const rows = (data || []).map((m: any) => ({ title: m.title, due: new Date(m.due_at), subject: m.subjects?.name || '' }));
    const dueToday = rows.filter((r: any) => cairoParts(r.due).dateStr === today.dateStr);
    const dueTomorrow = rows.filter((r: any) => cairoParts(r.due).dateStr === tomorrow.dateStr);
    const upcoming = rows.filter((r: any) => r.due.getTime() >= now.getTime()).slice(0, 4);
    const fmt = (r: any) => '• ' + (r.subject ? '[' + r.subject + '] ' : '') + r.title + ' — ' + fmtDateTime(r.due);
    if (dueToday.length) return 'الواجبات النهاردة:\n' + dueToday.map(fmt).join('\n');
    if (norm.includes('بكره') || norm.includes('بكرا')) {
      return dueTomorrow.length
        ? 'واجبات بكرة:\n' + dueTomorrow.map(fmt).join('\n')
        : 'مفيش واجبات بكرة الحمدلله';
    }
    let msg = 'مفيش واجبات النهاردة الحمدلله';
    if (upcoming.length) msg += '\nبس في القريب العاجل:\n' + upcoming.map(fmt).join('\n');
    return msg;
  }

  // الجدول
  if (/(جدول|محاضرات?|حصص|حصه|سكاشن|سكشن|online|اونلاين)/.test(norm)) {
    let targetDay = today.dayIdx;
    let label = 'النهاردة';
    if (/(بكره|بكرا)/.test(norm)) { targetDay = tomorrow.dayIdx; label = 'بكرة'; }
    const { data } = await admin
      .from('schedule_items')
      .select('title, event_type, day_of_week, start_time, end_time, location, is_active')
      .eq('day_of_week', targetDay)
      .eq('is_active', true)
      .order('start_time', { ascending: true });
    const rows = data || [];
    if (!rows.length) return 'الجدول ' + label + ' فاضي';
    const typeAr: Record<string, string> = { lecture: 'محاضرة', section: 'سكشن', quiz: 'كويز', exam: 'امتحان', other: 'لقاء' };
    const lines = rows.map((r: any) => {
      const t = String(r.start_time || '').slice(0, 5);
      const end = String(r.end_time || '').slice(0, 5);
      const loc = r.location ? ' — ' + r.location : '';
      return '• ' + (t || '؟') + (end ? ' ← ' + end : '') + ' | ' + (typeAr[r.event_type] || 'لقاء') + ' ' + r.title + loc;
    });
    return 'جدول ' + label + ':\n' + lines.join('\n');
  }

  // الامتحانات والكويزات
  if (/(امتحان|امتحانات|اختبار|كويز|كويزات|ميدترم|ميد ترم|فاينال|التيرم|final|midterm|quiz|exam)/.test(norm)) {
    const { data } = await admin
      .from('quizzes')
      .select('title, start_at, end_at, subject_id, subjects(name)')
      .eq('is_published', true)
      .gte('start_at', new Date(now.getTime() - 24 * 3600 * 1000).toISOString())
      .order('start_at', { ascending: true })
      .limit(4);
    const rows = data || [];
    if (!rows.length) return 'مفيش امتحانات أو كويزات متسجلة الفترة الجاية الحمدلله';
    const fmt = (q: any) => '• ' + (q.subjects?.name ? '[' + q.subjects.name + '] ' : '') + q.title + ' — ' + fmtDateTime(new Date(q.start_at));
    return 'أقرب امتحانات/كويزات:\n' + rows.map(fmt).join('\n');
  }

  // الإعلانات
  if (/(اعلان|اعلانات|اخبار|آخر الأخبار|جديد المنصه)/.test(norm)) {
    const { data } = await admin
      .from('announcements')
      .select('title, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(3);
    const rows = data || [];
    if (!rows.length) return 'مفيش إعلانات جديدة خالص';
    const fmt = (a: any) => '• ' + a.title;
    return 'آخر الإعلانات:\n' + rows.map(fmt).join('\n');
  }

  // مهام المستخدم (خطتي)
  if (/(مهامي|مزامناتي|خطتي|كام مهمه|عندي مهام|مهامك|مهام النهارده|مهام بكره)/.test(norm)) {
    const startIso = new Date(today.dateStr + 'T00:00:00+02:00').toISOString();
    const end = new Date(tomorrow.dateStr + 'T00:00:00+02:00');
    const endIso = new Date(end.getTime()).toISOString();
    const { data } = await admin
      .from('study_tasks')
      .select('is_done')
      .eq('user_id', askerId)
      .gte('due_at', startIso)
      .lt('due_at', endIso);
    const rows = data || [];
    const total = rows.length;
    const done = rows.filter((r: any) => !!r.is_done).length;
    if (!total) return 'مفيش مهام في خطتك النهاردة — يوم هادي';
    const left = total - done;
    return 'مهامك النهاردة: عندك ' + total + ' مهمة — خلصت ' + done + ' ولسه فاضل ' + left + (left > 0 ? '' : ' — برافو عليك');
  }

  return null; // مش عارف؟ ما يردش خالص
}

async function getActiveBan(admin: ReturnType<typeof createClient>, userId: string) {
  const { data } = await admin.from('chat_strikes').select('banned_until').eq('user_id', userId).maybeSingle();
  if (!data?.banned_until) return null;
  const t = new Date(data.banned_until).getTime();
  if (t <= Date.now()) return null;
  return { banned_until: new Date(t).toISOString(), seconds: Math.ceil((t - Date.now()) / 1000) };
}

async function applyStrike(admin: ReturnType<typeof createClient>, userId: string) {
  const { data } = await admin.from('chat_strikes').select('strikes, banned_until').eq('user_id', userId).maybeSingle();
  const now = Date.now();
  const until = data?.banned_until ? new Date(data.banned_until).getTime() : 0;
  if (until > now) return { banned: true as const, seconds: Math.ceil((until - now) / 1000), banned_until: data!.banned_until as string, fresh: false };
  const strikes = (data?.strikes ?? 0) + 1;
  if (strikes >= 2) {
    const bUntil = new Date(now + BAN_DURATION_MS).toISOString();
    await admin.from('chat_strikes').upsert({ user_id: userId, strikes: 0, banned_until: bUntil, updated_at: new Date().toISOString() });
    return { banned: true as const, seconds: Math.floor(BAN_DURATION_MS / 1000), banned_until: bUntil, fresh: true };
  }
  await admin.from('chat_strikes').upsert({ user_id: userId, strikes, banned_until: null, updated_at: new Date().toISOString() });
  return { banned: false as const, strikes };
}

async function postBotMessage(admin: ReturnType<typeof createClient>, key: CryptoKey, text: string, replyToId?: string | null) {
  try {
    const { iv, ciphertext } = await encrypt(text, key);
    await admin.from('chat_messages').insert({
      user_id: BOT_ID,
      ciphertext: toByteaHex(ciphertext),
      iv: toByteaHex(iv),
      reply_to_id: replyToId ?? null
    });
  } catch (e) {
    console.error('[bot] post failed:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim();
    const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
    const anonKey = (Deno.env.get('SUPABASE_ANON_KEY') || '').trim();

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json({ ok: false, error: 'إعدادات السيرفر ناقصة.' }, 500);
    }

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ ok: false, error: 'سجّل دخول عشان تستعمل الشات.' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) {
      return json({ ok: false, error: 'سجّل دخول تاني.' }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name, is_active, role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile && profile.is_active === false) {
      return json({ ok: false, error: 'حسابك موقوف مؤقتًا.' }, 403);
    }
    const isAdmin = String(profile?.role || '') === 'admin';
    const firstName = String(profile?.full_name || 'صاحبي').trim().split(/\s+/)[0];

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'list');

    const key = await getKey();

    // مسح رسالة — صاحب الرسالة أو الأدمن
    if (action === 'delete') {
      const id = String(body?.id || '').trim();
      if (!UUID_RE.test(id)) {
        return json({ ok: false, error: 'معرّف الرسالة غير صالح.' }, 400);
      }
      if (!isAdmin) {
        const { data: msg } = await admin.from('chat_messages').select('user_id').eq('id', id).maybeSingle();
        if (!msg) return json({ ok: true });
        if (msg.user_id !== user.id) {
          return json({ ok: false, error: 'دي مش رسالتك — تقدر تشيلها بس ليك.' }, 403);
        }
        await admin.from('chat_messages').delete().eq('id', id);
        return json({ ok: true });
      }
      const { error: delErr } = await admin.from('chat_messages').delete().eq('id', id);
      if (delErr) return json({ ok: false, error: 'تعذر مسح الرسالة.', detail: delErr.message }, 500);
      return json({ ok: true });
    }

    // إخفاء رسالة عندك بس (حذف لي فقط)
    if (action === 'hide') {
      const id = String(body?.id || '').trim();
      if (!UUID_RE.test(id)) return json({ ok: false, error: 'معرّف الرسالة غير صالح.' }, 400);
      await admin.from('chat_message_hides').upsert({ message_id: id, user_id: user.id });
      return json({ ok: true });
    }

    // تعديل رسالتك
    if (action === 'edit') {
      const id = String(body?.id || '').trim();
      const text = String(body?.text || '').trim();
      if (!UUID_RE.test(id)) return json({ ok: false, error: 'معرّف الرسالة غير صالح.' }, 400);
      if (!text) return json({ ok: false, error: 'الرسالة ماينفعش تكون فاضية.' }, 400);
      if (text.length > 600) return json({ ok: false, error: 'الرسالة طويلة.' }, 400);
      const { data: msg } = await admin.from('chat_messages').select('user_id').eq('id', id).maybeSingle();
      if (!msg) return json({ ok: false, error: 'الرسالة مش موجودة.' }, 404);
      if (msg.user_id !== user.id) return json({ ok: false, error: 'تقدر تعدّل رسايلك انت بس.' }, 403);
      const { iv, ciphertext } = await encrypt(text, key);
      const { error: upErr } = await admin.from('chat_messages')
        .update({ ciphertext: toByteaHex(ciphertext), iv: toByteaHex(iv), edited_at: new Date().toISOString() })
        .eq('id', id);
      if (upErr) return json({ ok: false, error: 'تعذر تعديل الرسالة.', detail: upErr.message }, 500);
      return json({ ok: true });
    }

    // إرسال رسالة
    if (action === 'send') {
      const text = String(body?.text || '').trim();
      if (!text) return json({ ok: false, error: 'اكتب سؤالك بسرعة.' }, 400);
      if (text.length > 600) return json({ ok: false, error: 'الرسالة طويلة.' }, 400);

      // محظور؟
      const ban = await getActiveBan(admin, user.id);
      if (ban) {
        return json({ ok: false, error: 'تم حظرك من الدردشة لمدة ساعة بسبب الشتايم — استنى العداد يخلص.', banned: true, banned_until: ban.banned_until, seconds: ban.seconds }, 403);
      }

      // شتايم؟ امسحها تلقائي واضرب لك ألف
      const norm = normalizeAr(text);
      const bad = findBadWord(norm);
      if (bad) {
        const s = await applyStrike(admin, user.id);
        if (s.banned) {
          await postBotMessage(admin, key, 'يا جماعة، ' + firstName + ' اتحظر من الدردشة لمدة ساعة عشان الكلام الغلط — مستنيه يرجع وإحنا أحسن', null);
          return json({ ok: false, error: 'تم حظرك من الدردشة لمدة ساعة بسبب الشتايم.', banned: true, banned_until: s.banned_until, seconds: s.seconds }, 403);
        }
        await postBotMessage(admin, key, 'يا ' + firstName + '، كمان مرة وانت هتحظر من الدردشة ساعة كاملة — خلينا كويسين مع بعض', null);
        return json({ ok: false, error: 'الشتايم ملهاش محل في الشات يا صاحبي — كمان مرة وهتتحظر ساعة.', struck: true }, 403);
      }

      // لو رد على رسالة — نتحقق إنها موجودة
      let replyToId: string | null = null;
      const wantedReply = String(body?.reply_to_id || '').trim();
      if (UUID_RE.test(wantedReply)) {
        const { data: target } = await admin.from('chat_messages').select('id').eq('id', wantedReply).maybeSingle();
        if (target) replyToId = wantedReply;
      }

      const { iv, ciphertext } = await encrypt(text, key);
      const { error: insertErr } = await admin
        .from('chat_messages')
        .insert({
          user_id: user.id,
          ciphertext: toByteaHex(ciphertext),
          iv: toByteaHex(iv),
          reply_to_id: replyToId
        });
      if (insertErr) {
        return json({ ok: false, error: 'تعذر إرسال الرسالة.', detail: insertErr.message }, 500);
      }

      // البوت يرد لو عارف — لو مش عارف يسكت خالص
      const botReply = await botAnswer(text, admin, user.id);
      if (botReply) {
        await postBotMessage(admin, key, botReply, null);
      }

      return json({ ok: true });
    }

    // تحميل آخر ٣٠ رسالة
    const callerBan = await getActiveBan(admin, user.id);

    // استثني الرسايل المخفية عند المستدعي
    const { data: hiddenRows } = await admin.from('chat_message_hides').select('message_id').eq('user_id', user.id);
    const hiddenIds = (hiddenRows || []).map((r: any) => String(r.message_id));

    let rowsQuery = admin
      .from('chat_messages')
      .select('id, user_id, ciphertext, iv, created_at, reply_to_id, edited_at')
      .order('created_at', { ascending: false })
      .limit(30);
    if (hiddenIds.length) {
      rowsQuery = rowsQuery.not('id', 'in', '(' + hiddenIds.join(',') + ')');
    }

    const membersQuery = admin
      .from('student_codes')
      .select('linked_user_id', { count: 'exact', head: true })
      .not('linked_user_id', 'is', null)
      .eq('is_active', true);

    const totalQuery = admin
      .from('student_codes')
      .select('id', { count: 'exact', head: true });

    const [{ data: rows, error: fetchErr }, membersRes, totalRes] = await Promise.all([
      rowsQuery,
      membersQuery,
      totalQuery
    ]);

    if (fetchErr) {
      return json({ ok: false, error: 'تعذر تحميل الرسايل.', detail: fetchErr.message }, 500);
    }

    const replyIds = Array.from(new Set((rows || []).map((r: any) => r.reply_to_id).filter(Boolean))) as string[];
    const replyMap = new Map<string, { text: string; user_id: string }>();
    if (replyIds.length) {
      const { data: replied } = await admin.from('chat_messages').select('id, user_id, ciphertext, iv').in('id', replyIds);
      for (const rr of replied || []) {
        let text = '';
        try { text = await decrypt(parseBytea(rr.ciphertext), parseBytea(rr.iv), key); } catch { text = ''; }
        replyMap.set(rr.id, { text, user_id: rr.user_id });
      }
    }

    const userIds = Array.from(new Set([
      ...(rows || []).map((r: any) => r.user_id),
      ...Array.from(replyMap.values()).map((r) => r.user_id)
    ]));
    const profilesMap = new Map<string, { name: string; initial: string }>();
    if (userIds.length) {
      const { data: people } = await admin.from('profiles').select('id, full_name, email').in('id', userIds);
      for (const p of people || []) {
        profilesMap.set(p.id, nameOf(p));
      }
    }

    const messages = await Promise.all(
      (rows || []).map(async (r: any) => {
        const ct = parseBytea(r.ciphertext);
        const iv = parseBytea(r.iv);
        let text = '';
        try { text = await decrypt(ct, iv, key); } catch (e) {
          console.error('[chat] decrypt failed for', r.id, ':', e);
          text = '[تعذر فك تشفير الرسالة]';
        }
        const sender = profilesMap.get(r.user_id) || { name: 'طالب', initial: 'ط' };

        let reply: { author: string; text: string } | null = null;
        if (r.reply_to_id) {
          const original = replyMap.get(r.reply_to_id);
          if (original) {
            const p = profilesMap.get(original.user_id);
            reply = { author: p?.name || 'طالب', text: original.text };
          }
        }

        return {
          id: r.id,
          user_id: r.user_id,
          author: sender.name,
          initial: sender.initial,
          is_me: r.user_id === user.id,
          is_bot: r.user_id === BOT_ID,
          edited: !!r.edited_at,
          text,
          created_at: r.created_at,
          reply_to_id: r.reply_to_id || null,
          reply
        };
      })
    );

    messages.sort((a: any, b: any) => new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime());

    const membersCount = membersRes?.count ?? 0;
    const totalStudents = totalRes?.count ?? 0;

    return json({
      ok: true,
      messages,
      members_count: membersCount,
      is_admin: isAdmin,
      total_students: totalStudents,
      ban: callerBan
    });
  } catch (err) {
    console.error('[chat] unexpected:', err);
    return json({ ok: false, error: 'حصلت مشكلة غير متوقعة.' }, 500);
  }
});
