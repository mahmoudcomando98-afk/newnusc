import { supabase } from './supabase.js';
import { protectAdminPage } from './auth.js';
import { escapeHtml, showEmpty, showError, showToast, initIcons, WEEKDAYS_AR } from './utils.js';

let editingId = null;

async function init() {
  const ok = await protectAdminPage();
  if (!ok) return;
  document.documentElement.classList.remove('admin-auth-pending');
  initIcons();

  document.getElementById('meta-form').addEventListener('submit', saveMeta);
  document.getElementById('session-form').addEventListener('submit', saveSession);
  document.getElementById('cancel-btn').addEventListener('click', resetForm);

  await loadMeta();
  await loadList();
}

async function loadMeta() {
  const { data } = await supabase
    .from('online_schedule_meta')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (!data) return;
  document.getElementById('meta-title').value = data.title || '';
  document.getElementById('meta-subtitle').value = data.subtitle || '';
  document.getElementById('meta-note').value = data.note || '';
  document.getElementById('meta-footer').value = data.footer_note || '';
}

async function saveMeta(e) {
  e.preventDefault();
  const payload = {
    id: 1,
    title: document.getElementById('meta-title').value.trim() || 'جدول الأونلاين',
    subtitle: document.getElementById('meta-subtitle').value.trim() || null,
    note: document.getElementById('meta-note').value.trim() || null,
    footer_note: document.getElementById('meta-footer').value.trim() || null,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from('online_schedule_meta').upsert(payload);
  if (error) {
    showToast(error.message || 'تعذر حفظ العنوان.', 'error');
    return;
  }
  showToast('تم حفظ عنوان الصفحة.', 'success');
}

function resetForm() {
  editingId = null;
  document.getElementById('edit-id').value = '';
  document.getElementById('session-form').reset();
  document.getElementById('form-heading').textContent = 'إضافة سكشن';
  document.getElementById('save-btn').textContent = 'إضافة';
  document.getElementById('cancel-btn').classList.add('hidden');
}

function openEdit(item) {
  editingId = item.id;
  document.getElementById('edit-id').value = item.id;
  document.getElementById('day').value = String(item.day_of_week ?? 3);
  document.getElementById('start_time').value = String(item.start_time || '').slice(0, 5);
  document.getElementById('end_time').value = String(item.end_time || '').slice(0, 5);
  document.getElementById('course_name').value = item.course_name || '';
  document.getElementById('instructor_name').value = item.instructor_name || '';
  document.getElementById('link_url').value = item.link_url || '';
  document.getElementById('form-heading').textContent = 'تعديل سكشن';
  document.getElementById('save-btn').textContent = 'حفظ';
  document.getElementById('cancel-btn').classList.remove('hidden');
  document.getElementById('session-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveSession(e) {
  e.preventDefault();
  const course = document.getElementById('course_name').value.trim();
  const start = document.getElementById('start_time').value;
  if (!course || !start) {
    showToast('اكتب المقرر ووقت البداية.', 'error');
    return;
  }

  const payload = {
    day_of_week: Number(document.getElementById('day').value),
    start_time: start.length === 5 ? start + ':00' : start,
    end_time: (() => {
      const v = document.getElementById('end_time').value;
      if (!v) return null;
      return v.length === 5 ? v + ':00' : v;
    })(),
    course_name: course,
    instructor_name: document.getElementById('instructor_name').value.trim() || null,
    link_url: document.getElementById('link_url').value.trim() || null,
    is_active: true,
    updated_at: new Date().toISOString()
  };

  let error;
  if (editingId) {
    ({ error } = await supabase.from('online_section_sessions').update(payload).eq('id', editingId));
  } else {
    ({ error } = await supabase.from('online_section_sessions').insert(payload));
  }

  if (error) {
    showToast(
      error.message?.includes('relation') || error.code === '42P01'
        ? 'نفّذ ملف supabase/online_sections_schedule.sql أولًا'
        : (error.message || 'تعذر الحفظ'),
      'error'
    );
    return;
  }

  showToast(editingId ? 'تم التعديل.' : 'تمت الإضافة.', 'success');
  resetForm();
  await loadList();
}

async function loadList() {
  const el = document.getElementById('list');
  try {
    const { data, error } = await supabase
      .from('online_section_sessions')
      .select('*')
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;
    if (!data?.length) {
      showEmpty(el, 'لسه مفيش سكاشن. ضيف أول سكشن من النموذج فوق.');
      return;
    }

    el.innerHTML = data
      .map((item) => {
        const day = WEEKDAYS_AR[item.day_of_week] || '';
        const time = [String(item.start_time || '').slice(0, 5), String(item.end_time || '').slice(0, 5)]
          .filter(Boolean)
          .join(' – ');
        return `
          <article class="card mb-2">
            <div class="flex justify-between items-start gap-1 flex-wrap">
              <div>
                <h3 class="card-title" style="margin:0">${escapeHtml(item.course_name || '')}</h3>
                <p class="text-sm text-muted mt-1">${escapeHtml(day)} · ${escapeHtml(time)}</p>
                <p class="text-sm text-muted">${escapeHtml(item.instructor_name || '—')}</p>
                ${item.link_url ? `<p class="text-sm mt-1" dir="ltr">${escapeHtml(item.link_url)}</p>` : ''}
              </div>
              <div class="flex gap-1">
                <button type="button" class="btn btn-sm btn-outline" data-edit="${escapeHtml(item.id)}">تعديل</button>
                <button type="button" class="btn btn-sm btn-danger" data-del="${escapeHtml(item.id)}">حذف</button>
              </div>
            </div>
          </article>`;
      })
      .join('');

    el.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = data.find((x) => String(x.id) === String(btn.dataset.edit));
        if (item) openEdit(item);
      });
    });
    el.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('تحذف السكشن ده؟')) return;
        const { error } = await supabase.from('online_section_sessions').delete().eq('id', btn.dataset.del);
        if (error) {
          showToast(error.message || 'تعذر الحذف', 'error');
          return;
        }
        showToast('اتحذف.', 'success');
        await loadList();
      });
    });
  } catch (err) {
    console.error(err);
    showError(el, 'تعذر تحميل القائمة. نفّذ SQL في Supabase لو الجدول لسه مش موجود.');
  }
}

init();
