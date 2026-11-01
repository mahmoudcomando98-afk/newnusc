// Deploy:
//   npx supabase functions deploy admin-set-password --no-verify-jwt
//
// Admin-only: set a student's password via service role after JWT check.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
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

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body.user_id || body.userId || '').trim();
    const newPassword = String(body.password || body.new_password || '');

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'user_id required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    if (newPassword.length < 6) {
      return new Response(JSON.stringify({ error: 'كلمة المرور لازم 6 حروف على الأقل' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    if (newPassword.length > 72) {
      return new Response(JSON.stringify({ error: 'كلمة المرور طويلة زيادة' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // Never allow password change for another admin via this endpoint
    const { data: target } = await admin
      .from('profiles')
      .select('id, role, email, full_name')
      .eq('id', targetUserId)
      .maybeSingle();

    if (!target) {
      return new Response(JSON.stringify({ error: 'الطالب مش موجود' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    if ((target.role || '') === 'admin' && target.id !== user.id) {
      return new Response(JSON.stringify({ error: 'مش مسموح تغيير باس أدمن تاني من هنا' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
      password: newPassword
    });

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message || 'تعذر تحديث كلمة المرور' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    try {
      await admin.from('audit_logs').insert({
        actor_id: user.id,
        action: 'admin_set_password',
        entity_type: 'user',
        entity_id: targetUserId,
        meta: { email: target.email || null }
      });
    } catch {
      /* optional */
    }

    return new Response(
      JSON.stringify({ ok: true, user_id: targetUserId }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
