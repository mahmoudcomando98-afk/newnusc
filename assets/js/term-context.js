/**
 * COMANDO — سياق الفصول الدراسية (Multi-Term Workspaces)
 * المصدر الحقيقي للترم النشط هو profiles.current_term_id في قاعدة البيانات،
 * والـ localStorage مجرد كاش للعرض السريع.
 */
import { supabase, getProfile, getCurrentUser } from './supabase.js';
import { showToast } from './utils.js';
import { normalizeTerm, termLabel, sortTerms, canSelectTerms } from './term-filters.js';

const CACHE_KEY = 'comando_terms_cache_v1';
const EVENT = 'comando:term-changed';

let termsCache = null;
let activeCache = null;
let loading = null;

function isSkippedPage() {
  const path = (window.location.pathname || '').toLowerCase();
  return /login|banned|offline|maintenance|status|chrome-required|devtools-blocked|404|500/.test(path);
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.terms)) return null;
    return {
      terms: parsed.terms.map(normalizeTerm).filter(Boolean),
      activeId: parsed.activeId || null,
      memberTermIds: Array.isArray(parsed.memberTermIds) ? parsed.memberTermIds : [],
      isSuperAdmin: !!parsed.isSuperAdmin
    };
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function emitChange(term) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: term }));
}

export function onTermChange(callback) {
  window.addEventListener(EVENT, (e) => callback(e.detail));
}

export function getCachedTerm() {
  const cached = activeCache || readCache();
  if (!cached?.terms?.length) return null;
  return cached.terms.find((t) => t.id === cached.activeId) || cached.terms.find((t) => t.is_default) || null;
}

export function getCachedTerms() {
  return activeCache?.terms || readCache()?.terms || [];
}

export async function loadTermContext({ force = false } = {}) {
  if (!force && loading) return loading;
  loading = (async () => {
    try {
      const [profileResult, termsResult] = await Promise.all([
        getProfile(),
        supabase.from('terms').select('*').order('sort_order', { ascending: true })
      ]);

      if (termsResult.error) throw termsResult.error;
      const terms = sortTerms((termsResult.data || []).map(normalizeTerm).filter(Boolean));
      if (!terms.length) return null;

      const profile = profileResult || {};
      const userResult = await getCurrentUser();
      const uid = profile.id || userResult?.id;
      const isSuperAdmin = profile.role === 'admin' && profile.is_active !== false;

      let memberTermIds = [];
      if (uid && !isSuperAdmin) {
        const { data: members } = await supabase
          .from('term_members')
          .select('term_id')
          .eq('user_id', uid);
        memberTermIds = (members || []).map((m) => m.term_id);
      }

      const publicTermIds = terms.filter((t) => t.is_public && t.status === 'active').map((t) => t.id);
      let selectable = canSelectTerms(terms, { isSuperAdmin, memberTermIds, publicTermIds });
      if (!selectable.length) selectable = terms; // fallback: ما نقفلش الصفحة

      const activeId =
        (profile.current_term_id && selectable.some((t) => t.id === profile.current_term_id)
          ? profile.current_term_id
          : null) ||
        (selectable.find((t) => t.is_default) || selectable[0]).id;

      activeCache = { terms: selectable, activeId, memberTermIds, isSuperAdmin };
      writeCache(activeCache);
      return activeCache;
    } catch {
      const cached = readCache();
      if (cached?.terms?.length) {
        activeCache = cached;
        return cached;
      }
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export async function setCurrentTerm(termId) {
  const ctx = activeCache || readCache();
  if (!ctx?.terms?.some((t) => t.id === termId)) {
    showToast('الترم ده مش متاح لك', 'error');
    return false;
  }
  try {
    const { error } = await supabase.rpc('set_current_term', { p_term: termId });
    if (error) throw error;
    ctx.activeId = termId;
    activeCache = ctx;
    writeCache(ctx);
    const term = ctx.terms.find((t) => t.id === termId);
    emitChange(term);
    showToast(`تم التحويل إلى ${termLabel(term)}`, 'success');
    setTimeout(() => window.location.reload(), 350);
    return true;
  } catch (err) {
    showToast(err?.message || 'تعذر تغيير الترم', 'error');
    return false;
  }
}

function buildHomeCard(ctx) {
  const card = document.getElementById('term-home-card');
  const select = document.getElementById('term-home-select');
  const current = document.getElementById('term-home-current');
  if (!card || !select) return;

  select.innerHTML = ctx.terms
    .map((term) => `<option value="${term.id}">${termLabel(term)}</option>`)
    .join('');
  const active = ctx.terms.find((t) => t.id === ctx.activeId);
  if (active) {
    select.value = active.id;
    if (current) current.textContent = termLabel(active);
  }
  select.addEventListener('change', () => setCurrentTerm(select.value));
  card.classList.remove('hidden');
}

function buildSwitcher(ctx) {
  if (document.getElementById('term-switcher')) return;
  const header = document.querySelector('.app-header .container') || document.querySelector('.app-header');
  if (!header) return;

  const isAdminPage = /\/admin\//.test(window.location.pathname || '');
  const wrap = document.createElement('div');
  wrap.className = 'term-switcher' + (isAdminPage ? ' is-admin' : '');
  wrap.id = 'term-switcher';

  const label = document.createElement('span');
  label.className = 'term-switcher-label';
  label.textContent = isAdminPage ? 'إدارة:' : 'الترم:';

  const select = document.createElement('select');
  select.className = 'term-switcher-select';
  select.id = 'term-switcher-select';
  select.setAttribute('aria-label', 'اختر الفصل الدراسي');

  ctx.terms.forEach((term) => {
    const option = document.createElement('option');
    option.value = term.id;
    option.textContent = termLabel(term);
    if (term.id === ctx.activeId) option.selected = true;
    select.appendChild(option);
  });

  select.addEventListener('change', () => setCurrentTerm(select.value));
  wrap.append(label, select);
  header.appendChild(wrap);
}

export async function initTermContext() {
  if (isSkippedPage()) return;
  const ctx = await loadTermContext();
  if (ctx?.terms?.length) {
    buildSwitcher(ctx);
    buildHomeCard(ctx);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTermContext, { once: true });
} else {
  initTermContext();
}
