// Deploy على نفس مشروع المنصة (bmqqacvgtevogcuqfryq):
//   npx supabase secrets set GROQ_API_KEY="gsk_..."
//   npx supabase functions deploy ai-chat
// (JWT verification مفعلة — الطلاب المسجلون فقط)
//
// SECURITY: requires Authorization Bearer of an active, authenticated student.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const GROQ_MODEL = 'qwen/qwen3.8-27b';
const MAX_TOKENS = 1100;
const RATE_LIMIT_PER_MINUTE = 20;
const MAX_HISTORY = 12;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  const clean = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 1500) }));
  return clean.slice(-MAX_HISTORY);
}

function buildSystemPrompt(ctx: {
  studentName: string;
  subjects: string;
  materials: string;
  faq: string;
  announcements: string;
  quizzes: string;
  knowledge: string;
}): string {
  return `إنت «مساعد COMANDO» — مساعد ذكي داخل منصة COMANDO لطلاب كلية الحاسبات والمعلومات.

شخصيتك:
- مبسوط وواثق وهادي، ودّود جدًا، عربي مصري عادي بعيد عن الرسمية المملة.
- مختصر جدًا (جملتان إلى 4 أسطر لو تكفي) — لا تكرّر نفس الكلام.
- تقدر تعتذر بلطف + تطلب توضيح لو سؤال الطالب مش واضح.

قواعد صارمة:
- اسم الطالب اللي معاه دلوقتي: ${ctx.studentName} — استدعيه باسمه في الترحيب وبشكل طبيعي (مش كل سطر).
- ردّ بس بناءً على البيانات اللي عندك تحت (المواد/الملفات/الامتحانات/الإعلانات/الأسئلة الشائعة/المعرفة من الأدمن).
- لو الطالب سأل عن شيء مش موجود، قول بجانب اللغة «مش موجود لسه» وحده الكلام بدون افتراء.
- ممنوع تأليف أسماء أو روابط مش موجودة في البيانات.
- ماتستعينش بفكرة «قاعدة بيانات» ولا تقدم أي حاجة technical عن حضرتك — إنت مساعد ذكي وتبقى زهق للطالب.
- لو سؤالك برة سياق المنصة (رياضة/أخبار/سياسة...)، رد بجملتين وراجع الطالب إنك موجود عشان الدراسة.
- ماتذكرش نوع الموديل ولا حاجة تقنية عن طريقة عملك.

أنت متكلم دلوقتي مع: ${ctx.studentName} — يمكن تنده عليه باسمه بس مش كل سطر.

--- سياق المنصة ---
مواد الطالب:
${ctx.subjects}

أحدث الملفات والواجبات (بالترتيب الزمني):
${ctx.materials}

كويزات قادمة/مفتوحة:
${ctx.quizzes}

إعلانات مهمة:
${ctx.announcements}

الأسئلة الشائعة FAQ:
${ctx.faq}

معرفة الأدمن (مر وتفاصيل ضبطها):
${ctx.knowledge}
────────────────────────
`;
}

