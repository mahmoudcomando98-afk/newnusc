// Deploy:
//   supabase functions deploy code-login --no-verify-jwt
//
// نظام الدخول بالكود الجامعي فقط (لا بريد/كلمة مرور).
// - login: يتحقق من الكود → ينشئ/يربط مستخدم Supabase → يرجع hashed token يتحقق منه العميل محليًا.
// - lookup: بحث بالاسم (للذين نسوا كودهم) — محصور بحد 6 نتائج مع حد معدّل معدل الطلبات.
// SECURITY: لا يُرجع أي بيانات إلا بعد التحقق؛ الحسابات تُنشأ ببريد اصطناعي مشتق من الكود.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const SYNTHETIC_DOMAIN = 'codes.comando.local';
const MAX_NAME_RESULTS = 6;
const MAX_NAME_LEN = 120;
const MIN_QUERY_LEN = 3;
const LOOKUP_WINDOW_KEY = 'code-lookup-global';
const LOOKUP_MAX_PER_MINUTE = 60;

function normCode(input: string): string {
  // قصّ الفراغات + توحيد كل الفراغات لفراغ واحد + أحرف علوية لاتينية
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normArabic(input: string): string {
  return String(input || '')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, '') // تشكيل وعلامات
    .replace(/\u0640/g, '') // التطويل ـ
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

function syntheticEmail(codeNorm: string): string {
  //بريد اصطناعي مشتق من الكود (غير قابل للعكس ولا يُعرض للمستخدم)
  //يفضل الهاش حتى مع الأكواد العربية
  // ملاحظة: btoa غير متاحة في Deno لكل أنواع السلاسل، فنستخدم hex من crypto
  return 'sc-' + codeNormToHex(codeNorm).slice(0, 32) + '@' + SYNTHETIC_DOMAIN;
}

function codeNormToHex(s: string): string {
  const bytes = new TextEncoder().encode(s);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: 'Server misconfigured: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'login');

    // ---------------------------------------------------------------
    // lookup — "هل نسيت الكود الجامعي؟" اكتب اسمك → يظهر الاسم + الكود
    // ---------------------------------------------------------------
    if (action === 'lookup') {
      const raw = String(body?.query || '').trim();
      if (raw.length < MIN_QUERY_LEN) {
        return jsonResponse({ ok: false, error: 'اكتب 3 أحرف على الأقل من اسمك' });
      }
      if (raw.length > MAX_NAME_LEN) {
        return jsonResponse({ ok: false, error: 'الاسم طويل جدًا' });
      }

      // حد معدّل شامل (أفضل جهد — الجدول كبير لكن الطلبات محدودة بمعدّل منخفض)
      try {
        const { data: allowed } = await admin.rpc('check_rate_limit', {
          p_key: LOOKUP_WINDOW_KEY,
          p_max_per_minute: LOOKUP_MAX_PER_MINUTE
        });
        if (allowed === false) {
          return jsonResponse({ ok: false, error: 'محاولات كتير خلال دقيقة. استنى شوية وحاول تاني.' });
        }
      } catch {
        /* الدالة غير موجودة — نتابع بدون حد */
      }

      const { data: rows, error } = await admin
        .from('student_codes')
        .select('full_name, code, is_active')
        .ilike('full_name', `%${raw}%`)
        .limit(50);

      if (error) {
        return jsonResponse({ ok: false, error: 'تعذر البحث الآن. حاول مرة أخرى.' });
      }

      const q = normArabic(raw);
      const matches = (rows || [])
        .filter((r: { full_name: string }) => normArabic(r.full_name).includes(q))
        .slice(0, MAX_NAME_RESULTS)
        .map((r: { full_name: string; code: string }) => ({
          full_name: r.full_name,
          code: String(r.code).trim()
        }));

      return jsonResponse({ ok: true, results: matches });
    }

    // ---------------------------------------------------------------
    // login — دخول/تسجيل بالكود الجامعي
    // ---------------------------------------------------------------
    const code = normCode(String(body?.code || ''));
    if (!code) {
      return jsonResponse({ ok: false, error: 'اكتب الكود الجامعي أولًا' });
    }
    if (code.length > 40) {
      return jsonResponse({ ok: false, error: 'الكود غير صحيح' });
    }

    const { data: row, error: codeErr } = await admin
      .from('student_codes')
      .select('id, full_name, role, linked_user_id, is_active, device_id')
      .eq('code_norm', code)
      .maybeSingle();

    if (codeErr) {
      return jsonResponse({ ok: false, error: 'تعذر التحقق من الكود الآن. حاول مرة أخرى.' });
    }
    if (!row) {
      return jsonResponse({ ok: false, error: 'الكود غير صحيح. تأكد من الكود أو تواصل مع الإدارة.' });
    }
    if (row.is_active === false) {
      return jsonResponse({ ok: false, error: 'هذا الكود موقوف مؤقتًا. تواصل مع الإدارة.' });
    }

    // قفل الجهاز: الحساب يُربط بالجهاز الذي دخل منه أول مرة
    const deviceId = String(body?.device_id || '').trim();
    if (!deviceId || deviceId.length < 8 || deviceId.length > 64) {
      return jsonResponse({ ok: false, error: 'تعذر تحديد الجهاز. امسح بيانات المتصفح (Caches) وجرب تاني.' });
    }
    if (row.device_id && row.device_id !== deviceId) {
      return jsonResponse({ ok: false, error: 'هذا الحساب مسجل بالفعل على جهاز آخر. تواصل مع الإدارة لإعادة ضبط الجهاز.' });
    }

    const fullName = String(row.full_name || '').trim();
    const role = row.role === 'admin' || row.role === 'moderator' ? row.role : 'student';
    const email = syntheticEmail(code);

    let userId: string | null = row.linked_user_id || null;

    if (!userId) {
      // أول مرة للكود: أنشئ مستخدم Supabase ببريد اصطناعي + كلمة سر عشوائية (غير مستخدمة أبدًا)
      const randomPassword =
        crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName, student_code: code }
      });
      if (createErr || !created?.user) {
        const msg = String(createErr?.message || '');
        if (!/already|exists|registered/i.test(msg)) {
          return jsonResponse({ error: 'تعذر إنشاء الحساب. حاول مرة أخرى أو تواصل مع الإدارة.' }, 500);
        }
        // المستخدم موجود بالفعل ببريد اصطناعي مطابق — نسترجعه عبر رابط سحر
        const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email
        });
        if (linkErr || !link?.user?.id) {
          return jsonResponse({ error: 'تعذر ربط الحساب. تواصل مع الإدارة.' }, 500);
        }
        userId = link.user.id;
      } else {
        userId = created.user.id;
      }

      // اربط الكود بالمستخدم والجهاز
      await admin
        .from('student_codes')
        .update({ linked_user_id: userId, device_id: deviceId, updated_at: new Date().toISOString() })
        .eq('id', row.id);
    } else if (!row.device_id) {
      // حساب مرتبط من قبل بلا جهاز — اربطه بالجهاز الحالي
      await admin
        .from('student_codes')
        .update({ device_id: deviceId, updated_at: new Date().toISOString() })
        .eq('id', row.id);
    }

    // زامن ملف البروفايل مع بيانات الكود (الاسم والدور من الكود هو مصدر الحقيقة)
    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) {
      await admin.from('profiles').insert({
        id: userId,
        full_name: fullName,
        email,
        role,
        is_active: true
      });
    } else {
      const patch: Record<string, unknown> = {};
      if (profile.full_name !== fullName) patch.full_name = fullName;
      if (profile.role !== role) patch.role = role;
      if (Object.keys(patch).length) {
        await admin.from('profiles').update(patch).eq('id', userId);
      }
    }

    // أصدر رابط سحر للبريد الاصطناعي؛ العميل يتحقق منه ويكمل الجلسة محليًا
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email
    });
    const hashedToken = link?.properties?.hashed_token || null;
    if (linkErr || !hashedToken) {
      return jsonResponse({ error: 'تعذر إنشاء جلسة الدخول. حاول مرة أخرى.' }, 500);
    }

    return jsonResponse({
      ok: true,
      token_hash: hashedToken,
      type: 'magiclink',
      full_name: fullName,
      role
    });
  } catch (err) {
    return jsonResponse({ error: 'خطأ غير متوقع: ' + String((err as Error)?.message || err) }, 500);
  }
});
