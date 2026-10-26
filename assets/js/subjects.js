/**
 * NUSC Student Hub - Subjects Page
 */

import { protectPage } from './auth.js';
import {
  escapeHtml,
  showEmpty,
  showError,
  initIcons,
  setActiveNav,
  debounce
} from './utils.js';
import { cachedStaleWhileRevalidate } from './cache.js';
import { fetchSubjects } from './data-api.js';

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

function applySubjects(data) {
  const el = document.getElementById('subjects-grid');
  if (!el) return;

  allSubjects = (data || []).slice().sort((a, b) => {
    const orderA = Number(a.sort_order ?? 9999);
    const orderB = Number(b.sort_order ?? 9999);
    if (orderA !== orderB) return orderA - orderB;
    return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
  });

  if (!allSubjects.length) {
    showEmpty(el, 'لا توجد مواد نشطة متاحة حاليًا.');
    return;
  }

  const count = document.getElementById('subjects-count');
  if (count) count.textContent = String(allSubjects.length);
  renderSubjects(allSubjects);
}

async function loadSubjects() {
  const el = document.getElementById('subjects-grid');

  if (!el) {
    console.error('Missing #subjects-grid in subjects.html');
    return;
  }

  try {
    const data = await cachedStaleWhileRevalidate(
      'page:subjects',
      () => fetchSubjects(100),
      { ttlMs: 2 * 60 * 1000, onUpdate: applySubjects }
    );
    applySubjects(data);
  } catch (error) {
    console.error('Subjects loading error:', error);
    showError(el, 'تعذر تحميل المواد. حاول مرة أخرى.');
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

  el.innerHTML = subjects
    .map((subject) => {
      const name = escapeHtml(subject.name || 'مادة دراسية');
      const code = subject.code
        ? `<span class="subject-tile-code">${escapeHtml(subject.code)}</span>`
        : `<span class="subject-tile-code">مادة</span>`;
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
