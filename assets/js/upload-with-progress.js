import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';

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
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  fill.style.width = safe + '%';
  text.textContent = label || safe + '%';
}

export function hideUploadProgress() {
  const wrap = document.getElementById('upload-progress');
  if (wrap) wrap.classList.add('hidden');
  const fill = document.getElementById('upload-progress-fill');
  if (fill) fill.style.width = '0%';
}

/** رفع لـ Supabase Storage مع نسبة تقدّم */
export async function uploadWithProgress(path, file, labelPrefix = 'جاري الرفع') {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData?.session;
  if (!session?.access_token) throw new Error('انتهت الجلسة. سجّل دخول تاني.');

  const baseUrl = String(SUPABASE_URL || '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('إعدادات الاتصال ناقصة.');

  const url =
    baseUrl +
    '/storage/v1/object/materials/' +
    path
      .split('/')
      .map((p) => encodeURIComponent(p))
      .join('/');

  const contentType = file.type || 'application/octet-stream';
  const apiKey = SUPABASE_ANON_KEY || '';

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.responseType = 'text';
    xhr.setRequestHeader('Authorization', 'Bearer ' + session.access_token);
    if (apiKey) xhr.setRequestHeader('apikey', apiKey);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) {
        setUploadProgress(0, labelPrefix + '…');
        return;
      }
      const pct = (e.loaded / e.total) * 100;
      setUploadProgress(
        pct,
        labelPrefix +
          ' ' +
          Math.round(pct) +
          '% · ' +
          formatBytes(e.loaded) +
          ' / ' +
          formatBytes(e.total)
      );
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setUploadProgress(100, 'اكتمل الرفع 100%');
        resolve(path);
        return;
      }
      let msg = 'تعذر رفع الملف.';
      try {
        const body = JSON.parse(xhr.responseText || '{}');
        msg = body.error || body.message || body.msg || msg;
        if (
          body.statusCode === 413 ||
          /payload|too large|size|maximum/i.test(String(msg))
        ) {
          msg =
            'الملف أكبر من الحد المسموح على السيرفر. نفّذ supabase/raise_storage_limit.sql أو زوّد الحد من Storage.';
        }
      } catch {}
      reject(new Error(msg));
    };

    xhr.onerror = () => reject(new Error('انقطع الاتصال أثناء الرفع. حاول تاني.'));
    xhr.onabort = () => reject(new Error('اتلغى الرفع.'));
    setUploadProgress(0, labelPrefix + '…');
    xhr.send(file);
  });
}
