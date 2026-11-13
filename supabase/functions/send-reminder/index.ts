// Deploy:
//   npx supabase functions deploy send-reminder --project-ref bmqqacvgtevogcuqfryq
// ممنوع النداء من خارج (يُستخدم من cron الداخلي فقط)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-cron-key, authorization',
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

  const cronKey = (req.headers.get('X-CRON-KEY') || '').trim();

  try {
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim();
    const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
    const anonKey = (Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
    const vapidPublic = (Deno.env.get('VAPID_PUBLIC_KEY') || '').trim();
    const vapidPrivate = (Deno.env.get('VAPID_PRIVATE_KEY') || '').trim();
    const vapidSubject = (Deno.env.get('VAPID_SUBJECT') || '').trim() || 'mailto:mahmoudcomando98@gmail.com';

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json({ error: 'إعدادات السيرفر ناقصة.' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 1) التحقق من مفتاح الـ cron الداخلي (ممنوع الدخول الخارجي)
    const { data: cfg } = await admin
      .from('ai_cron_config')
      .select('value')
      .eq('key', 'reminder_cron_key')
      .maybeSingle();
    if (!cfg || String(cfg.value) !== cronKey || !cronKey) {
      return json({ error: 'غير مصرح.' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const reminderId = String(body?.reminder_id || '').trim();
    if (!reminderId) return json({ error: 'reminder_id مفقود.' }, 400);

    // 2) استلام التذكير ذريًا (pending → sent) عشان ما يتكررش مرتين من الـ cron
    const { data: claimed, error: claimErr } = await admin
      .from('ai_reminders')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', reminderId)
      .eq('status', 'pending')
      .select('id, user_id, message, due_at')
      .maybeSingle();

    if (claimErr) {
      return json({ error: 'تعذر استلام التذكير.', detail: claimErr.message }, 500);
    }
    if (!claimed) {
      return json({ ok: true, skipped: true, reason: 'التذكير عولج بالفعل أو غير موجود' });
    }

    // 3) التأكد من VAPID
    if (!vapidPublic || !vapidPrivate) {
      await admin.from('ai_reminders').update({ status: 'failed' }).eq('id', claimed.id);
      return json({ error: 'الإشعارات غير مهيأة على السيرفر.' }, 503);
    }
    try {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    } catch (e) {
      await admin.from('ai_reminders').update({ status: 'failed' }).eq('id', claimed.id);
      return json({ error: 'VAPID غير صالح.', detail: String((e as Error)?.message || e) }, 503);
    }

    // 4) اشتراكات الطالب
    const { data: subs, error: subErr } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', claimed.user_id);

    if (subErr) {
      await admin.from('ai_reminders').update({ status: 'failed' }).eq('id', claimed.id);
      return json({ error: 'تعذر قراءة اشتراكات الإشعارات.', detail: subErr.message }, 500);
    }

    if (!subs || subs.length === 0) {
      await admin.from('ai_reminders').update({ status: 'failed' }).eq('id', claimed.id);
      return json({ ok: false, reason: 'الطالب غير مفعّل الإشعارات — التذكير لم يصل.' });
    }

    const payload = JSON.stringify({
      title: 'تذكير من مساعد COMANDO',
      body: String(claimed.message).slice(0, 180),
      url: '/notifications.html',
      tag: 'comando-reminder-' + claimed.id,
      icon: '/nusc.png.jpeg',
      badge: '/nusc.png.jpeg'
    });

    let sent = 0;
    let failed = 0;
    for (const row of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
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

    if (sent === 0) {
      await admin.from('ai_reminders').update({ status: 'failed' }).eq('id', claimed.id);
      return json({ ok: false, reason: 'لم يصل التذكير لأي جهاز.', failed });
    }

    return json({ ok: true, sent, failed, reminder_id: claimed.id });
  } catch (err) {
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
