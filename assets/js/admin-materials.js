import { supabase } from './supabase.js';
import { protectAdminPage } from './auth.js';
import { escapeHtml, formatFileSize, showEmpty, showError, showToast, withLoading, initIcons, timeAgo } from './utils.js';

let profile = null;
let subjectNames = new Map();
let attachTargetId = null;
let materialsCache = [];
let editingId = null;
let editingOriginal = null;

const typeLabels = {
  lecture: 'المحاضرات',
  section: 'السكاشن',
  assignment: 'الواجبات',
  past_exam: 'امتحانات سابقة',
  summary: 'ملخصات المادة',
  notes: 'المحاضرات',
  exam: 'المحاضرات',
  other: 'المحاضرات',
  pdf: 'المحاضرات',
  slides: 'المحاضرات'
};

async function notifyAssignmentSafe(opts) {
  try {
    const mod = await import('./assignment-notify.js');
    if (typeof mod.notifyAssignmentToStudents === 'function') {
      await mod.notifyAssignmentToStudents(opts);
    }
  } catch (err) {
    console.warn('[NUSC] assignment notify skipped:', err);
  }
}

function updateDueDateVisibility() {
  const isAssignment = document.getElementById('material_type').value === 'assignment';
  document.getElementById('due-date-group').classList.toggle('hidden', !isAssignment);
}

function formatDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function setDeliveredUI(delivered) {
  const flag = document.getElementById('is_delivered');
  const hint = document.getElementById('delivered-hint');
  const dueHint = document.getElementById('due-hint');
  const btn = document.getElementById('mark-delivered');
  if (flag) flag.value = delivered ? '1' : '0';
  if (hint) hint.classList.toggle('hidden', !delivered);
  if (dueHint) dueHint.classList.toggle('hidden', !!delivered);
  if (btn) {
    btn.textContent = delivered ? 'إلغاء تم التسليم' : 'تم التسليم';
    btn.classList.toggle('btn-primary', !delivered);
    btn.classList.toggle('btn-outline', !!delivered);
  }
}

function isDeliveredFlag() {
  return document.getElementById('is_delivered')?.value === '1';
}

function normalizeSubmissionUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

function readPublishState() {
  const published = document.getElementById('is_published')?.checked !== false;
  const raw = document.getElementById('publish_at')?.value || '';
  let publishAt = null;
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) publishAt = d.toISOString();
  }
  return { is_published: published, publish_at: publishAt };
}

function resetFormMode() {
  editingId = null;
  editingOriginal = null;
  document.getElementById('edit_id').value = '';
  document.getElementById('form-heading').textContent = 'رفع ملف جديد';
  document.getElementById('submit-btn').textContent = 'ارفع الملف';
  document.getElementById('file-label').textContent = 'الملف *';
  document.getElementById('file').required = true;
  document.getElementById('mat-form').reset();
  const noteReset = document.getElementById('admin_note');
  if (noteReset) noteReset.value = '';
  document.getElementById('material_type').value = 'lecture';
  document.getElementById('due_at').value = '';
  const subUrlReset = document.getElementById('submission_url');
  if (subUrlReset) subUrlReset.value = '';
  const pub = document.getElementById('is_published');
  if (pub) pub.checked = true;
  const pat = document.getElementById('publish_at');
  if (pat) pat.value = '';
  setDeliveredUI(false);
  updateDueDateVisibility();
}

function openCreateForm() {
  resetFormMode();
  document.getElementById('form-panel').classList.remove('hidden');
  document.getElementById('title').focus();
}

