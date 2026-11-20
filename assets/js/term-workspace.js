/**
 * COMANDO — مساحة إدارة فارغة خاصة بكل ترم
 */
import { supabase } from './supabase.js';
import { protectAdminPage } from './auth.js';
import { showToast, initIcons, escapeHtml } from './utils.js';
import { normalizeTerm, termLabel, TERM_STATUS_AR } from './term-filters.js';

const $ = (id) => document.getElementById(id);

async function init() {
  const result = await protectAdminPage();
  if (!result) return;
  document.documentElement.classList.remove('admin-auth-pending');
  initIcons();

  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get('term');

  try {
    const { data, error } = await supabase.from('terms').select('*');
    if (error) throw error;
    const terms = (data || []).map(normalizeTerm).filter(Boolean);
    if (!terms.length) throw new Error('لا توجد فصول دراسية');

    const activeId = requestedId || result.profile?.current_term_id || null;
    const term = terms.find((t) => t.id === activeId) || terms.find((t) => t.is_default) || terms[0];

    if (requestedId && requestedId !== result.profile?.current_term_id) {
      const { error: setError } = await supabase.rpc('set_current_term', { p_term: term.id });
      if (setError) throw setError;
    }

    const title = $('workspace-title');
    const meta = $('workspace-meta');
    const badge = $('workspace-badge');
    if (title) title.textContent = `إدارة ${termLabel(term)}`;
    if (meta) {
      meta.textContent = [
        term.academic_year ? `السنة: ${term.academic_year}` : '',
        term.is_default ? 'الترم الافتراضي' : term.is_public ? 'متاح للطلاب' : 'بدعوة فقط',
        term.description || ''
      ].filter(Boolean).join(' · ') || 'مساحة مستقلة لهذا الترم';
    }
    if (badge) {
      badge.textContent = TERM_STATUS_AR[term.status] || term.status;
      badge.className = 'term-badge ' + (term.status === 'active' ? 'is-active' : term.status === 'archived' ? 'is-archived' : 'is-warn');
    }
    document.title = `إدارة ${termLabel(term)} | COMANDO`;
  } catch (err) {
    showToast(err?.message || 'تعذر تحميل بيانات الترم', 'error');
    if ($('workspace-title')) $('workspace-title').textContent = 'تعذر تحميل الترم';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
