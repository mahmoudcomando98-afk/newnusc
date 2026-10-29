import { supabase } from './supabase.js';
import { protectAdminPage } from './auth.js';
import { escapeHtml, showEmpty, showError, showToast, initIcons, timeAgo } from './utils.js';

async function init() {
  const ok = await protectAdminPage();
  if (!ok) return;
  document.documentElement.classList.remove('admin-auth-pending');
  initIcons();
  await loadList();
}

async function loadList() {
  const el = document.getElementById('list');
  if (!el) return;
  try {
    const { data, error } = await supabase
      .from('devtools_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(150);

    if (error) {
      const msg = String(error.message || '');
      if (/relation.*does not exist|could not find the table/i.test(msg)) {
        showError(
          el,
          'جدول التسجيلات لسه مش موجود. افتح Supabase → SQL Editor ونفّذ ملف supabase/devtools_alerts.sql'
        );
        return;
      }
      if (/permission denied|row-level security|policy/i.test(msg)) {
        showError(
          el,
          'مفيش صلاحية قراءة السجل. نفّذ SQL السياسات تاني من supabase/devtools_alerts.sql'
        );
        return;
      }
      throw error;
    }

    if (!data?.length) {
      showEmpty(
        el,
        'مفيش محاولات مسجّلة لسه. جرّب من حساب طالب تضغط F12، بعدين حدّث الصفحة دي.'
      );
      return;
    }

    el.innerHTML = data
      .map((row) => {
        const who =
          row.full_name ||
          row.email ||
          (row.user_id ? String(row.user_id).slice(0, 8) + '…' : 'زائر / غير معروف');
        return `<article class="card mb-2">
          <div class="flex justify-between items-start flex-wrap gap-1">
            <div style="min-width:0;flex:1">
              <h3 class="card-title">${escapeHtml(who)}</h3>
              <p class="text-sm text-muted">
                ${row.email ? escapeHtml(row.email) + ' · ' : ''}
                ${escapeHtml(row.reason || 'devtools')}
                ${row.attempt_count ? ' · محاولة رقم ' + escapeHtml(String(row.attempt_count)) : ''}
              </p>
              <p class="text-sm text-muted">
                الصفحة: ${escapeHtml(row.page_path || '—')} · ${escapeHtml(timeAgo(row.created_at))}
              </p>
            </div>
            <button type="button" class="btn btn-sm btn-danger" data-del="${row.id}">حذف</button>
          </div>
        </article>`;
      })
      .join('');

    el.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('حذف التنبيه؟')) return;
        const { error: delErr } = await supabase
          .from('devtools_alerts')
          .delete()
          .eq('id', btn.dataset.del);
        if (delErr) showToast(delErr.message, 'error');
        else {
          showToast('اتحذف.', 'success');
          await loadList();
        }
      });
    });
  } catch (err) {
    console.error(err);
    showError(
      el,
      'تعذر تحميل السجل. تأكد إنك نفّذت SQL: supabase/devtools_alerts.sql'
    );
  }
}

init().catch((err) => {
  console.error(err);
  showError(document.getElementById('list'), 'تعذر فتح الصفحة.');
});