function openEditForm(item) {
  editingId = item.id;
  editingOriginal = item;
  document.getElementById('edit_id').value = item.id;
  document.getElementById('form-heading').textContent = 'تعديل ملف';
  document.getElementById('submit-btn').textContent = 'حفظ التعديلات';
  document.getElementById('file-label').textContent = 'استبدال الملف (اختياري)';
  document.getElementById('file').required = false;
  document.getElementById('file').value = '';
  document.getElementById('solution_image').value = '';
  document.getElementById('title').value = item.title || '';
  document.getElementById('subject_id').value = item.subject_id || '';
  document.getElementById('material_type').value = item.material_type || 'lecture';
  document.getElementById('description').value = item.description || '';
  const noteEl = document.getElementById('admin_note');
  if (noteEl) noteEl.value = item.admin_note || '';
  document.getElementById('due_at').value = formatDateTimeLocal(item.due_at);
  const subUrlEdit = document.getElementById('submission_url');
  if (subUrlEdit) subUrlEdit.value = item.submission_url || '';
  const pubEdit = document.getElementById('is_published');
  if (pubEdit) pubEdit.checked = item.is_published !== false;
  const patEdit = document.getElementById('publish_at');
  if (patEdit) patEdit.value = formatDateTimeLocal(item.publish_at);
  setDeliveredUI(!!item.is_delivered);
  updateDueDateVisibility();
  document.getElementById('form-panel').classList.remove('hidden');
  document.getElementById('form-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const isAssignment = (item.material_type || '') === 'assignment';
  if (isAssignment) document.getElementById('due_at')?.focus();
  else document.getElementById('title').focus();
}

async function init() {
  try {
    document.documentElement.classList.remove('admin-auth-pending');
  } catch {}
  const result = await protectAdminPage();
  if (!result) return;
  try {
    document.documentElement.classList.remove('admin-auth-pending');
  } catch {}
  profile = result.profile;
  initIcons();

  document.getElementById('add-btn')?.addEventListener('click', openCreateForm);
  document.getElementById('cancel-btn')?.addEventListener('click', () => {
    document.getElementById('form-panel').classList.add('hidden');
    resetFormMode();
  });
  document.getElementById('mat-form').addEventListener('submit', save);
  document.getElementById('material_type').addEventListener('change', updateDueDateVisibility);
  document.getElementById('clear-due-at')?.addEventListener('click', () => {
    document.getElementById('due_at').value = '';
    showToast('اتمسّح الموعد من النموذج. احفظ التعديلات عشان يثبت.', 'info');
  });
  document.getElementById('mark-delivered')?.addEventListener('click', () => {
    const next = !isDeliveredFlag();
    setDeliveredUI(next);
    showToast(
      next
        ? 'اتعلّم الحالة «تم التسليم». احفظ التعديلات عشان تظهر للطالب.'
        : 'اتشالت حالة «تم التسليم». احفظ التعديلات.',
      'info'
    );
  });
  document.getElementById('solution-attach-input')?.addEventListener('change', onAttachSolution);
  try {
    await loadSubjects();
  } catch (err) {
    console.error(err);
    showToast('تعذر تحميل قائمة المواد.', 'error');
  }
  try {
    await load();
  } catch (err) {
    console.error(err);
    showError(document.getElementById('list'), 'مش قادرين نحمّل الملفات.');
  }
}

async function loadSubjects() {
  const { data, error } = await supabase.from('subjects').select('id, name').order('name');
  if (error) throw error;
  const select = document.getElementById('subject_id');
  (data || []).forEach((subject) => {
    subjectNames.set(subject.id, subject.name);
    const option = document.createElement('option');
    option.value = subject.id;
    option.textContent = subject.name;
    select.appendChild(option);
  });
}

function isMissingMaterialColumn(error, column) {
  const text = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return (
    text.includes(`could not find the '${column.toLowerCase()}' column`) ||
    text.includes(`column "${column.toLowerCase()}" does not exist`) ||
    text.includes(`column ${column.toLowerCase()} does not exist`) ||
    text.includes(`materials.${column.toLowerCase()}`)
  );
}

async function insertMaterial(payload) {
  const candidate = { ...payload };
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await supabase.from('materials').insert(candidate).select('id, title, subject_id').single();
    if (!result.error) return result;
    if (candidate.created_by && isMissingMaterialColumn(result.error, 'created_by')) {
      candidate.uploaded_by = candidate.created_by;
      delete candidate.created_by;
      continue;
    }
    if (String(result.error.message || '').toLowerCase().includes('uploaded_by') && result.error.code === '23502' && profile?.id) {
      candidate.uploaded_by = profile.id;
      continue;
    }
    if (isMissingMaterialColumn(result.error, 'uploaded_by') && Object.prototype.hasOwnProperty.call(candidate, 'uploaded_by')) {
      delete candidate.uploaded_by;
      continue;
    }
    const optionalColumns = [
      'description', 'admin_note', 'file_name', 'file_type', 'file_size', 'material_type',
      'is_published', 'publish_at', 'created_by', 'solution_image_path', 'due_at', 'is_delivered', 'is_pinned', 'submission_url'
    ];
    const missingOptional = optionalColumns.find(
      (column) => Object.prototype.hasOwnProperty.call(candidate, column) && isMissingMaterialColumn(result.error, column)
    );
    if (missingOptional) {
      delete candidate[missingOptional];
      continue;
    }
    return result;
  }
  return { data: null, error: { message: 'تعذر حفظ سجل الملف بسبب اختلاف أعمدة قاعدة البيانات.' } };
}

