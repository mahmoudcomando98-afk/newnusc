/**
 * Past exams — list subjects, then open exams per subject.
 */
import { protectPage } from './auth.js';
import { escapeHtml, showEmpty, showError, initIcons, setActiveNav, debounce } from './utils.js';
import { cachedStaleWhileRevalidate } from './cache.js';
import { fetchSubjects } from './data-api.js';

let allSubjects = [];

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;
    try { setActiveNav('past-exams'); } catch { /* optional */ }
    initIcons();
    document.getElementById('search-input')?.addEventListener(
      'input',
      debounce((e) => filterSubjects(e.target.value.trim()), 250)
    );
    await loadSubjects();
  } catch (error) {
    console.error(error);
    const el = document.getElementById('subjects-grid');
    if (el) showError(el, 'تعذر فتح صفحة الامتحانات السابقة.');
  }
}

function applySubjects(data) {
  allSubjects = (data || []).slice().sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'ar')
  );
  const count = document.getElementById('subjects-count');
  if (count) count.textContent = String(allSubjects.length);
  if (!allSubjects.length) {
    showEmpty(document.getElementById('subjects-grid'), 'مفيش مواد متاحة دلوقتي.');
    return;
  }
  renderSubjects(allSubjects);
}

async function loadSubjects() {
  const el = document.getElementById('subjects-grid');
  try {
    const data = await cachedStaleWhileRevalidate(
      'page:subjects',
      () => fetchSubjects(100),
      { ttlMs: 2 * 60 * 1000, onUpdate: applySubjects }
    );
    applySubjects(data);
  } catch (error) {
    console.error(error);
    showError(el, 'تعذر تحميل المواد. حاول مرة أخرى.');
  }
}

function filterSubjects(query) {
  if (!query) {
    renderSubjects(allSubjects);
    return;
  }
  const q = query.toLocaleLowerCase();
  const filtered = allSubjects.filter((s) =>
    [s.name, s.code, s.instructor].some((v) => String(v || '').toLocaleLowerCase().includes(q))
  );
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
      const name = escapeHtml(subject.name || 'مادة');
      const code = subject.code
        ? `<span class="subject-tile-code">${escapeHtml(subject.code)}</span>`
        : `<span class="subject-tile-code">مادة</span>`;
      return `
    <article class="subject-tile">
      <div class="subject-tile-accent" aria-hidden="true"></div>
      <div class="subject-tile-body">
        <div class="subject-tile-top">
          ${code}
          <div class="subject-tile-icon" data-icon="clipboard"></div>
        </div>
        <h3 class="subject-tile-title">${name}</h3>
        <div class="subject-tile-footer">
          <a class="subject-tile-btn" href="/past-exam-subject.html?id=${encodeURIComponent(subject.id)}">امتحانات المادة</a>
        </div>
      </div>
    </article>`;
    })
    .join('');
  initIcons();
}

init();
