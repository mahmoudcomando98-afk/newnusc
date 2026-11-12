// Deploy on the SAME project the website uses (bmqqacvgtevogcuqfryq):
//   npx supabase link --project-ref bmqqacvgtevogcuqfryq
//   npx supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:mahmoudcomando98@gmail.com"
//   npx supabase functions deploy send-push --no-verify-jwt
//
// SECURITY: requires Authorization Bearer of an active admin.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const vapidPublic = (Deno.env.get('VAPID_PUBLIC_KEY') || '').trim();
    const vapidPrivate = (Deno.env.get('VAPID_PRIVATE_KEY') || '').trim();
    const vapidSubject =
      (Deno.env.get('VAPID_SUBJECT') || '').trim() || 'mailto:mahmoudcomando98@gmail.com';

    if (!vapidPublic || !vapidPrivate) {
      return json(
        {
          error: 'مفاتيح VAPID مش متضبوطة على السيرفر',
          hint:
            'npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:mahmoudcomando98@gmail.com'
        },
        503
      );
    }

    try {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    } catch (e) {
      return json(
        {
          error: 'مفاتيح VAPID غير صالحة',
          detail: String((e as Error)?.message || e)
        },
        503
      );
    }

    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim();
    const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
    const anonKey = (Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '').trim();

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json(
        {
          error: 'إعدادات السيرفر ناقصة',
          detail: 'SUPABASE_URL / SERVICE_ROLE / ANON'
        },
        500
      );
    }

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'لازم تسجيل دخول الأدمن (مفيش توكن)' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const {
      data: { user },
      error: userErr
    } = await userClient.auth.getUser();
    if (userErr || !user) {
      return json(
        {
          error: 'الجلسة غير صالحة — سجّل دخول الأدمن تاني',
          detail: userErr?.message || null
        },
        401
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // صلاحية أدمن: role=admin أو is_admin() لو موجودة
    let isAdmin = false;
    try {
      const { data: ok } = await admin.rpc('is_admin');
      // rpc without user context won't work with service role for auth.uid()
    } catch {
      /* ignore */
    }

    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr) {
      return json(
        {
          error: 'تعذر قراءة صلاحيات الأدمن',
          detail: profileErr.message
        },
        500
      );
    }

    const role = String(profile?.role || '');
    isAdmin = role === 'admin' || role === 'super_admin';
    if (!isAdmin || profile?.is_active === false) {
      return json(
        {
          error: 'الإرسال للتليفون للأدمن فقط',
          detail: `role=${role || 'none'} user=${user.id}`
        },
        403
      );
    }

    const body = await req.json().catch(() => ({}));
    const title = String(body.title || 'COMANDO').slice(0, 120);
    const text = String(body.body || body.content || 'إشعار جديد').slice(0, 500);
    const url = String(body.url || '/notifications.html');

    const { data: subs, error: subErr } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth');

    if (subErr) {
      return json(
        {
          error: 'جدول الاشتراكات push_subscriptions مش جاهز',
          detail: subErr.message,
          hint: 'نفّذ SETUP_NEW_DB.sql أو الجزء الخاص بـ push_subscriptions'
        },
        500
      );
    }

    const payload = JSON.stringify({
      title,
      body: text,
      url,
      tag: 'comando-admin-' + Date.now(),
      icon: '/nusc.png.jpeg',
      badge: '/nusc.png.jpeg'
    });

    let sent = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const row of subs || []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth }
          },
          payload,
          { TTL: 60 * 60 * 24, urgency: 'high' }
        );
        sent++;
      } catch (e: any) {
        failed++;
        const code = e?.statusCode || e?.status;
        const msg = String(e?.body || e?.message || e).slice(0, 120);
        if (failures.length < 3) failures.push(`${code || '?'}: ${msg}`);
        if (code === 404 || code === 410) {
          await admin.from('push_subscriptions').delete().eq('id', row.id);
        }
      }
    }

    try {
      await admin.from('audit_logs').insert({
        actor_id: user.id,
        action: 'send_push',
        entity_type: 'push',
        meta: { title, sent, failed, total: (subs || []).length }
      });
    } catch {
      /* optional */
    }

    return json({
      ok: true,
      sent,
      failed,
      total: (subs || []).length,
      failures: failures.length ? failures : undefined
    });
  } catch (err) {
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
