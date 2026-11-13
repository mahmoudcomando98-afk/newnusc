// دردشة الدفعة — رسائل مشفرة AES-256-GCM + ردود + مسح الأدمن
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
  // PostgREST returns bytea as \x... (hex)
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

    // من profile: اسمه ودوره (لو is_active=false منوقف نراه)
    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name, is_active, role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile && profile.is_active === false) {
      return json({ ok: false, error: 'حسابك موقوف مؤقتًا.' }, 403);
    }
    const isAdmin = String(profile?.role || '') === 'admin';

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'list');

    const key = await getKey();

    // مسح رسالة — الأدمن بس
    if (action === 'delete') {
      if (!isAdmin) {
        return json({ ok: false, error: 'الأدمن بس اللي يمسح الرسايل.' }, 403);
      }
      const id = String(body?.id || '').trim();
      if (!UUID_RE.test(id)) {
        return json({ ok: false, error: 'معرّف الرسالة غير صالح.' }, 400);
      }
      const { error: delErr } = await admin.from('chat_messages').delete().eq('id', id);
      if (delErr) {
        return json({ ok: false, error: 'تعذر مسح الرسالة.', detail: delErr.message }, 500);
      }
      return json({ ok: true });
    }

    // إرسال رسالة (مع إمكانية الرد على رسالة)
    if (action === 'send') {
      const text = String(body?.text || '').trim();
      if (!text) return json({ ok: false, error: 'اكتب سؤالك بسرعة.' }, 400);
      if (text.length > 600) return json({ ok: false, error: 'الرسالة طويلة.' }, 400);

      // لو الرد على رسالة — نتحقق إنها موجودة قبل ما نخزنها (لو اتمسحت بيبقى الرد عادي بدون اقتباس)
      let replyToId: string | null = null;
      const wantedReply = String(body?.reply_to_id || '').trim();
      if (UUID_RE.test(wantedReply)) {
        const { data: target } = await admin
          .from('chat_messages')
          .select('id')
          .eq('id', wantedReply)
          .maybeSingle();
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
      return json({ ok: true });
    }

    // تحميل آخر ٣٠ رسالة (الأحدث الأول) — نعرضها بترتيب من الأقدم للأحدث في الفرونت
    const rowsQuery = admin
      .from('chat_messages')
      .select('id, user_id, ciphertext, iv, created_at, reply_to_id')
      .order('created_at', { ascending: false })
      .limit(30);

    // عدد الأعضاء — اللي منهم عنده حساب (مرتبط) على المنصة + كمان عدد الطلاب العامية إجمالًا
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

    // اجمع الردود المطلوبة ومفكوكتها أولًا
    const replyIds = Array.from(new Set((rows || []).map((r) => r.reply_to_id).filter(Boolean))) as string[];
    const replyMap = new Map<string, { text: string; user_id: string }>();
    if (replyIds.length) {
      const { data: replied } = await admin
        .from('chat_messages')
        .select('id, user_id, ciphertext, iv')
        .in('id', replyIds);
      for (const rr of replied || []) {
        let text = '';
        try { text = await decrypt(parseBytea(rr.ciphertext), parseBytea(rr.iv), key); } catch { text = ''; }
        replyMap.set(rr.id, { text, user_id: rr.user_id });
      }
    }

    const userIds = Array.from(new Set([
      ...(rows || []).map((r) => r.user_id),
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
      (rows || []).map(async (r) => {
        const ct = parseBytea(r.ciphertext);
        const iv = parseBytea(r.iv);
        let text = '';
        try { text = await decrypt(ct, iv, key); } catch (e) {
          console.error('[chat] decrypt failed for', r.id, ':', e, 'ct.len=', ct.length, 'iv.len=', iv.length);
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
          text,
          created_at: r.created_at,
          reply_to_id: r.reply_to_id || null,
          reply
        };
      })
    );

    messages.sort((a, b) => new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime());

    const membersCount = membersRes?.count ?? 0;
    const totalStudents = totalRes?.count ?? 0;

    return json({ ok: true, messages, members_count: membersCount, is_admin: isAdmin, total_students: totalStudents });
  } catch (err) {
    console.error('[chat] unexpected:', err);
    return json({ ok: false, error: 'حصلت مشكلة غير متوقعة.' }, 500);
  }
});
