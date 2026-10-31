import { supabase } from './supabase.js';
import { protectAdminPage } from './auth.js';
import { escapeHtml, showEmpty, showError, showToast, initIcons, WEEKDAYS_AR } from './utils.js';

let editingId = null;

function formatDateAr(iso) {
  try {
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    const day = WEEKDAYS_AR[d.getDay()] || '';
    const f = d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
    return day ? `${day} · ${f}` : f;
  } catch {
    return String(iso).slice(0, 10);
  }
}

async function init() {
  const ok = await protectAdminPage();
  if (!ok) return;
  document.documentElement.classList.remove('admin-auth-pending');
  initIcons();

  document.getElementById('meta-form').addEventListener('submit', saveMeta);
  document.getElementById('exam-form').addEventListener('submit', saveExam);
  document.getElementById('cancel-btn').addEventListener('click', resetForm);

  await loadSubjectsDatalist();
  await loadMeta();
  await loadList();
}

async function loadSubjectsDatalist() {
  try {
    const { data } = await supabase
      .from('subjects')
      .select('name')
      .order('name');
    const list = document.getElementById('subjects-datalist');
    if (!list || !data?.length) return;
    list.innerHTML = data
      .map((s) => `<option value="${escapeHtml(s.name || '')}"></option>`)
      .join('');
  } catch {
    /* optional */
  }
}

async function loadMeta() {
  const { data } = await supabase
    .from('midterm_schedule_meta')
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
    title: document.getElementById('meta-title').value.trim() || 'جدول الميد تيرم',
    subtitle: document.getElementById('meta-subtitle').value.trim() || null,
    note: document.getElementById('meta-note').value.trim() || null,
    footer_note: document.getElementById('meta-footer').value.trim() || null,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from('midterm_schedule_meta').upsert(payload);
  if (error) {
    showToast(
      error.message?.includes('relation') || error.code === '42P01'
        ? 'نفّذ ملف supabase/midterm_schedule.sql أولًا'
        : error.message || 'تعذر حفظ العنوان.',
      'error'
    );
    return;
  }
  showToast('تم حفظ عنوان الصفحة.', 'success');
}

function resetForm() {
  editingId = null;
  document.getElementById('edit-id').value = '';
  document.getElementById('exam-form').reset();
  document.getElementById('form-heading').textContent = 'إضافة امتحان';
  document.getElementById('save-btn').textContent = 'إضافة';
  document.getElementById('cancel-btn').classList.add('hidden');
}

function openEdit(item) {
  editingId = item.id;
  document.getElementById('edit-id').value = item.id;
  document.getElementById('exam_date').value = String(item.exam_date || '').slice(0, 10);
  document.getElementById('start_time').value = String(item.start_time || '').slice(0, 5);
  document.getElementById('end_time').value = String(item.end_time || '').slice(0, 5);
  document.getElementById('subject_name').value = item.subject_name || '';
  document.getElementById('location').value = item.location || '';
  document.getElementById('notes').value = item.notes || '';
  document.getElementById('form-heading').textContent = 'تعديل امتحان';
  document.getElementById('save-btn').textContent = 'حفظ';
  document.getElementById('cancel-btn').classList.remove('hidden');
  document.getElementById('exam-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveExam(e) {
  e.preventDefault();
  const subject = document.getElementById('subject_name').value.trim();
  const examDate = document.getElementById('exam_date').value;
  const start = document.getElementById('start_time').value;
  if (!subject || !examDate || !start) {
    showToast('املأ المادة واليوم ووقت البداية.', 'error');
    return;
  }

  const payload = {
    exam_date: examDate,
    start_time: start.length === 5 ? start + ':00' : start,
    end_time: (() => {
      const v = document.getElementById('end_time').value;
      if (!v) return null;
      return v.length === 5 ? v + ':00' : v;
    })(),
    subject_name: subject,
    location: document.getElementById('location').value.trim() || null,
    notes: document.getElementById('notes').value.trim() || null,
    is_active: true,
    updated_at: new Date().toISOString()
  };

  let error;
  if (editingId) {
    ({ error } = await supabase.from('midterm_exams').update(payload).eq('id', editingId));
  } else {
    ({ error } = await supabase.from('midterm_exams').insert(payload));
  }

  if (error) {
    showToast(
      error.message?.includes('relation') || error.code === '42P01'
        ? 'نفّذ ملف supabase/midterm_schedule.sql أولًا'
        : error.message || 'تعذر الحفظ',
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
      .from('midterm_exams')
      .select('*')
      .order('exam_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;
    if (!data?.length) {
      showEmpty(el, 'لسه مفيش امتحانات. ضيف أول امتحان من النموذج فوق.');
      return;
    }

    el.innerHTML = data
      .map((item) => {
        const time = [String(item.start_time || '').slice(0, 5), String(item.end_time || '').slice(0, 5)]
          .filter(Boolean)
          .join(' – ');
        return `
          <article class="card mb-2">
            <div class="flex justify-between items-start gap-1 flex-wrap">
              <div>
                <h3 class="card-title" style="margin:0">${escapeHtml(item.subject_name || '')}</h3>
                <p class="text-sm text-muted mt-1">${escapeHtml(formatDateAr(item.exam_date))} · ${escapeHtml(time)}</p>
                <p class="text-sm text-muted">${escapeHtml(item.location || 'بدون مكان')}</p>
                ${item.notes ? `<p class="text-sm mt-1">${escapeHtml(item.notes)}</p>` : ''}
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
        if (!confirm('تحذف الامتحان ده من الجدول؟')) return;
        const { error } = await supabase.from('midterm_exams').delete().eq('id', btn.dataset.del);
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
    showError(el, 'تعذر تحميل القائمة. نفّذ SQL: supabase/midterm_schedule.sql');
  }
}

init();
