
/**
 * NUSC Student Hub - Subjects Page
 */

import { supabase } from './supabase.js';
import { protectPage } from './auth.js';

import {
  escapeHtml,
  showEmpty,
  showError,
  initIcons,
  setActiveNav,
  debounce
} from './utils.js';

let allSubjects = [];

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;

    setActiveNav('subjects');
    initIcons();

    const searchInput = document.getElementById('search-input');

    searchInput?.addEventListener(
      'input',
      debounce((event) => {
        filterSubjects(event.target.value.trim());
      }, 250)
    );

    await loadSubjects();
  } catch (error) {
    console.error('Subjects page initialization error:', error);

    const el = document.getElementById('subjects-grid');

    if (el) {
      showError(el, 'تعذر فتح صفحة المواد. حاول تسجيل الدخول مجددًا.');
    }
  }
}

async function loadSubjects() {
  const el = document.getElementById('subjects-grid');

  if (!el) {
    console.error('Missing #subjects-grid in subjects.html');
    return;
  }

  el.innerHTML =
    '<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>';

  try {
    const { data, error } = await supabase
      .from('subjects')
      .select('*');

    if (error) throw error;

    // Support both schema variants: some installations use is_active, others use is_published.
    allSubjects = (data || []).filter(
      (subject) => (subject.is_active ?? subject.is_published ?? true) !== false
    );

    allSubjects.sort((a, b) => {
      const orderA = Number(a.sort_order ?? 9999);
      const orderB = Number(b.sort_order ?? 9999);

      if (orderA !== orderB) return orderA - orderB;

      return String(a.name || '').localeCompare(
        String(b.name || ''),
        'ar'
      );
    });

    if (!allSubjects.length) {
      showEmpty(el, 'لا توجد مواد نشطة متاحة حاليًا.');
      return;
    }

    const count = document.getElementById('subjects-count');
    if (count) count.textContent = String(allSubjects.length);
    renderSubjects(allSubjects);
  } catch (error) {
    console.error('Subjects loading error:', error);

    showError(
      el,
      'تعذر تحميل المواد. افتح Console لمعرفة خطأ Supabase بالتحديد.'
    );
  }
}

function filterSubjects(query) {
  if (!query) {
    renderSubjects(allSubjects);
    return;
  }

  const search = query.toLocaleLowerCase();

  const filtered = allSubjects.filter((subject) => {
    const searchable = [
      subject.name,
      subject.code,
      subject.instructor,
      subject.description
    ];

    return searchable.some((value) =>
      String(value || '').toLocaleLowerCase().includes(search)
    );
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
  el.innerHTML = subjects.map((subject) => `
    <article class="card subject-card">
      <h3 class="card-title">
        ${escapeHtml(subject.name || 'مادة دراسية')}
      </h3>

      <div class="card-meta">
        ${
          subject.code
            ? `<span class="badge badge-primary">${escapeHtml(subject.code)}</span>`
            : ''
        }

        ${
          subject.instructor
            ? `<span>${escapeHtml(subject.instructor)}</span>`
            : ''
        }
      </div>

      ${
        subject.description
          ? `<p class="text-sm text-muted mt-1">${escapeHtml(
              String(subject.description).slice(0, 120)
            )}</p>`
          : ''
      }

      <a
        href="/subject-details.html?id=${encodeURIComponent(subject.id)}"
        class="btn btn-outline btn-sm mt-2"
      >
        فتح المادة
      </a>
    </article>
  `).join('');

  initIcons();
}

init();
