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

interface ReminderIntent { message: string; label: string; dueAt: string }

const AR_WORD_NUMS: Record<string, number> = {
  'واحد': 1, 'واحده': 1, 'اتنين': 2, 'اثنين': 2, 'اتنينين': 2,
  'ثلاثه': 3, 'ثلاثة': 3, 'ثلاث': 3, 'تلات': 3, 'تلاتة': 3, 'ثلاث': 3,
  'اربعه': 4, 'أربعة': 4, 'اربع': 4,
  'خمسه': 5, 'خمسة': 5, 'خمس': 5,
  'سته': 6, 'ستة': 6, 'ست': 6,
  'سبعه': 7, 'سبعة': 7, 'سبع': 7,
  'ثمانيه': 8, 'ثمانية': 8, 'تمانية': 8, 'تماني': 8, 'تمان': 8,
  'تسعه': 9, 'تسعة': 9, 'تسع': 9,
  'عشره': 10, 'عشرة': 10, 'عشر': 10
};

function normalizeArabicDigits(text: string): string {
  return String(text || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function unifyArabic(text: string): string {
  return String(text || '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

function parseReminderIntent(raw: string): ReminderIntent | null {
  const t = unifyArabic(normalizeArabicDigits(String(raw || '').trim()));
  if (!t) return null;
  const trigger = /فكر|ذكر|نبه/;
  if (!trigger.test(t)) return null;

  let seconds = 0;
  let label = '';
  let m: RegExpMatchArray | null;

  // ربع/نص ساعة — يتابعوا الأول عشان "بعد نص ساعه" ما تختلطش بـ "بعد 30 دقيقة"
  if (/ربع\s*ساعه/.test(t)) {
    seconds = 15 * 60; label = 'ربع ساعة';
  } else if (/نصف\s*ساعه|نص\s*ساعه/.test(t)) {
    seconds = 30 * 60; label = 'نص ساعة';
  } else if (/ساعه\s*ونص|ساع\s*ونص/.test(t)) {
    seconds = 90 * 60; label = 'ساعة ونص';
  } else if (/ساعتين/.test(t)) {
    seconds = 120 * 60; label = 'ساعتين';
  } else if ((m = t.match(/بعد\s*(\d+)\s*(دقيقه|دقايق|دقائق)/))) {
    seconds = Number(m[1]) * 60; label = `${m[1]} دقيقة`;
  } else if ((m = t.match(/بعد\s*(\d+)\s*(ساعه|ساعات)/))) {
    seconds = Number(m[1]) * 3600; label = `${m[1]} ساعة`;
  } else if ((m = t.match(/بعد\s*(\d+)\s*(يوم|ايام)/))) {
    seconds = Number(m[1]) * 86400; label = `${m[1]} يوم`;
  } else if ((m = t.match(/بعد\s*([ء-ي]+)/))) {
    const n = AR_WORD_NUMS[m[1]] ?? 0;
    if (n && /دقيق|دقايق/.test(t)) {
      seconds = n * 60; label = `${n} دقيقة`;
    } else if (n && /ساع/.test(t)) {
      seconds = n * 3600; label = `${n} ساعة`;
    } else if (n && /يوم|ايام/.test(t)) {
      seconds = n * 86400; label = `${n} يوم`;
    }
  }

  if (!seconds) {
    // "بعد ساعه" بدون رقم = ساعة واحدة
    if (/بعد\s*ساعه/.test(t)) {
      seconds = 3600; label = 'ساعة';
    } else if (/بعد\s*يوم/.test(t)) {
      seconds = 86400; label = 'يوم';
    } else if (/بعد\s*نص\s*ساعه/.test(t)) {
      seconds = 1800; label = 'نص ساعة';
    }
  }
  if (!seconds || seconds > 7 * 86400) return null;

  // استخرج مهمة الطالب ("اني أذاكر كذا" / "عايز اذاكر" ...)
  let message = '';
  const afterAny = t.match(/(?:اني|على\s+اني|عن|انى)\s*(.{2,})/);
  if (afterAny && afterAny[1]) {
    message = afterAny[1].trim();
  } else {
    // إزالة عبارات البداية (فكرني / ذكرني / بعد X دقيقة) وبعدها ما يبقى هو المطلوب
    message = t
      .replace(/بعد\s*(ربع|نصف|نص|ساعه|ساع|دقيقه|دقايق|دقائق|يوم|ايام|\d+|[ء-ي]+)\s*(ساعه|دقيقه|دقايق|دقيقة|دقائق|يوم)?\s*/gi, ' ')
      .replace(/فكر|ذكر|نبه/g, ' ')
      .replace(/(افكرني|افكريني|اذكرني|اذكريني|انبهني|انبهيني)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  message = message.replace(/^(اني|انى|انك|عن|على)\s*/, '').trim();
  if (!message || message.length < 2) message = raw.trim().slice(0, 120);
  if (message.length > 100) message = message.slice(0, 100) + '…';

  return {
    message,
    label,
    dueAt: new Date(Date.now() + seconds * 1000).toISOString()
  };
}

function parseCancelReminder(raw: string): boolean {
  const t = unifyArabic(normalizeArabicDigits(String(raw || '').trim()));
  return /الغاء|لغي|مسح/.test(t) && /تذكير|تذكيرات|فكرني/.test(t);
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
  gender: 'male' | 'female' | null;
  subjects: string;
  materials: string;
  faq: string;
  announcements: string;
  quizzes: string;
  knowledge: string;
  tasks: string;
}): string {
  const genderLine = ctx.gender === 'male'
    ? 'الطالب ذَكَر — خاطبه بالمذكر دائمًا: انت، جاهز، عايز، عارف، سلّمها لما تكون جاهز؟ شاطر. ولا مرة تخاطب طالب ذكر بالتأنيث.'
    : ctx.gender === 'female'
      ? 'الطالبة أنثى — خاطبيها بالمؤنث دائمًا: انتي، جاهزة، عايزة، عارفة، سلّميها لما تكوني جاهزة؟ شاطرة. ولا مرة تخاطبي طالبة بالتذكير.'
      : 'النوع غير معروف — استخدم عبارات محايدة للجنس (يا غالي/غالية، يا فندم، تحب تعمل إيه...) وتجنب أفعال مؤنثة/مذكرة صريحة.';

  return `إنت «مساعد COMANDO» — مساعد ذكي داخل منصة COMANDO لطلاب كلية الحاسبات والمعلومات.

شخصيتك:
- مبسوط وواثق وهادي، ودّود جدًا، عربي مصري عادي بعيد عن الرسمية المملة.
- مختصر جدًا (جملتان إلى 4 أسطر لو تكفي) — لا تكرّر نفس الكلام.
- تقدر تعتذر بلطف + تطلب توضيح لو سؤال الطالب مش واضح.

قواعد صارمة:
- اسم الطالب اللي معاه دلوقتي: ${ctx.studentName} — استدعيه باسمه في الترحيب وبشكل طبيعي (مش كل سطر).
- الجنس — ${genderLine}
- ردّ بس بناءً على البيانات اللي عندك تحت (المواد/الملفات/الامتحانات/الإعلانات/الأسئلة الشائعة/المعرفة من الأدمن).
- لو الطالب سأل عن شيء مش موجود، قول بجانب اللغة «مش موجود لسه» وحده الكلام بدون افتراء.
- ممنوع تأليف أسماء أو روابط مش موجودة في البيانات.
- ماتستعينش بفكرة «قاعدة بيانات» ولا تقدم أي حاجة technical عن حضرتك — إنت مساعد ذكي وتبقى زهق للطالب.
- لو سؤالك برة سياق المنصة (رياضة/أخبار/سياسة...)، رد بجملتين وراجع الطالب إنك موجود عشان الدراسة.
- ماتذكرش نوع الموديل ولا حاجة تقنية عن طريقة عملك.

أنت متكلم دلوقتي مع: ${ctx.studentName} — يمكن تنادي عليه أو عليها بالاسم بس، مش كل سطر.

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

خطتي — مهام الطالب اليوم/بكرة:
${ctx.tasks}
────────────────────────
ملاحظة مهمة: لو الطالب سأل عن جدوله أو مهامه أو إيه اللي مفروض يعمله النهاردة:
- اعرّفه بالمهام دي بالظبط — دي مهامه الفعلية على المنصة.
- عدّد المهام باسمائها مع الوقت.
- لو كل المهام خلصت، قوله «خلصت كل مهامك النهاردة 🎉 علّيك!» واكتب قائمة صغيرة بالمهام اللي خلصها.
- لو واحدة خلصت من ثلاث مهام، قوله صراحة: «عندك ٣ مهام أديت منها ١ لسة ٢ — لسا باقي».
- لو في مهام لسه، قوله عددها صراحة.
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
      .select('id, full_name, is_active, role, gender')
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

    // 4.1) action: 'welcome' — ترحيب سريع باسم الطالب ولغة نوعه
    const studentName = short((profile?.full_name || user.email || 'يا بطل').trim().split(/\s+/)[0] || 'يا بطل', 40);
    const gender = (profile?.gender === 'male' || profile?.gender === 'female') ? profile.gender : null;
    const body2Early = await req.json().catch(() => ({}));
    if (body2Early?.action === 'welcome') {
      const reply = gender === 'female'
        ? `أهلاً بيكِ يا ${studentName} — أنا مساعد COMANDO الذكي. أقدر أساعدك تلاقي مادة أو ملف أو موعد، أو أعملك ملخص سريع. اسألي على طول وانتي براحتك.`
        : gender === 'male'
          ? `أهلاً بيك يا ${studentName} — أنا مساعد COMANDO الذكي. أقدر أساعدك تلاقي مادة أو ملف أو موعد، أو أعملك ملخص سريع. اسأل على طول وانت براحتك.`
          : `أهلاً يا ${studentName} — أنا مساعد COMANDO الذكي. أقدر أساعدك تلاقي مادة أو ملف أو موعد، أو أعملك ملخص سريع. اسأل براحتك.`;
      return json({ ok: true, reply, student_name: studentName });
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

    // جلب مهام الطالب — حسب توقيت القاهرة
    const now = new Date();
    const buffer = 2 * 24 * 60 * 60 * 1000; // ± يومين كفايه
    const { data: studyTasks } = await admin
      .from('study_tasks')
      .select('title, task_type, due_at, is_done')
      .eq('user_id', user.id)
      .gte('due_at', new Date(now.getTime() - buffer).toISOString())
      .lt('due_at', new Date(now.getTime() + buffer).toISOString())
      .order('due_at', { ascending: true })
      .limit(30);

    const cairoDatePart = (d: Date | string) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d as any));
    const todayStr = cairoDatePart(new Date());
    const tomorrowStr = cairoDatePart(new Date(Date.now() + 86400000));

    const isTaskToday = (t) => cairoDatePart(t.due_at) === todayStr;
    const isTaskTomorrow = (t) => cairoDatePart(t.due_at) === tomorrowStr;
    const fmt = (d: string) => new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
    const fmtDay = (d: Date) => new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long' }).format(d);

    const todayTaskLines = (studyTasks || [])
      .filter(isTaskToday)
      .map((t) => `${t.is_done ? '[✓]' : '[ ]'} ${short(t.title, 80)}${t.task_type ? ' (' + short(t.task_type, 12) + ')' : ''} — ${fmt(t.due_at)}`)
      .join('\n');

    const tomorrowTaskLines = (studyTasks || [])
      .filter(isTaskTomorrow)
      .map((t) => `${t.is_done ? '[✓]' : '[ ]'} ${short(t.title, 80)}${t.task_type ? ' (' + short(t.task_type, 12) + ')' : ''} — ${fmt(t.due_at)}`)
      .join('\n');

    const todayStats = (() => {
      const today = (studyTasks || []).filter(isTaskToday);
      const done = today.filter((t) => t.is_done).length;
      const total = today.length;
      const remaining = total - done;
      if (total === 0) return 'مافيش مهام مجدولة النهاردة.';
      return `المهام النهاردة: ${total} — منهم ${done} خلصوا، لسا ${remaining}.`;
    })();

    const tomorrowStats = (() => {
      const tomorrow = (studyTasks || []).filter(isTaskTomorrow);
      const done = tomorrow.filter((t) => t.is_done).length;
      const total = tomorrow.length;
      if (total === 0) return 'مافيش مهام مجدولة بكرة.';
      return `المهام بكرة: ${total} — منهم ${done} خلصوا، لسا ${total - done}.`;
    })();

    const tomorrowDate = new Date(Date.now() + 86400000);
    const tasksLines = [
      `النهاردة (${fmtDay(new Date())}):`,
      todayStats,
      todayTaskLines || 'مافيش مهام مجدولة النهاردة',
      '',
      `بكرة (${fmtDay(tomorrowDate)}):`,
      tomorrowStats,
      tomorrowTaskLines || 'مافيش مهام مجدولة بكرة'
    ].join('\n');

    // 5) الرسائل (نعيد استخدام الجسم اللي قرأناه)
    const messages = trimHistory(((body2Early?.messages || []) as ChatMessage[]) || []);
    const lastQuestion = messages[messages.length - 1];
    if (!lastQuestion || lastQuestion.role !== 'user') {
      return json({ ok: false, error: 'اكتب سؤالك.' }, 400);
    }

    // 5.2) هل الطالب طالب/الغى تذكير؟
    const userText = String(lastQuestion.content || '');

    // 5.2.1) إلغاء كل التذكيرات المعلقة للطالب
    if (parseCancelReminder(userText)) {
      const { data: cancelled } = await admin
        .from('ai_reminders')
        .update({ status: 'cancelled' })
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .select('id');
      const n = (cancelled || []).length;
      return json({
        ok: true,
        reply: n > 0
          ? `تم إلغاء ${n === 1 ? 'تذكير واحد' : n + ' تذكيرات'} عندك ✓`
          : 'مفيش عندك تذكيرات معلقة أصلاً.'
      });
    }

    // 5.2.2) إنشاء تذكير جديد
    const reminder = parseReminderIntent(userText);
    if (reminder) {
      // هل الطالب مفعل إشعارات المنصة؟
      const { count: subCount, error: subErr } = await admin
        .from('push_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      const subs = subErr ? 0 : (subCount ?? 0);

      if (subs === 0) {
        return json({
          ok: true,
          reply: `عايز أقولك إني حلو جدًا أرجعلك بمعلومة "${reminder.message}" بعد ${reminder.label} — بس إشعارات المنصة مش مفعلة على الجهاز بتاعك دلوقتي 🔔\n\nلو فعّلتها دلوقتي، هيسجّل التذكير تلقائي وهبعتلك إشعار على التليفون بعد ${reminder.label}.`,
          action: 'enable_notifications',
          pending_reminder: { message: reminder.message, due_at: reminder.dueAt, due_label: reminder.label }
        });
      }

      const { data: created, error: insertErr } = await admin
        .from('ai_reminders')
        .insert({ user_id: user.id, message: reminder.message, due_at: reminder.dueAt })
        .select('id, due_at')
        .single();

      if (insertErr) {
        return json({ ok: false, error: 'حصلت مشكلة وأنا بسجل التذكير — حاول تاني.', detail: insertErr.message }, 500);
      }
      return json({
        ok: true,
        reply: `✓ سجّلت تذكير: «${reminder.message}»\nهنبعتلك إشعار على تليفونك بعد ${reminder.label} ⏰`,
        reminder: { id: created?.id, due_at: created?.due_at }
      });
    }

    const systemPrompt = buildSystemPrompt({
      studentName,
      gender,
      subjects: subjectLines,
      materials: materialLines,
      faq: faqLines,
      announcements: announcementLines,
      quizzes: quizLines,
      knowledge: knowledgeLines,
      tasks: tasksLines
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
