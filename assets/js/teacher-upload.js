/**
 * Teacher upload portal — token only, no login, single subject.
 */
import { supabase, SUPABASE_ANON_KEY } from './supabase.js';
import { showToast } from './utils.js';
import { tusUpload } from './tus-upload.js';

const TYPE_LABELS = {
  lecture: 'المحاضرات',
  section: 'السكاشن',
  assignment: 'الواجبات',
  summary: 'ملخصات المادة',
  past_exam: 'امتحانات سابقة'
};

const token = new URLSearchParams(window.location.search).get('t') || '';
let context = null;

function show(id) {
  ['state-loading', 'state-error', 'state-form', 'state-done'].forEach((key) => {
    document.getElementById(key)?.classList.toggle('hidden', key !== id);
  });
}

function showError(message) {
  const el = document.getElementById('state-error');
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
  document.getElementById('state-loading')?.classList.add('hidden');
  document.getElementById('state-form')?.classList.add('hidden');
}

async function init() {
  if (!token || token.length < 16) {
    showError('الرابط غير صالح. اطلب رابط جديد من إدارة المنصة.');
    return;
  }

  try {
    const { data, error } = await supabase.rpc('get_teacher_upload_context', {
      p_token: token
    });
    if (error) throw error;
    const result = typeof data === 'string' ? JSON.parse(data) : data;
    if (!result?.ok) {
      showError('الرابط منتهي أو غير مفعّل. تواصل مع الأدمن.');
      return;
    }
    context = result;
    document.getElementById('subject-title').textContent = result.subject_name || 'رفع ملف';
    const meta = [];
    if (result.subject_code) meta.push(result.subject_code);
    if (result.label) meta.push(result.label);
    meta.push('رفع ملفات فقط لهذه المادة');
    document.getElementById('subject-meta').textContent = meta.join(' · ');

    const select = document.getElementById('material_type');
    const types = Array.isArray(result.allowed_types) && result.allowed_types.length
      ? result.allowed_types
      : ['lecture'];
    select.innerHTML = types
      .map((t) => `<option value="${escapeAttr(t)}">${TYPE_LABELS[t] || t}</option>`)
      .join('');

    show('state-form');
    document.getElementById('upload-form')?.addEventListener('submit', onSubmit);
    document.getElementById('again-btn')?.addEventListener('click', () => {
      document.getElementById('upload-form')?.reset();
      show('state-form');
    });
  } catch (err) {
    console.error(err);
    showError('تعذر فتح رابط الرفع. لو المشكلة مستمرة، الأدمن يحتاج ينفّذ إعدادات قاعدة البيانات.');
  }
}

function escapeAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** رفع لـ Supabase Storage عبر TUS (resumable) عشان يظهر تقدم حقيقي مهما كان حجم الملف */
function uploadWithProgress(path, file, onProgress) {
  if (file.size > 200 * 1024 * 1024) {
    return Promise.reject(new Error('الملف أكبر من الحد المسموح على التخزين (200 ميجا). قلّل الحجم أو قسّمه.'));
  }
  return tusUpload({
    path,
    file,
    token: null,
    apiKey: SUPABASE_ANON_KEY || '',
    bucket: 'materials',
    onProgress: (pct, loaded, total) => onProgress(pct, loaded, total)
  });
}

function setUploadProgress(pct, loaded, total) {
  const wrap = document.getElementById('upload-progress');
  const fill = document.getElementById('upload-progress-fill');
  const text = document.getElementById('upload-progress-text');
  if (!wrap || !fill || !text) return;
  wrap.classList.remove('hidden');
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  fill.style.width = safe + '%';
  const mb = (n) => (Number(n) || 0) / (1024 * 1024);
  text.textContent = `${safe}% · ${mb(loaded).toFixed(1)} / ${mb(total).toFixed(1)} MB`;
}

function hideUploadProgress() {
  const wrap = document.getElementById('upload-progress');
  if (wrap) wrap.classList.add('hidden');
  const fill = document.getElementById('upload-progress-fill');
  if (fill) fill.style.width = '0%';
  const text = document.getElementById('upload-progress-text');
  if (text) text.textContent = '0%';
}

async function onSubmit(event) {
  event.preventDefault();
  if (!context) return;

  const title = document.getElementById('title').value.trim();
  const description = document.getElementById('description').value.trim();
  const materialType = document.getElementById('material_type').value;
  const file = document.getElementById('file').files?.[0];
  const btn = document.getElementById('submit-btn');

  if (!title) {
    showToast('اكتب اسم الملف.', 'error');
    return;
  }
  if (!file) {
    showToast('اختار الملف.', 'error');
    return;
  }

  const allowed = /\.(pdf|doc|docx|ppt|pptx|zip|rar|jpg|jpeg|png|webp|xls|xlsx)$/i;
  if (!allowed.test(file.name)) {
    showToast('نوع الملف مش مدعوم.', 'error');
    return;
  }

  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = 'جاري الرفع…';
  hideUploadProgress();

  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `teacher-uploads/${token.slice(0, 12)}/${Date.now()}_${safeName}`;

    await uploadWithProgress(path, file, (pct, loaded, total) => {
      setUploadProgress(pct, loaded, total);
    });

    const { data, error } = await supabase.rpc('submit_teacher_material', {
      p_token: token,
      p_title: title,
      p_description: description || null,
      p_material_type: materialType,
      p_file_path: path,
      p_file_name: file.name,
      p_file_type: file.type || file.name.split('.').pop() || null,
      p_file_size: file.size
    });
    if (error) {
      await supabase.storage.from('materials').remove([path]).catch(() => {});
      throw error;
    }
    const result = typeof data === 'string' ? JSON.parse(data) : data;
    if (!result?.ok) {
      await supabase.storage.from('materials').remove([path]).catch(() => {});
      throw new Error(result?.error || 'save_failed');
    }

    showToast('تم رفع الملف.', 'success');
    hideUploadProgress();
    show('state-done');
  } catch (err) {
    console.error(err);
    const msg = String(err?.message || err || '');
    if (/row-level security|policy|403|unauthorized/i.test(msg)) {
      showToast('مفيش صلاحية رفع. الأدمن محتاج يضبط سياسة التخزين (teacher-uploads).', 'error');
    } else if (/material_type|check constraint/i.test(msg)) {
      showToast('نوع الملف غير مسموح في قاعدة البيانات. نفّذ SQL الخاص بـ summary.', 'error');
    } else {
      showToast('فشل الرفع. حاول مرة أخرى أو تأكد إن الرابط لسه شغال.', 'error');
    }
  } finally {
    hideUploadProgress();
    btn.disabled = false;
    btn.textContent = prev;
  }
}

init();
