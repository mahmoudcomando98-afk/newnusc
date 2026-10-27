import { supabase } from './supabase.js';
import { protectAdminPage } from './auth.js';
import { escapeHtml, showEmpty, showError, showToast, initIcons, timeAgo } from './utils.js';

let profile = null;
const subjectNames = new Map();

function randomToken() {
  const a = crypto.randomUUID().replace(/-/g, '');
  const b = crypto.randomUUID().replace(/-/g, '');
  return `${a}${b}`.slice(0, 48);
}

function linkUrl(token) {
  return `${window.location.origin}/teacher-upload.html?t=${encodeURIComponent(token)}`;
}

async function init() {
  const result = await protectAdminPage();
  if (!result) return;
  profile = result.profile;
  initIcons();

  document.getElementById('add-btn')?.addEventListener('click', () => {
    document.getElementById('form-panel')?.classList.remove('hidden');
    document.getElementById('created-box')?.classList.add('hidden');
  });
  document.getElementById('cancel-btn')?.addEventListener('click', () => {
    document.getElementById('form-panel')?.classList.add('hidden');
  });
  document.getElementById('link-form')?.addEventListener('submit', onCreate);
  document.getElementById('copy-btn')?.addEventListener('click', async () => {
    const url = document.getElementById('created-url')?.value || '';
    try {
      await navigator.clipboard.writeText(url);
      showToast('تم نسخ الرابط.', 'success');
    } catch {
      showToast('انسخ الرابط يدويًا.', 'info');
    }
  });

  await loadSubjects();
  await loadLinks();
}

async function loadSubjects() {
  const { data, error } = await supabase.from('subjects').select('id, name').order('name');
  if (error) throw error;
  const select = document.getElementById('subject_id');
  (data || []).forEach((s) => {
    subjectNames.set(s.id, s.name);
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    select.appendChild(opt);
  });
}

async function loadLinks() {
  const el = document.getElementById('list');
  try {
    const { data, error } = await supabase
      .from('teacher_upload_links')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    if (!data?.length) {
      showEmpty(el, 'لسه مفيش روابط. اضغط «رابط جديد».');
      return;
    }
    el.innerHTML = data
      .map((row) => {
        const url = linkUrl(row.token);
        const status = !row.is_active
          ? 'موقوف'
          : row.expires_at && new Date(row.expires_at) < new Date()
            ? 'منتهي'
            : 'نشط';
        return `<article class="card mb-2">
          <div class="flex justify-between items-start flex-wrap gap-1">
            <div style="min-width:0;flex:1">
              <h3 class="card-title">${escapeHtml(subjectNames.get(row.subject_id) || 'مادة')}</h3>
              <p class="text-sm text-muted">${row.label ? escapeHtml(row.label) + ' · ' : ''}${status} · استخدام ${row.use_count || 0}${row.max_uses ? ' / ' + row.max_uses : ''}</p>
              <p class="text-sm text-muted">${escapeHtml(timeAgo(row.created_at))}</p>
              <input class="form-input mt-1" style="font-size:0.78rem" readonly value="${escapeHtml(url)}" />
            </div>
            <div class="flex gap-1 flex-wrap">
              <button type="button" class="btn btn-sm btn-outline" data-copy="${escapeHtml(url)}">نسخ</button>
              ${row.is_active ? `<button type="button" class="btn btn-sm btn-outline" data-disable="${row.id}">إيقاف</button>` : ''}
              <button type="button" class="btn btn-sm btn-danger" data-delete="${row.id}">حذف</button>
            </div>
          </div>
        </article>`;
      })
      .join('');

    el.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.copy);
          showToast('تم النسخ.', 'success');
        } catch {
          showToast('انسخ يدويًا.', 'info');
        }
      });
    });
    el.querySelectorAll('[data-disable]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { error } = await supabase
          .from('teacher_upload_links')
          .update({ is_active: false })
          .eq('id', btn.dataset.disable);
        if (error) showToast(error.message, 'error');
        else {
          showToast('الرابط اتوقف.', 'success');
          await loadLinks();
        }
      });
    });
    el.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('حذف الرابط؟')) return;
        const { error } = await supabase.from('teacher_upload_links').delete().eq('id', btn.dataset.delete);
        if (error) showToast(error.message, 'error');
        else {
          showToast('اتحذف.', 'success');
          await loadLinks();
        }
      });
    });
  } catch (error) {
    console.error(error);
    showError(
      el,
      'تعذر تحميل الروابط. لو الجدول مش موجود، نفّذ ملف SQL: supabase/teacher_upload_links.sql'
    );
  }
}

async function onCreate(event) {
  event.preventDefault();
  const subjectId = document.getElementById('subject_id').value;
  const label = document.getElementById('label').value.trim() || null;
  const expiresRaw = document.getElementById('expires_at').value;
  const maxUsesRaw = document.getElementById('max_uses').value;
  const types = [...document.querySelectorAll('input[name="types"]:checked')].map((el) => el.value);

  if (!subjectId) {
    showToast('اختار المادة.', 'error');
    return;
  }
  if (!types.length) {
    showToast('اختار قسم واحد على الأقل.', 'error');
    return;
  }

  const token = randomToken();
  const payload = {
    token,
    subject_id: subjectId,
    label,
    allowed_types: types,
    is_active: true,
    expires_at: expiresRaw ? new Date(expiresRaw).toISOString() : null,
    max_uses: maxUsesRaw ? Number(maxUsesRaw) : null,
    created_by: profile?.id || null
  };

  const { error } = await supabase.from('teacher_upload_links').insert(payload);
  if (error) {
    showToast(error.message || 'تعذر إنشاء الرابط. تأكد من تنفيذ SQL.', 'error');
    return;
  }

  const url = linkUrl(token);
  document.getElementById('created-url').value = url;
  document.getElementById('created-box')?.classList.remove('hidden');
  document.getElementById('form-panel')?.classList.add('hidden');
  document.getElementById('link-form')?.reset();
  showToast('الرابط اتعمل.', 'success');
  await loadLinks();
}

init().catch((err) => {
  console.error(err);
  showError(document.getElementById('list'), 'تعذر فتح الصفحة.');
});