async function updateMaterial(id, payload) {
  const candidate = { ...payload };
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await supabase.from('materials').update(candidate).eq('id', id).select('id').single();
    if (!result.error) return result;
    const optionalColumns = [
      'description', 'admin_note', 'file_name', 'file_type', 'file_size', 'material_type',
      'is_published', 'publish_at', 'solution_image_path', 'file_path', 'due_at', 'is_delivered', 'is_pinned', 'submission_url'
    ];
    const missingOptional = optionalColumns.find(
      (column) => Object.prototype.hasOwnProperty.call(candidate, column) && isMissingMaterialColumn(result.error, column)
    );
    if (missingOptional) {
      delete candidate[missingOptional];
      continue;
    }
    return result;
  }
  return { data: null, error: { message: 'تعذر تحديث سجل الملف.' } };
}

async function uploadSolutionImage(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `solutions/${profile.id}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from('materials').upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false
  });
  if (error) throw error;
  return path;
}

async function load() {
  const el = document.getElementById('list');
  try {
    let result = await supabase
      .from('materials')
      .select('id, title, description, admin_note, subject_id, material_type, file_type, file_path, file_name, file_size, solution_image_path, due_at, is_delivered, is_pinned, submission_url, created_at, is_published, publish_at, download_count')
      .order('created_at', { ascending: false })
      .limit(100);

    if (result.error && /description|file_name|due_at|is_delivered|admin_note|is_pinned|submission_url|publish_at|download_count/i.test(String(result.error.message || ''))) {
      result = await supabase
        .from('materials')
        .select('id, title, subject_id, material_type, file_type, file_path, file_size, solution_image_path, created_at, is_published')
        .order('created_at', { ascending: false })
        .limit(100);
    }
    if (result.error) throw result.error;

    let data = result.data || [];
    data = data.slice().sort((a, b) => {
      const pinA = a.is_pinned ? 1 : 0;
      const pinB = b.is_pinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    materialsCache = data;
    if (!data.length) {
      showEmpty(el, 'لسه مفيش ملفات مرفوعة. اضغط «رفع ملف» عشان تبدأ.');
      return;
    }

    el.innerHTML = data
      .map((item) => {
        const label = typeLabels[item.material_type] || 'المحاضرات';
        const isAssignment = item.material_type === 'assignment';
        const hasSolution = !!item.solution_image_path;
        const hasSubmitLink = !!item.submission_url;
        let statusBadge = '<span class="badge badge-success">منشور</span>';
        if (item.is_published === false) statusBadge = '<span class="badge badge-warning">مسودة</span>';
        else if (item.publish_at && new Date(item.publish_at).getTime() > Date.now()) {
          statusBadge =
            '<span class="badge badge-primary">مجدول: ' +
            escapeHtml(new Date(item.publish_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })) +
            '</span>';
        }
        return `<article class="card mb-2">
          <div class="flex justify-between items-center flex-wrap gap-1">
            <div>
              <h3 class="card-title">${item.is_pinned ? '📌 ' : ''}${escapeHtml(item.title)}</h3>
              <p class="text-sm text-muted">${escapeHtml(subjectNames.get(item.subject_id) || 'مادة غير محددة')} · ${label}</p>
              <p class="text-sm text-muted">${escapeHtml(item.file_type || 'ملف')} ${item.file_size ? '· ' + escapeHtml(formatFileSize(item.file_size)) : ''} · ${escapeHtml(timeAgo(item.created_at))}</p>
              <p class="text-sm mt-1">${statusBadge}</p>
              ${isAssignment ? (
                item.is_delivered
                  ? `<p class="text-sm mt-1"><span class="badge badge-success">تم التسليم</span></p>`
                  : item.due_at
                    ? `<p class="text-sm mt-1"><strong>آخر موعد للتسليم:</strong> ${escapeHtml(new Date(item.due_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }))}</p>`
                    : `<p class="text-sm mt-1 text-muted">مفيش موعد تسليم محدد</p>`
              ) : ''}
              ${item.admin_note ? `<p class="text-sm mt-1"><span class="badge badge-warning">${escapeHtml(item.admin_note)}</span></p>` : ''}
              ${hasSolution ? '<p class="text-sm mt-1"><span class="badge badge-success">فيه صورة حل</span></p>' : ''}
              ${hasSubmitLink ? '<p class="text-sm mt-1"><span class="badge badge-primary">فيه رابط تسليم</span></p>' : ''}
              ${item.download_count ? `<p class="text-sm mt-1 text-muted">تنزيلات: ${escapeHtml(String(item.download_count))}</p>` : ''}
            </div>
            <div class="flex gap-1 flex-wrap">
              ${isAssignment ? (item.is_delivered
                ? `<button type="button" class="btn btn-sm btn-outline" data-toggle-delivered="${item.id}" data-delivered="1">إلغاء تم التسليم</button>`
                : `<button type="button" class="btn btn-sm btn-primary" data-toggle-delivered="${item.id}" data-delivered="0">تم التسليم</button>`) : ''}
              ${isAssignment ? `<button type="button" class="btn btn-sm btn-outline" data-edit-due="${item.id}">تعديل الموعد</button>` : ''}
              <button type="button" class="btn btn-sm btn-outline" data-pin="${item.id}" data-pinned="${item.is_pinned ? '1' : '0'}">${item.is_pinned ? 'إلغاء التثبيت' : 'تثبيت'}</button>
              <button type="button" class="btn btn-sm btn-outline" data-edit="${item.id}">تعديل</button>
              ${isAssignment && !hasSolution ? `<button type="button" class="btn btn-sm btn-outline" data-attach-solution="${item.id}">صورة الحل</button>` : ''}
              <button type="button" class="btn btn-sm btn-danger" data-delete="${item.id}">حذف</button>
            </div>
          </div>
        </article>`;
      })
      .join('');

    el.querySelectorAll('[data-pin]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.pin;
        const currently = button.dataset.pinned === '1';
        const next = !currently;
        button.disabled = true;
        try {
          const { error } = await supabase.from('materials').update({ is_pinned: next }).eq('id', id);
          if (error) {
            if (isMissingMaterialColumn(error, 'is_pinned')) {
              showToast('نفّذ SQL: ALTER TABLE materials ADD COLUMN is_pinned BOOLEAN DEFAULT false;', 'error');
            } else showToast(error.message || 'تعذر تحديث التثبيت.', 'error');
            return;
          }
          showToast(next ? 'الملف اتثبّت فوق.' : 'اتشال التثبيت.', 'success');
          await load();
        } catch (err) {
          console.error(err);
          showToast('تعذر تحديث التثبيت.', 'error');
        } finally {
          button.disabled = false;
        }
      });
    });

    el.querySelectorAll('[data-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = materialsCache.find((entry) => String(entry.id) === String(button.dataset.edit));
        if (item) openEditForm(item);
      });
    });

    el.querySelectorAll('[data-toggle-delivered]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.toggleDelivered;
        const currently = button.dataset.delivered === '1';
        const next = !currently;
        button.disabled = true;
        try {
          const { error } = await supabase.from('materials').update({ is_delivered: next }).eq('id', id);
          if (error) {
            if (isMissingMaterialColumn(error, 'is_delivered')) showToast('لازم تضيف عمود is_delivered في Supabase.', 'error');
            else showToast(error.message || 'تعذر تحديث الحالة.', 'error');
            return;
          }
          showToast(next ? 'اتعلّم: تم التسليم.' : 'اتشالت حالة تم التسليم.', 'success');
          await load();
        } catch (err) {
          console.error(err);
          showToast('تعذر تحديث الحالة.', 'error');
        } finally {
          button.disabled = false;
        }
      });
    });

    el.querySelectorAll('[data-edit-due]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = materialsCache.find((entry) => String(entry.id) === String(button.dataset.editDue));
        if (item) openEditForm(item);
      });
    });
    el.querySelectorAll('[data-attach-solution]').forEach((button) => {
      button.addEventListener('click', () => {
        attachTargetId = button.dataset.attachSolution;
        document.getElementById('solution-attach-input').click();
      });
    });
    el.querySelectorAll('[data-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('متأكد تحذف الملف ده؟')) return;
        const id = button.dataset.delete;
        const item = materialsCache.find((entry) => String(entry.id) === String(id));
        const { error: deleteError } = await supabase.from('materials').delete().eq('id', id);
        if (deleteError) {
          showToast(deleteError.message, 'error');
          return;
        }
        const paths = [];
        if (item?.file_path) paths.push(item.file_path);
        if (item?.solution_image_path) paths.push(item.solution_image_path);
        if (paths.length) {
          const { error: storageError } = await supabase.storage.from('materials').remove(paths);
          if (storageError) console.warn('Storage cleanup failed:', storageError.message);
        }
        showToast('الملف اتحذف.', 'success');
        await load();
      });
    });
  } catch (error) {
    console.error('Material list load failed:', error);
    showError(el, 'مش قادرين نحمّل الملفات. راجع اتصال قاعدة البيانات والصلاحيات.');
  }
}

async function onAttachSolution(event) {
  const file = event.target.files?.[0];
  const materialId = attachTargetId;
  attachTargetId = null;
  event.target.value = '';
  if (!file || !materialId) return;
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    showToast('اختار صورة JPG أو PNG أو WebP.', 'error');
    return;
  }
  try {
    const path = await uploadSolutionImage(file);
    const { data: existing } = await supabase.from('materials').select('solution_image_path').eq('id', materialId).maybeSingle();
    const { error } = await supabase.from('materials').update({ solution_image_path: path }).eq('id', materialId);
    if (error) {
      await supabase.storage.from('materials').remove([path]);
      showToast(error.message || 'تعذر حفظ صورة الحل.', 'error');
      return;
    }
    if (existing?.solution_image_path && existing.solution_image_path !== path) {
      await supabase.storage.from('materials').remove([existing.solution_image_path]).catch(() => {});
    }
    showToast('تم حفظ صورة الحل.', 'success');
    const mat = materialsCache.find((entry) => String(entry.id) === String(materialId));
    if (mat && mat.material_type === 'assignment') {
      await notifyAssignmentSafe({
        subjectId: mat.subject_id,
        subjectName: subjectNames.get(mat.subject_id) || '',
        hasSolution: true,
        dueAt: mat.due_at || null,
        isNew: false
      });
    }
    await load();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'فشل رفع صورة الحل.', 'error');
  }
}

async function save(event) {
  event.preventDefault();
  const title = document.getElementById('title').value.trim();
  const subjectId = document.getElementById('subject_id').value;
  const materialType = document.getElementById('material_type').value;
  const description = document.getElementById('description').value.trim() || null;
  const adminNote = document.getElementById('admin_note')?.value.trim() || null;
  const file = document.getElementById('file').files?.[0];
  const solutionFile = document.getElementById('solution_image').files?.[0];
  const dueAtValue = document.getElementById('due_at').value;
  const dueAt = materialType === 'assignment' && dueAtValue ? new Date(dueAtValue).toISOString() : null;
  const isDelivered = materialType === 'assignment' && isDeliveredFlag();
  const pub = readPublishState();
  let submissionUrl = null;
  if (materialType === 'assignment') {
    const raw = document.getElementById('submission_url')?.value || '';
    if (raw.trim()) {
      submissionUrl = normalizeSubmissionUrl(raw);
      if (!submissionUrl) {
        showToast('رابط التسليم مش صحيح. لازم يبدأ بـ https://', 'error');
        return;
      }
    }
  }

  if (!title) { showToast('اكتب اسم الملف.', 'error'); return; }
  if (!subjectId) { showToast('اختار المادة الأول.', 'error'); return; }

  const allowed = /\.(pdf|doc|docx|ppt|pptx|zip|rar|jpg|jpeg|png|webp|xls|xlsx)$/i;
  if (file && !allowed.test(file.name)) {
    showToast('نوع الملف ده مش مدعوم.', 'error');
    return;
  }
  if (!editingId && !file) {
    showToast('اختار الملف اللي هترفعه.', 'error');
    return;
  }
  if (solutionFile && !/^image\/(jpeg|png|webp)$/i.test(solutionFile.type) && !/\.(jpe?g|png|webp)$/i.test(solutionFile.name)) {
    showToast('صورة الحل لازم تكون JPG أو PNG أو WebP.', 'error');
    return;
  }

  await withLoading(event.target.querySelector('[type=submit]'), async () => {
    if (editingId) {
      const payload = {
        title,
        description,
        admin_note: adminNote,
        subject_id: subjectId,
        material_type: materialType,
        due_at: dueAt,
        is_delivered: isDelivered,
        submission_url: submissionUrl,
        is_published: pub.is_published,
        publish_at: pub.publish_at
      };

      let newPath = null;
      let newSolutionPath = null;
      const oldPath = editingOriginal?.file_path || null;
      const oldSolution = editingOriginal?.solution_image_path || null;

      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        newPath = `${profile.id}/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase.storage.from('materials').upload(newPath, file);
        if (uploadError) {
          showToast(uploadError.message, 'error');
          return;
        }
        payload.file_path = newPath;
        payload.file_name = file.name;
        payload.file_type = file.type || file.name.split('.').pop().toLowerCase();
        payload.file_size = file.size;
      }

      if (solutionFile) {
        try {
          newSolutionPath = await uploadSolutionImage(solutionFile);
          payload.solution_image_path = newSolutionPath;
        } catch (solErr) {
          if (newPath) await supabase.storage.from('materials').remove([newPath]).catch(() => {});
          showToast(solErr.message || 'فشل رفع صورة الحل.', 'error');
          return;
        }
      }

      const { error } = await updateMaterial(editingId, payload);
      if (error) {
        const cleanup = [];
        if (newPath) cleanup.push(newPath);
        if (newSolutionPath) cleanup.push(newSolutionPath);
        if (cleanup.length) await supabase.storage.from('materials').remove(cleanup).catch(() => {});
        showToast(error.message || 'تعذر حفظ التعديلات.', 'error');
        return;
      }

      const toRemove = [];
      if (newPath && oldPath && oldPath !== newPath) toRemove.push(oldPath);
      if (newSolutionPath && oldSolution && oldSolution !== newSolutionPath) toRemove.push(oldSolution);
      if (toRemove.length) await supabase.storage.from('materials').remove(toRemove).catch(() => {});

      showToast(
        !pub.is_published
          ? 'اتحفظ كمسودة — مش ظاهر للطلاب.'
          : pub.publish_at && new Date(pub.publish_at).getTime() > Date.now()
            ? 'اتحفظ وهيظهر في الوقت المحدد.'
            : materialType === 'assignment' && isDelivered
              ? 'تم الحفظ — تم التسليم.'
              : 'تم حفظ التعديلات.',
        'success'
      );
      if (materialType === 'assignment' && pub.is_published && (file || solutionFile)) {
        await notifyAssignmentSafe({
          subjectId,
          subjectName: subjectNames.get(subjectId) || '',
          hasSolution: !!(solutionFile || editingOriginal?.solution_image_path),
          dueAt,
          isNew: !!file
        });
      }
      document.getElementById('form-panel').classList.add('hidden');
      resetFormMode();
      await load();
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${profile.id}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage.from('materials').upload(path, file);
    if (uploadError) {
      showToast(uploadError.message, 'error');
      return;
    }

    let solutionPath = null;
    if (solutionFile) {
      try {
        solutionPath = await uploadSolutionImage(solutionFile);
      } catch (solErr) {
        await supabase.storage.from('materials').remove([path]);
        showToast(solErr.message || 'فشل رفع صورة الحل.', 'error');
        return;
      }
    }

    const payload = {
      title,
      description,
      admin_note: adminNote,
      subject_id: subjectId,
      material_type: materialType,
      due_at: dueAt,
      is_delivered: isDelivered,
      submission_url: submissionUrl,
      file_path: path,
      file_name: file.name,
      file_type: file.type || file.name.split('.').pop().toLowerCase(),
      file_size: file.size,
      is_published: pub.is_published,
      publish_at: pub.publish_at,
      created_by: profile.id
    };
    if (solutionPath) payload.solution_image_path = solutionPath;

    const { error } = await insertMaterial(payload);
    if (error) {
      const cleanup = [path];
      if (solutionPath) cleanup.push(solutionPath);
      await supabase.storage.from('materials').remove(cleanup).catch(() => {});
      showToast(error.message || 'تعذر حفظ الملف.', 'error');
      return;
    }

    showToast(
      !pub.is_published
        ? 'الملف اترفَع كمسودة.'
        : pub.publish_at && new Date(pub.publish_at).getTime() > Date.now()
          ? 'الملف اترفَع وهيظهر في الوقت المحدد.'
          : 'تم رفع الملف بنجاح.',
      'success'
    );
    if (materialType === 'assignment' && pub.is_published) {
      await notifyAssignmentSafe({
        subjectId,
        subjectName: subjectNames.get(subjectId) || '',
        hasSolution: !!solutionPath,
        dueAt,
        isNew: true
      });
    }
    document.getElementById('form-panel').classList.add('hidden');
    resetFormMode();
    await load();
  });
}

init().catch((error) => {
  console.error(error);
  try {
    document.documentElement.classList.remove('admin-auth-pending');
  } catch {}
  showError(document.getElementById('list'), 'مش قادرين نجهّز صفحة رفع الملفات.');
});
