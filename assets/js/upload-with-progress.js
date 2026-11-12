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

/** رفع لـ Supabase Storage عبر TUS (resumable) مع نسبة تقدّم حقيقية — مناسب لأي حجم ملف */
export async function uploadWithProgress(path, file, labelPrefix = 'جاري الرفع') {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData?.session;
  if (!session?.access_token) throw new Error('انتهت الجلسة. سجّل دخول تاني.');

  if (!SUPABASE_URL) throw new Error('إعدادات الاتصال ناقصة.');

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('الملف كبير أوي (' + formatBytes(file.size) + ') — الحد الأقصى ' + formatBytes(MAX_UPLOAD_BYTES) + '.');
  }

  await tusUpload({
    path,
    file,
    token: session.access_token,
    apiKey: SUPABASE_ANON_KEY || '',
    bucket: 'materials',
    onProgress: (pct, loaded) => {
      setUploadProgress(
        pct,
        labelPrefix +
          ' ' +
          Math.round(pct) +
          '% · ' +
          formatBytes(loaded) +
          ' / ' +
          formatBytes(file.size)
      );
    }
  });

  setUploadProgress(100, 'اكتمل الرفع 100%');
  return path;
}