function short(value: unknown, limit: number): string {
  const s = String(value ?? '').trim();
  return s.length > limit ? s.slice(0, limit) + '…' : s;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const groqKey = Deno.env.get('GROQ_API_KEY') || '';

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json({ ok: false, error: 'إعدادات السيرفر ناقصة.' }, 500);
    }
    if (!groqKey) {
      return json({ ok: false, error: 'المساعد مش جاهز دلوقتي — الأدمن محتاج يضبط مفتاح الذكاء الاصطناعي.' }, 503);
    }

    // 1) المستخدم لازم يكون مسجل دخول
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ ok: false, error: 'سجّل دخول أول.' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) {
      return json({ ok: false, error: 'سجّل دخول تاني عشان تستعمل المساعد.' }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 2) المستخدم محظور؟
    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name, is_active, role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile && profile.is_active === false) {
      return json({ ok: false, error: 'حسابك موقوف مؤقتًا. تواصل مع الإدارة.' }, 403);
    }

    // 3) حد معدّل لكل طالب (نمرر توكن المستخدم لأن check_rate_limit ترجع false لو auth.uid() == NULL)
    const { data: allowed } = await userClient.rpc('check_rate_limit', {
      p_bucket: 'ai-chat:' + user.id,
      p_max_per_minute: RATE_LIMIT_PER_MINUTE
    });
    if (allowed === false) {
      return json({ ok: false, error: 'هديك شوية ثواني ما سألتش مرتين — اسأل تاني بعد دقيقة.' }, 429);
    }

    // 4.1) action: 'welcome' — ترحيب سريع باسم الطالب
    const studentName = short((profile?.full_name || user.email || 'يا بطل').trim().split(/\s+/)[0] || 'يا بطل', 40);
    const body2Early = await req.json().catch(() => ({}));
    if (body2Early?.action === 'welcome') {
      return json({
        ok: true,
        reply: `أهلاً يا ${studentName} — أنا مساعد COMANDO الذكي. أقدر أساعدك تلاقي مادة أو ملف أو موعد، أو أعملك ملخص سريع. اسأل براحتك.`,
        student_name: studentName
      });
    }
    const [
      { data: subjects },
      { data: materials },
      { data: faq },
      { data: announcements },
      { data: quizzes },
      { data: knowledge }
    ] = await Promise.all([
      admin.from('subjects').select('name, code, instructor').eq('is_published', true).order('created_at'),
      admin
        .from('materials')
        .select('title, material_type, subject_id, is_published, created_at, due_at')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(80),
      admin.from('faq').select('question, answer').eq('is_published', true).order('sort_order').limit(30),
      admin
        .from('announcements')
        .select('title, content, created_at, is_pinned')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(5),
      admin
        .from('quizzes')
        .select('title, start_at, end_at, status, subject_id')
        .eq('is_published', true)
        .order('start_at', { ascending: true })
        .limit(10),
      admin
        .from('ai_knowledge')
        .select('title, content')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(40)
    ]);

    const subjectNames = new Map<string, string>();
    for (const s of subjects || []) {
      subjectNames.set(s.code || s.name, s.name);
    }

    const subjectLines = (subjects || [])
      .map((s: { name?: string; code?: string; instructor?: string }) =>
        `- ${short(s.name, 60)}${s.code ? ' · كود: ' + s.code : ''}${s.instructor ? ' · دكتور: ' + short(s.instructor, 40) : ''}`
      )
      .join('\n') || 'لا توجد مواد منشورة بعد.';

    // نحتاج أسماء المواد للمواد بدل subject_id — نجيبها من جدول المواد
    const subjectIdNames = new Map<string, string>();
    {
      const { data: subRows } = await admin.from('subjects').select('id, name').eq('is_published', true);
      for (const s of subRows || []) subjectIdNames.set(s.id, s.name);
    }

    const materialLines = (materials || [])
      .map((m: { title?: string; material_type?: string; subject_id?: string; due_at?: string | null }) =>
        `- [${short(m.material_type || 'ملف', 12)}] ${short(m.title, 70)} (مادة: ${short(subjectIdNames.get(m.subject_id || '') || '?', 35)})` +
        (m.due_at ? ` — تسليم: ${short(new Date(m.due_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' }), 20)}` : '')
      )
      .join('\n') || 'لا توجد ملفات منشورة بعد.';

    const faqLines = (faq || [])
      .map((f: { question?: string; answer?: string }) => `- س: ${short(f.question, 90)} / ج: ${short(f.answer, 220)}`)
      .join('\n') || 'لا توجد أسئلة شائعة.';

    const announcementLines = (announcements || [])
      .map((a: { title?: string; content?: string; is_pinned?: boolean }) =>
        `- ${a.is_pinned ? '[مثبت] ' : ''}${short(a.title, 70)}${a.content ? ': ' + short(a.content, 150) : ''}`
      )
      .join('\n') || 'لا توجد إعلانات.';

    const quizLines = (quizzes || [])
      .map((q: { title?: string; start_at?: string | null; status?: string; subject_id?: string }) =>
        `- ${short(q.title, 70)} (مادة: ${short(subjectIdNames.get(q.subject_id || '') || '?', 35)})` +
        (q.start_at ? ` — البدء: ${short(new Date(q.start_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }), 30)}` : '') +
        ` — ${q.status === 'open' ? 'مفتوح الآن' : q.status === 'upcoming' ? 'قادم' : 'انتهى'}`
      )
      .join('\n') || 'لا توجد كويزات معلنة.';

    const knowledgeLines = (knowledge || [])
      .map((k: { title?: string; content?: string }) => `- ${short(k.title || 'معلومة', 60)}: ${short(k.content, 220)}`)
      .join('\n') || 'لا توجد معرفة مضافة من الأدمن حتى الآن.';

    // 5) الرسائل (نعيد استخدام الجسم اللي قرأناه)
    const messages = trimHistory(((body2Early?.messages || []) as ChatMessage[]) || []);
    const lastQuestion = messages[messages.length - 1];
    if (!lastQuestion || lastQuestion.role !== 'user') {
      return json({ ok: false, error: 'اكتب سؤالك.' }, 400);
    }

    const systemPrompt = buildSystemPrompt({
      studentName,
      subjects: subjectLines,
      materials: materialLines,
      faq: faqLines,
      announcements: announcementLines,
      quizzes: quizLines,
      knowledge: knowledgeLines
    });

    // 6) Groq
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + groqKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.35,
        max_tokens: MAX_TOKENS
      })
    });

    if (!groqRes.ok) {
      const detail = await groqRes.text().catch(() => '');
      console.error('[ai-chat] groq error:', groqRes.status, detail.slice(0, 300));
      if (groqRes.status === 429) {
        return json({ ok: false, error: 'المساعد مشغول دلوقتي — جرّب تاني خلال دقيقة.' }, 429);
      }
      return json({ ok: false, error: 'حصل مشكلة في التفكير عنك دلوقتي — جرّب تاني كمان شوية.' }, 502);
    }

    const groqJson = await groqRes.json();
    const reply = groqJson?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return json({ ok: false, error: 'رد فاضي من المساعد — جرّب تاني.' }, 502);
    }

    return json({ ok: true, reply });
  } catch (err) {
    console.error('[ai-chat] unexpected:', err);
    return json({ ok: false, error: 'حصلت مشكلة غير متوقعة — حاول تاني.' }, 500);
  }
});
