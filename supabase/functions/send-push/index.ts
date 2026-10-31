// Deploy:
//   supabase functions deploy send-push --no-verify-jwt
// Secrets:
//   supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:you@example.com"
//
// SECURITY: requires Authorization Bearer of an active admin. Never open to anon.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') || '';
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') || '';
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@nusc.local';

    if (!vapidPublic || !vapidPrivate) {
      return new Response(
        JSON.stringify({
          error: 'VAPID keys missing on server',
          hint: 'supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...'
        }),
        { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const {
      data: { user },
      error: userErr
    } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if ((profile?.role || '') !== 'admin' || profile?.is_active === false) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    try {
      await admin.rpc('check_rate_limit', { p_bucket: 'send-push', p_max_per_minute: 30 });
    } catch {
      /* optional until SQL applied */
    }

    const body = await req.json().catch(() => ({}));
    const title = String(body.title || 'NUSC').slice(0, 120);
    const text = String(body.body || body.content || 'إشعار جديد').slice(0, 500);
    const url = String(body.url || '/notifications.html');

    const { data: subs, error: subErr } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth');

    if (subErr) throw subErr;

    const payload = JSON.stringify({
      title,
      body: text,
      url,
      tag: 'nusc-admin-' + Date.now(),
      icon: '/nusc.png.jpeg',
      badge: '/nusc.png.jpeg'
    });

    let sent = 0;
    let failed = 0;

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
      /* until SQL applied */
    }

    return new Response(
      JSON.stringify({ ok: true, sent, failed, total: (subs || []).length }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
