import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';
import { tusUpload } from './tus-upload.js';

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
  return (v / (1024 * 1024)).toFixed(1) + ' MB';
}

export function setUploadProgress(pct, label) {
  const wrap = document.getElementById('upload-progress');
  const fill = document.getElementById('upload-progress-fill');
  const text = document.getElementById('upload-progress-text');
  if (!wrap || !fill || !text) return;
  wrap.classList.remove('hidden');
  wrap.setAttribute('aria-busy', 'true');
  const safe = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  fill.style.width = safe + '%';
  text.textContent = label || safe + '%';
}

export function hideUploadProgress() {
  const wrap = document.getElementById('upload-progress');
  if (wrap) {
    wrap.classList.add('hidden');
    wrap.removeAttribute('aria-busy');
  }
  const fill = document.getElementById('upload-progress-fill');
  if (fill) fill.style.width = '0%';
}

function progressLabel(prefix, pct, loaded, total) {
  return (
    prefix +
    ' ' +
    Math.round(pct) +
    '% · ' +
    formatBytes(loaded) +
    ' / ' +
    formatBytes(total)
  );
}

/** رفع مباشر عبر XHR مع نسبة تقدم حقيقية (مناسب لمعظم الملفات حتى حد الباكت) */
function xhrPutUpload({ path, file, token, apiKey, bucket, onProgress }) {
  return new Promise((resolve, reject) => {
    const base = String(SUPABASE_URL || '').replace(/\/+$/, '');
    const url =
      base +
      '/storage/v1/object/' +
      encodeURIComponent(bucket) +
      '/' +
      path
        .split('/')
        .map((p) => encodeURIComponent(p))
        .join('/');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.responseType = 'text';
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    if (apiKey) xhr.setRequestHeader('apikey', apiKey);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.setRequestHeader('cache-control', '3600');
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);
    else xhr.setRequestHeader('Content-Type', 'application/octet-stream');

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !onProgress) return;
      const pct = file.size ? (e.loaded / file.size) * 100 : 0;
      onProgress(pct, e.loaded, file.size);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100, file.size, file.size);
        resolve(path);
        return;
      }
      let msg = 'تعذر رفع الملف (HTTP ' + xhr.status + ')';
      try {
        const body = JSON.parse(xhr.responseText || '{}');
        msg = body.error || body.message || body.msg || msg;
      } catch {
        if (xhr.responseText) msg = String(xhr.responseText).slice(0, 160);
      }
      if (xhr.status === 413 || /payload|too large|maximum|exceeded|entity too large/i.test(String(msg))) {
        msg =
          'الملف أكبر من حد التخزين على السيرفر. نفّذ supabase/raise_storage_limit.sql في SQL Editor.';
      } else if (xhr.status === 403 || /policy|rls|permission|denied|jwt/i.test(String(msg))) {
        msg = 'مفيش صلاحية رفع. تأكد إن حسابك أدمن وجلسة الدخول لسه شغالة.';
      } else if (xhr.status === 401) {
        msg = 'انتهت الجلسة. سجّل دخول الأدمن تاني.';
      }
      reject(new Error(String(msg)));
    };

    xhr.onerror = () => reject(new Error('انقطع الاتصال أثناء الرفع. تأكد من النت وحاول تاني.'));
    xhr.onabort = () => reject(new Error('اتلغى الرفع.'));
    xhr.ontimeout = () => reject(new Error('انتهت مهلة الرفع. الملف كبير أو النت بطيء — حاول تاني.'));
    // مهلة واسعة للملفات الكبيرة (30 دقيقة)
    xhr.timeout = 30 * 60 * 1000;
    xhr.send(file);
  });
}

/**
 * رفع لـ Supabase Storage مع شريط تقدم ظاهر من أول ثانية.
 * 1) XHR مباشر (تقدم موثوق)
 * 2) لو فشل بسبب الحجم → TUS مقاطع
 * 3) آخر حل: supabase-js upload
 */
export async function uploadWithProgress(path, file, labelPrefix = 'جاري الرفع') {
  setUploadProgress(0, labelPrefix + ' — تجهيز...');

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData?.session;
  if (!session?.access_token) throw new Error('انتهت الجلسة. سجّل دخول تاني.');

  if (!SUPABASE_URL) throw new Error('إعدادات الاتصال ناقصة.');
  if (!file || !file.size) throw new Error('اختَر ملف صالح.');

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      'الملف كبير أوي (' +
        formatBytes(file.size) +
        ') — الحد الأقصى في المنصة ' +
        formatBytes(MAX_UPLOAD_BYTES) +
        '.'
    );
  }

  const token = session.access_token;
  const apiKey = SUPABASE_ANON_KEY || '';
  const onProgress = (pct, loaded, total) => {
    setUploadProgress(pct, progressLabel(labelPrefix, pct, loaded, total || file.size));
  };

  // مسار 1: XHR — يظهر التقدم فورًا ويعمل كويس لحد حد الباكت
  try {
    setUploadProgress(1, labelPrefix + ' 1% · بدء الرفع...');
    await xhrPutUpload({
      path,
      file,
      token,
      apiKey,
      bucket: 'materials',
      onProgress
    });
    setUploadProgress(100, 'اكتمل الرفع 100%');
    return path;
  } catch (xhrErr) {
    const msg = String(xhrErr?.message || xhrErr || '');
    // لو الحجم أو بوابة الشبكة رفضت الجسم كامل، جرّب TUS
    const tryTus =
      /حد التخزين|too large|413|payload|maximum|timeout|مهلة|انقطع/i.test(msg) ||
      file.size > 6 * 1024 * 1024;
    if (!tryTus) throw xhrErr;

    setUploadProgress(2, labelPrefix + ' — تحويل لرفع مجزّأ...');
  }

  // مسار 2: TUS
  try {
    await tusUpload({
      path,
      file,
      token,
      apiKey,
      bucket: 'materials',
      onProgress: (pct, loaded, total) => onProgress(pct, loaded, total)
    });
    setUploadProgress(100, 'اكتمل الرفع 100%');
    return path;
  } catch (tusErr) {
    setUploadProgress(3, labelPrefix + ' — محاولة أخيرة...');
  }

  // مسار 3: SDK (من غير نسبة دقيقة)
  setUploadProgress(5, labelPrefix + ' — رفع عبر المكتبة...');
  const { error } = await supabase.storage.from('materials').upload(path, file, {
    upsert: true,
    contentType: file.type || 'application/octet-stream',
    cacheControl: '3600'
  });
  if (error) {
    const m = String(error.message || error);
    if (/maximum|payload|too large|413|size/i.test(m)) {
      throw new Error(
        'الملف أكبر من حد التخزين على Supabase. نفّذ ملف SQL: supabase/raise_storage_limit.sql'
      );
    }
    if (/policy|permission|rls|denied/i.test(m)) {
      throw new Error('مفيش صلاحية رفع. تأكد إن حسابك أدمن.');
    }
    throw new Error(m || 'تعذر رفع الملف.');
  }
  setUploadProgress(100, 'اكتمل الرفع 100%');
  return path;
}
