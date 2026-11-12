/**
 * رفع ملفات لـ Supabase Storage عبر بروتوكول TUS (Resumable Upload)
 * - مناسب لأي حجم ملف (بما فيه الملفات الكبيرة) — Supabase بتوصي به للملفات الأكبر من 6 ميجا
 * - بيبعث الملف على مقاطع 6 ميجا مع تقدم حقيقي في كل مقطع
 * - لو الاتصال انقطع وسط الرفع، بيحاول يكمل من آخر نقطة حفظ (HEAD عشان المزامنة)
 */
import { SUPABASE_URL } from './supabase.js';

export const TUS_CHUNK_BYTES = 6 * 1024 * 1024; // 6 ميجا — حجم المقطع اللي بتطلبه Supabase

function b64(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function authHeaders(token, apiKey) {
  const h = { 'Tus-Resumable': '1.0.0' };
  if (token) h.Authorization = 'Bearer ' + token;
  if (apiKey) h.apikey = apiKey;
  return h;
}

async function readError(res, fallback) {
  const fallbackMsg = fallback || ('تعذر رفع الملف (HTTP ' + res.status + ')');
  let body = '';
  try { body = await res.text(); } catch { return fallbackMsg; }
  try {
    const json = JSON.parse(body || '{}');
    let msg = json.error || json.message || json.msg || json.detail;
    if (!msg && Array.isArray(json.message)) msg = json.message.join(', ');
    if (!msg) msg = fallbackMsg;
    if (res.status === 413 || /payload|too large|size|maximum|exceeded/i.test(String(msg))) {
      return 'الملف أكبر من الحد المسموح على مساحة التخزين (200 ميجا). قلّل الحجم أو قسّمه.';
    }
    if (res.status === 403 || /policy|rls|permission|denied/i.test(String(msg))) {
      return 'مفيش صلاحية رفع على التخزين. راجع سياسة الأدمن أو الأدمن يفتح مجلد teacher-uploads.';
    }
    return String(msg);
  } catch {
    return body?.trim() ? body.trim().slice(0, 160) : fallbackMsg;
  }
}

/** إنشاء جلسة رفع جديدة عند Supabase — بترجع رابط المقطع */
async function createUpload(url, file, bucket, path, token, apiKey) {
  const metadata = [
    ['bucketName', bucket],
    ['objectName', path],
    ['contentType', file.type || 'application/octet-stream'],
    ['cacheControl', '3600']
  ].map(([k, v]) => k + ' ' + b64(v)).join(',');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeaders(token, apiKey),
      'Upload-Length': String(file.size),
      'Upload-Metadata': metadata,
      'x-upsert': 'false'
    }
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(await readError(res, 'تعذر بدء رفع الملف.'));
  }
  const location = res.headers.get('Location') || res.headers.get('location');
  if (!location) throw new Error('التخزين ما ردّش بمكان الملف. جرّب تاني.');
  return new URL(location, url).href;
}

/** مزامنة المكان الحالي مع السيرفر (مفيد لو الاتصال انقطع وسط رفع مقطع) */
async function serverOffset(location, token, apiKey) {
  try {
    const res = await fetch(location, { method: 'HEAD', headers: authHeaders(token, apiKey) });
    const off = Number(res.headers.get('Upload-Offset'));
    return Number.isFinite(off) ? off : null;
  } catch {
    return null;
  }
}

/** رفع مقطع واحد مع تقدم حقيقي على مستوى البايتات */
function uploadChunk(location, chunk, offset, token, apiKey, onChunkProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PATCH', location, true);
    xhr.responseType = 'text';
    xhr.setRequestHeader('Tus-Resumable', '1.0.0');
    xhr.setRequestHeader('Upload-Offset', String(offset));
    xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    if (apiKey) xhr.setRequestHeader('apikey', apiKey);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      onChunkProgress(e.loaded, chunk.size);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const next = Number(xhr.getResponseHeader('Upload-Offset'));
        resolve(Number.isFinite(next) ? next : offset + chunk.size);
        return;
      }
      let msg = 'تعذر رفع الملف.';
      try {
        const body = JSON.parse(xhr.responseText || '{}');
        msg = body.error || body.message || body.msg || msg;
        if (xhr.status === 413 || /payload|too large|size|maximum|exceeded/i.test(String(msg))) {
          msg = 'الملف أكبر من الحد المسموح على مساحة التخزين (200 ميجا). قلّل الحجم أو قسّمه.';
        } else if (xhr.status === 403 || /policy|rls|permission|denied/i.test(String(msg))) {
          msg = 'مفيش صلاحية رفع على التخزين. راجع سياسة الأدمن أو الأدمن يفتح مجلد teacher-uploads.';
        }
      } catch { /* ignore */ }
      reject(new Error(String(msg)));
    };
    xhr.onerror = () => reject(new Error('انقطع الاتصال أثناء الرفع.'));
    xhr.onabort = () => reject(new Error('اتلغى الرفع.'));
    xhr.send(chunk);
  });
}

/**
 * رفع ملف كامل لـ bucket (افتراضيًا materials)
 * @param {object} args
 *   - path: مسار الملف داخل الـ bucket (مثل: subjects/123/171234_lec1.pdf)
 *   - file: ملف File (من input[type=file])
 *   - token: access_token للمستخدم (null للزوار — سياسة anon)
 *   - apiKey: مفتاح anon/publishable
 *   - bucket: اسم الـ bucket
 *   - onProgress: دالة (percent: 0-100, loadedBytes: number, totalBytes: number)
 */
export async function tusUpload({ path, file, token = null, apiKey = '', bucket = 'materials', onProgress = null }) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) {
    throw new Error('الملف فاضي.');
  }

  const baseUrl = String(SUPABASE_URL || '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('إعدادات الاتصال ناقصة.');
  const endpoint = baseUrl + '/storage/v1/upload/resumable';

  let location = await createUpload(endpoint, file, bucket, path, token, apiKey);

  let offset = 0;
  const total = file.size;
  const report = (loaded) => {
    const done = Math.min(Math.max(loaded, 0), total);
    if (onProgress) onProgress(total ? (done / total) * 100 : 0, done, total);
  };
  report(0);

  while (offset < total) {
    const chunk = file.slice(offset, Math.min(offset + TUS_CHUNK_BYTES, total));
    // قبل كل مقطع: حاول تزامن مع السيرفر (لو حصل قطع أو تأخر في الرد)
    const serverOff = await serverOffset(location, token, apiKey);
    if (Number.isFinite(serverOff) && serverOff !== offset) {
      offset = serverOff;
      report(offset);
      if (offset >= total) break;
      continue;
    }

    let attempt = 0;
    let lastError = null;
    while (attempt < 3) {
      attempt += 1;
      try {
        const next = await uploadChunk(
          location,
          chunk,
          offset,
          token,
          apiKey,
          (loaded) => report(offset + loaded)
        );
        offset = next;
        report(offset);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const synced = await serverOffset(location, token, apiKey);
        if (Number.isFinite(synced) && synced > offset) {
          offset = synced;
          report(offset);
          lastError = null;
          break; // المقطع راح للسيرفر فعلاً — كمل من المقطع اللي بعده
        }
        if (attempt >= 3) throw err;
      }
    }
    if (lastError) throw lastError;
  }

  report(total);
  return path;
}
