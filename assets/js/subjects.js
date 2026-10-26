/**
 * NUSC — Subjects catalog page
 */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import {
  escapeHtml,
  showEmpty,
  showError,
  initIcons,
  setActiveNav
} from './utils.js';
import { cacheGetSoft, cacheSet } from './cache.js';

let allSubjects = [];

async function init() {
  const result = await protectPage();
  if (!result) return;

  try {
    setActiveNav('subjects');
  } catch {
    /* optional helper */
  }
  initIcons();

  const search = document.getElementById('search-input');
  if (search) {
    search.addEventListener('input', () => applyFilter());
  }

  await loadSubjects();
}

async function loadSubjects() {
  const el = document.getElementById('subjects-grid');
  if (!el) {
    console.error('Missing #subjects-grid in subjects.html');
    return;
  }

  try {
    const soft = cacheGetSoft('page:subjects');
    if (soft && Array.isArray(soft) && soft.length) {
      allSubjects = soft;
      renderSubjects(allSubjects);
    }

    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    allSubjects = (data || []).filter(
      (s) => s.is_published !== false && s.is_active !== false
    );
    cacheSet('page:subjects', allSubjects, 5 * 60 * 1000);
    renderSubjects(allSubjects);
  } catch (error) {
    console.error('Subjects load failed:', error);
    if (!allSubjects.length) {
      showError(el, 'مش قادرين نحمّل المواد دلوقتي. جرّب تاني.');
    }
  }
}

function applyFilter() {
  const q = (document.getElementById('search-input')?.value || '')
    .trim()
    .toLowerCase();

  if (!q) {
    renderSubjects(allSubjects);
    return;
  }

  const filtered = allSubjects.filter((subject) => {
    const hay = [
      subject.name,
      subject.code,
      subject.instructor,
      subject.description
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });

  renderSubjects(filtered);
}

function renderSubjects(subjects) {
  const el = document.getElementById('subjects-grid');
  if (!el) return;

  if (!subjects.length) {
    showEmpty(el, 'لا توجد نتائج مطابقة لبحثك.');
    return;
  }

  const count = document.getElementById('subjects-count');
  if (count) count.textContent = String(subjects.length);

  el.innerHTML = subjects
    .map((subject) => {
      const name = escapeHtml(subject.name || 'مادة دراسية');
      const code = subject.code
        ? `<span class="subject-tile-code">${escapeHtml(subject.code)}</span>`
        : '<span class="subject-tile-code">مادة</span>';
      const instructor = subject.instructor
        ? `<p class="subject-tile-instructor">${escapeHtml(subject.instructor)}</p>`
        : '';
      const desc = subject.description
        ? `<p class="subject-tile-desc">${escapeHtml(String(subject.description).slice(0, 110))}</p>`
        : '';

      return `
    <article class="subject-tile">
      <div class="subject-tile-accent" aria-hidden="true"></div>
      <div class="subject-tile-body">
        <div class="subject-tile-top">
          ${code}
          <div class="subject-tile-icon" data-icon="book"></div>
        </div>
        <h3 class="subject-tile-title">${name}</h3>
        ${instructor}
        ${desc}
        <div class="subject-tile-footer">
          <a
            href="/subject-details.html?id=${encodeURIComponent(subject.id)}"
            class="subject-tile-btn"
          >افتح المادة</a>
        </div>
      </div>
    </article>`;
    })
    .join('');

  initIcons();
}

init();
