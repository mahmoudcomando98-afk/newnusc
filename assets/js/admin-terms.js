/**
 * COMANDO — مركز إدارة الفصول الدراسية (للمدير الأساسي فقط)
 */
import { supabase } from './supabase.js';
import { protectAdminPage } from './auth.js';
import { showToast, initIcons, escapeHtml } from './utils.js';
import { normalizeTerm, termLabel, TERM_STATUS_AR, sortTerms } from './term-filters.js';

const $ = (id) => document.getElementById(id);
let terms = [];
let profile = null;

function statusBadge(term) {
  const cls = term.status === 'active' ? 'is-active' : term.status === 'archived' ? 'is-archived' : 'is-warn';
  const defaultBadge = term.is_default ? '<span class="term-badge">افتراضي</span>' : '';
  return `<span class="term-badge ${cls}">${TERM_STATUS_AR[term.status] || term.status}</span>${defaultBadge}`;
}

function renderTerms() {
  const list = $('terms-list');
  if (!list) return;
  if (!terms.length) {
    list.innerHTML = '<div class="terms-empty">لا توجد فصول دراسية. أنشئ أول ترم من النموذج.</div>';
    return;
  }

  list.innerHTML = terms
    .map((term) => {
      const disabled = term.status === 'archived';
      return `
      <article class="term-row ${term.is_default ? 'is-default' : ''} ${disabled ? 'is-archived' : ''}" data-term-id="${escapeHtml(term.id)}">
        <div class="term-row-main">
          <div class="term-row-title">
            ${escapeHtml(term.name)}
            ${statusBadge(term)}
          </div>
          <div class="term-row-meta">
            ${term.academic_year ? `السنة: ${escapeHtml(term.academic_year)} · ` : ''}
            ${term.is_public ? 'متاح لكل الطلاب' : 'بدعوة فقط'}
            ${term.description ? `<br />${escapeHtml(term.description)}` : ''}
          </div>
        </div>
        <div class="term-row-actions">
          <button type="button" class="btn btn-primary term-btn-sm" data-action="open">فتح الإدارة</button>
          <button type="button" class="btn btn-secondary term-btn-sm" data-action="edit">تعديل</button>
          <button type="button" class="btn btn-secondary term-btn-sm" data-action="default" ${term.is_default ? 'disabled' : ''}>افتراضي</button>
          <button type="button" class="btn btn-secondary term-btn-sm" data-action="status" data-status="${term.status === 'active' ? 'paused' : 'active'}">
            ${term.status === 'active' ? 'إيقاف' : 'تفعيل'}
          </button>
          <button type="button" class="btn btn-secondary term-btn-sm" data-action="archive" ${disabled ? 'disabled' : ''}>أرشفة</button>
        </div>
      </article>`;
    })
    .join('');

  const select = $('admin-term-select');
  if (select) {
    const current = select.value;
    select.innerHTML =
      '<option value="">— اختر ترمًا —</option>' +
      terms.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(termLabel(t))}</option>`).join('');
    if (current) select.value = current;
  }
}

async function loadTerms() {
  const { data, error } = await supabase.from('terms').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  terms = sortTerms((data || []).map(normalizeTerm).filter(Boolean));
  renderTerms();
}

function findTerm(id) {
  return terms.find((t) => t.id === id);
}

async function setDefault(termId) {
  const { error: clearError } = await supabase.from('terms').update({ is_default: false }).eq('is_default', true);
  if (clearError) throw clearError;
  const { error } = await supabase.from('terms').update({ is_default: true }).eq('id', termId);
  if (error) throw error;
  showToast('تم تحديد الترم الافتراضي', 'success');
  await loadTerms();
}

async function setStatus(termId, status) {
  const { error } = await supabase.from('terms').update({ status }).eq('id', termId);
  if (error) throw error;
  showToast(status === 'active' ? 'تم تفعيل الترم' : 'تم إيقاف الترم', 'success');
  await loadTerms();
}

async function editTerm(term) {
  const name = window.prompt('اسم الترم', term.name);
  if (name === null || !name.trim()) return;
  const year = window.prompt('السنة الدراسية', term.academic_year || '');
  if (year === null) return;
  const desc = window.prompt('وصف الترم', term.description || '');
  if (desc === null) return;
  const { error } = await supabase
    .from('terms')
    .update({ name: name.trim().slice(0, 80), academic_year: year.trim().slice(0, 40), description: desc.trim().slice(0, 300) })
    .eq('id', term.id);
  if (error) throw error;
  showToast('تم تعديل بيانات الترم', 'success');
  await loadTerms();
}

async function openTerm(termId) {
  const { error } = await supabase.rpc('set_current_term', { p_term: termId });
  if (error) throw error;
  window.location.href = '/admin/index.html';
}

async function loadTermAdmins(termId) {
  const box = $('term-admins-list');
  if (!box) return;
  if (!termId) {
    box.innerHTML = '<div class="terms-empty">اختر ترمًا أولًا.</div>';
    return;
  }
  const { data, error } = await supabase
    .from('term_admins')
    .select('user_id, permissions, profiles(full_name, email, student_id)')
    .eq('term_id', termId);
  if (error) {
    box.innerHTML = `<div class="terms-empty">تعذر تحميل المسؤولين: ${escapeHtml(error.message)}</div>`;
    return;
  }
  if (!(data || []).length) {
    box.innerHTML = '<div class="terms-empty">لا يوجد مسؤولون فرعيون لهذا الترم.</div>';
    return;
  }
  box.innerHTML = data
    .map((row) => {
      const p = row.profiles || {};
      const perms = row.permissions || {};
      const tags = [
        perms.content ? 'محتوى' : '',
        perms.students ? 'طلاب' : '',
        perms.settings ? 'إعدادات' : ''
      ].filter(Boolean).join(' · ') || 'بدون صلاحيات';
      return `<div class="term-admin-row">
        <span>${escapeHtml(p.full_name || p.email || row.user_id)}<br /><small class="text-muted">${escapeHtml(tags)}</small></span>
        <button type="button" class="btn btn-secondary term-btn-sm term-danger" data-remove-admin="${escapeHtml(row.user_id)}">إزالة</button>
      </div>`;
    })
    .join('');
}

async function addTermAdmin() {
  const termId = $('admin-term-select')?.value;
  const code = ($('admin-code')?.value || '').trim();
  if (!termId || !code) {
    showToast('اختر الترم واكتب كود المسؤول', 'error');
    return;
  }
  const normalized = code.replace(/\s+/g, '').toUpperCase();
  let result = await supabase
    .from('student_codes')
    .select('linked_user_id, code_norm, code')
    .eq('code_norm', normalized)
    .maybeSingle();
  if (!result.data && !result.error) {
    result = await supabase
      .from('student_codes')
      .select('linked_user_id, code_norm, code')
      .eq('code', code)
      .maybeSingle();
  }
  if (result.error) throw result.error;
  const uid = result.data?.linked_user_id;
  if (!uid) {
    showToast('الكود غير مرتبط بحساب', 'error');
    return;
  }
  const { error } = await supabase.from('term_admins').insert({
    term_id: termId,
    user_id: uid,
    permissions: { content: true, students: true, settings: false },
    created_by: profile?.id || null
  });
  if (error) throw error;
  $('admin-code').value = '';
  showToast('تمت إضافة مسؤول الترم', 'success');
  await loadTermAdmins(termId);
}

async function removeTermAdmin(termId, userId) {
  const { error } = await supabase.from('term_admins').delete().eq('term_id', termId).eq('user_id', userId);
  if (error) throw error;
  showToast('تمت إزالة المسؤول', 'success');
  await loadTermAdmins(termId);
}

function bindEvents() {
  $('terms-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const row = btn.closest('.term-row');
    const term = findTerm(row?.dataset.termId);
    if (!term) return;
    try {
      const action = btn.dataset.action;
      if (action === 'open') await openTerm(term.id);
      else if (action === 'edit') await editTerm(term);
      else if (action === 'default') await setDefault(term.id);
      else if (action === 'status') await setStatus(term.id, btn.dataset.status);
      else if (action === 'archive') {
        if (!window.confirm(`أرشفة «${term.name}»؟ المحتوى هيفضل محفوظ.`)) return;
        await setStatus(term.id, 'archived');
      }
    } catch (err) {
      showToast(err?.message || 'تعذر تنفيذ الطلب', 'error');
    }
  });

  $('terms-reload')?.addEventListener('click', () => loadTerms().catch((e) => showToast(e.message, 'error')));

  $('term-create-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('term-create-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري الإنشاء…'; }
    try {
      const isDefault = !!$('term-default')?.checked;
      const payload = {
        name: $('term-name').value.trim().slice(0, 80),
        academic_year: $('term-year').value.trim().slice(0, 40) || null,
        description: $('term-desc').value.trim().slice(0, 300) || null,
        status: $('term-status').value,
        is_public: !!$('term-public')?.checked,
        is_default: isDefault,
        created_by: profile?.id || null
      };
      if (!payload.name) throw new Error('اكتب اسم الترم');
      if (isDefault) {
        const { error: clearError } = await supabase.from('terms').update({ is_default: false }).eq('is_default', true);
        if (clearError) throw clearError;
      }
      const { error } = await supabase.from('terms').insert(payload);
      if (error) throw error;
      e.target.reset();
      showToast('تم إنشاء الترم', 'success');
      await loadTerms();
    } catch (err) {
      showToast(err?.message || 'تعذر إنشاء الترم', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'إنشاء الترم'; }
    }
  });

  $('admin-term-select')?.addEventListener('change', (e) => {
    loadTermAdmins(e.target.value).catch((err) => showToast(err.message, 'error'));
  });
  $('admin-add-btn')?.addEventListener('click', () => addTermAdmin().catch((err) => showToast(err.message, 'error')));
  $('term-admins-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-remove-admin]');
    const termId = $('admin-term-select')?.value;
    if (btn && termId) {
      if (!window.confirm('إزالة مسؤول الترم؟')) return;
      removeTermAdmin(termId, btn.dataset.removeAdmin).catch((err) => showToast(err.message, 'error'));
    }
  });
}

async function init() {
  const result = await protectAdminPage();
  if (!result) return;
  profile = result.profile;
  document.documentElement.classList.remove('admin-auth-pending');
  initIcons();
  bindEvents();
  try {
    await loadTerms();
  } catch (err) {
    $('terms-list').innerHTML = `<div class="terms-empty">تعذر تحميل الفصول: ${escapeHtml(err.message)}</div>`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
