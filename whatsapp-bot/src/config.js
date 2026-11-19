'use strict';

const fs = require('fs');
const path = require('path');

// تصدير .env لو موجود بنفس المجلد
function loadDotEnv(dotEnvPath) {
  const out = {};
  try {
    if (!fs.existsSync(dotEnvPath)) return out;
    const content = fs.readFileSync(dotEnvPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch (err) {
    console.warn('[config] تعذر قراءة .env:', err.message);
  }
  return out;
}

function bool(value, fallback) {
  if (value === undefined) return fallback;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}

function int(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function required(key, value) {
  const v = (value || '').trim();
  if (!v) {
    throw new Error(
      `[config] المتغير "${key}" ناقص.\n` +
        `انسخ .env.example إلى .env ثم عدل القيم. راجع README.md للمساعدة.`
    );
  }
  return v;
}

/* يقبل رابط الدعوة كامل أو الكود فقط — يرجع الكود الصافي */
function parseInviteCode(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  const m = v.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i);
  return m ? m[1] : v;
}

// المسار الأساسي للمشروع (المجلد اللي فيه هذا الملف)

const ROOT = path.resolve(__dirname, '..');
const dotEnv = loadDotEnv(path.join(ROOT, '.env'));

// يدعم أي من الاسمين: os.environ دائماً يغطي على .env
const env = (key) => process.env[key] || dotEnv[key];

const config = {
  root: ROOT,
  /* مسارات قابلة للتخصيص عبر البيئة — مهمة للاستضافة (ديسك دائم) */
  logsDir: (env('LOG_DIR') || path.join(ROOT, 'logs')),
  sentStorePath: (env('SENT_STORE_PATH') || path.join(ROOT, 'sent.json')),
  authDir: (env('AUTH_DIR') || path.join(ROOT, '.wwebjs_auth')),

  // المنصة
  platformUrl: (env('PLATFORM_URL') || 'https://comando-files.vercel.app').replace(/\/+$/, ''),

  // Supabase
  supabaseUrl: required('SUPABASE_URL', env('SUPABASE_URL') || 'https://bmqqacvgtevogcuqfryq.supabase.co'),
  /* الـ placeholder الافتراضي في .env يُعامل كقيمة ناقصة بدل ما يروح للسيرفر فيرد 401 */
  supabaseServiceRoleKey:
    (env('SUPABASE_SERVICE_ROLE_KEY') || '').trim() === 'PASTE_YOUR_SERVICE_ROLE_KEY_HERE'
      ? ''
      : (env('SUPABASE_SERVICE_ROLE_KEY') || '').trim(),

  // الجروب المستهدف — أي من الاثنين يكفي
  targetGroupId: (env('TARGET_GROUP_ID') || '').trim(),
  targetGroupName: (env('TARGET_GROUP_NAME') || '').trim(),
  targetGroupNames: (env('TARGET_GROUP_NAMES') || '').split(',').map((s) => s.trim()).filter(Boolean),
  // رابط/كود دعوة الجروب — يُستخدم مرة واحدة للانضمام عبر join-group
  groupInviteCode: parseInviteCode(env('GROUP_INVITE_CODE')),

  // الباك إند
  pollIntervalSeconds: int(env('POLL_INTERVAL_SECONDS'), 20, 5, 600),
  maxContentChars: int(env('MAX_CONTENT_CHARS'), 3500, 500, 6000),
  maxRetries: int(env('MAX_RETRIES'), 5, 1, 20),
  sendMedia: bool(env('SEND_MEDIA'), true),
  /* أول تشغيل: لو true — يبعت كل الإعلانات والإشعارات القديمة الموجودة.
     الافتراضي false — يعلّمها كـ "اتبعتت" عشان يبعت الجديدة بس. */
  sendOnFirstRun: bool(env('SEND_ON_FIRST_RUN'), false),
};

// تشخيص أولي
if (!config.supabaseServiceRoleKey) {
  console.warn(
    '[config] SUPABASE_SERVICE_ROLE_KEY مش موجود — البوت مش هيقرا بيانات المنصة.\n' +
      '         Dashboard → Project Settings → API → service_role key (secret).'
  );
}

module.exports = config;
