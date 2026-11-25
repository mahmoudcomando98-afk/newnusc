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
  debounce,
  showToast
} from './utils.js';
import { cachedStaleWhileRevalidate } from './cache.js';
import { fetchSubjects } from './data-api.js';
import {
  getPinnedSubjectIds,
  isSubjectPinned,
  togglePinnedSubject,
  getMaxPinned
} from './pinned-subjects.js';

let allSubjects = [];
let profile = null;

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;
    profile = result.profile || null;

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

  const pinned = new Set(getPinnedSubjectIds(profile?.id));
  allSubjects = (data || []).slice().sort((a, b) => {
    const pinA = pinned.has(String(a.id)) ? 0 : 1;
    const pinB = pinned.has(String(b.id)) ? 0 : 1;
    if (pinA !== pinB) return pinA - pinB;
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
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    return searchable.includes(search);
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

  const userId = profile?.id;
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
      const pinned = isSubjectPinned(userId, subject.id);
      const pinLabel = pinned ? 'إلغاء التثبيت' : 'تثبيت';
      const pinClass = pinned ? 'subject-pin-btn is-pinned' : 'subject-pin-btn';

      return `
    <article class="subject-tile${pinned ? ' is-pinned-tile' : ''}">
      <div class="subject-tile-accent" aria-hidden="true"></div>
      <div class="subject-tile-body">
        <div class="subject-tile-top">
          ${code}
          <button type="button" class="${pinClass}" data-pin-subject="${escapeHtml(String(subject.id))}" aria-pressed="${pinned ? 'true' : 'false'}" title="${pinLabel}" aria-label="${pinLabel}">
            <span data-icon="pin"></span>
          </button>
        </div>
        <h3 class="subject-tile-title">${name}${pinned ? ' <span class="subject-pinned-badge">مثبّتة</span>' : ''}</h3>
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

  el.querySelectorAll('[data-pin-subject]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-pin-subject');
      const result = togglePinnedSubject(userId, id);
      if (result.full) {
        showToast('تقدر تثبّت ' + getMaxPinned() + ' مواد بس. شيل واحدة الأول.', 'info');
        return;
      }
      showToast(result.pinned ? 'اتثبتت المادة في الرئيسية.' : 'اتشال التثبيت.', 'success');
      applySubjects(allSubjects);
    });
  });

  initIcons();
}

init();
