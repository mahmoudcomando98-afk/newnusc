/**
 * NUSC Student Hub - Subjects Page
 */

import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, showEmpty, showError, initIcons, setActiveNav, debounce } from './utils.js';

let allSubjects = [];

async function init() {
  const result = await protectPage();
  if (!result) return;

  setActiveNav('subjects');
  initIcons();
  await loadSubjects();

  const searchInput = document.getElementById('search-input');
  searchInput?.addEventListener('input', debounce((e) => {
    filterSubjects(e.target.value.trim());
  }, 250));
}

async function loadSubjects() {
  const el = document.getElementById('subjects-grid');
  try {
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name, code, instructor, description, updated_at')
      .eq('is_published', true)
      .order('sort_order')
      .order('name');

    if (error) throw error;
    allSubjects = data || [];

    if (!allSubjects.length) {
      showEmpty(el, 'لا توجد مواد منشورة حالياً. ستظهر هنا عندما تضيفها الإدارة.');
      return;
    }

    renderSubjects(allSubjects);
  } catch (err) {
    console.error(err);
    showError(el, 'تعذر تحميل المواد. تحقق من الاتصال وحاول مرة أخرى.');
  }
}

function filterSubjects(query) {
  if (!query) {
    renderSubjects(allSubjects);
    return;
  }
  const q = query.toLowerCase();
  const filtered = allSubjects.filter(
    (s) =>
      s.name?.toLowerCase().includes(q) ||
      s.code?.toLowerCase().includes(q) ||
      s.instructor?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q)
  );
  renderSubjects(filtered);
}

function renderSubjects(list) {
  const el = document.getElementById('subjects-grid');
  if (!list.length) {
    showEmpty(el, 'لا توجد نتائج مطابقة لبحثك');
    return;
  }

  el.innerHTML = list.map((s) => `
    <div class="card subject-card">
      <h3 class="card-title">${escapeHtml(s.name)}</h3>
      <div class="card-meta">
        ${s.code ? `<span class="badge badge-primary">${escapeHtml(s.code)}</span>` : ''}
        ${s.instructor ? `<span>${escapeHtml(s.instructor)}</span>` : ''}
      </div>
      ${s.description ? `<p class="text-sm text-muted mt-1">${escapeHtml(s.description.slice(0, 120))}${s.description.length > 120 ? '...' : ''}</p>` : ''}
      <a href="/subject-details.html?id=${s.id}" class="btn btn-outline btn-sm mt-2">فتح المادة</a>
    </div>
  `).join('');
}

init();
