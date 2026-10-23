
/**
 * NUSC Student Hub - Quizzes Page
 */

import { supabase } from './supabase.js';
import { protectPage } from './auth.js';

import {
  escapeHtml,
  formatDate,
  showEmpty,
  showError,
  initIcons,
  setActiveNav,
  quizStatusLabel
} from './utils.js';

let quizzes = [];
let currentStatus = 'upcoming';

function getStartDate(quiz) {
  return quiz.quiz_date || quiz.start_at || quiz.start_date || null;
}

function getEndDate(quiz) {
  return quiz.end_at || quiz.end_date || null;
}

function getQuizStatus(quiz) {
  const savedStatus = String(quiz.status || '').toLowerCase();

  if (savedStatus === 'closed' || savedStatus === 'completed') {
    const end = getEndDate(quiz);

    if (!end || Date.now() > new Date(end).getTime()) {
      return 'closed';
    }
  }

  const startValue = getStartDate(quiz);
  const endValue = getEndDate(quiz);

  if (!startValue) {
    if (savedStatus === 'open') return 'open';
    if (savedStatus === 'closed') return 'closed';
    return 'upcoming';
  }

  const start = new Date(startValue).getTime();

  if (Number.isNaN(start)) {
    return savedStatus === 'closed' ? 'closed' : 'upcoming';
  }

  const now = Date.now();

  if (now < start) return 'upcoming';

  if (endValue) {
    const end = new Date(endValue).getTime();

    if (!Number.isNaN(end)) {
      return now <= end ? 'open' : 'closed';
    }
  }

  if (quiz.duration_minutes) {
    const end =
      start + Number(quiz.duration_minutes) * 60 * 1000;

    return now <= end ? 'open' : 'closed';
  }

  if (savedStatus === 'closed') return 'closed';

  return 'open';
}

function getQuizDateText(value) {
  if (!value) return '';

  return formatDate(value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function loadQuizzes() {
  const el = document.getElementById('quizzes-list');

  if (!el) {
    console.error('Missing #quizzes-list in quizzes.html');
    return;
  }

  el.innerHTML =
    '<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>';

  try {
    const { data, error } = await supabase
      .from('quizzes')
      .select('*');

    if (error) throw error;

    // RLS في Supabase يجب أن يمنع الطلاب من قراءة الكويزات غير المنشورة.
    // هذا الفلتر الإضافي يخفي المسودات إذا كان العمود موجودًا.
    quizzes = (data || []).filter(
      (quiz) => quiz.is_published !== false
    );

    // ترتيب الكويزات حسب الموعد، مع دعم أسماء الأعمدة المختلفة.
    quizzes.sort((a, b) => {
      const aDate = getStartDate(a);
      const bDate = getStartDate(b);

      if (!aDate) return 1;
      if (!bDate) return -1;

      return new Date(aDate).getTime() - new Date(bDate).getTime();
    });

    renderQuizzes();
  } catch (error) {
    console.error('Quizzes loading error:', error);
    showError(
      el,
      'تعذر تحميل الكويزات. راجع Console وسياسات القراءة في Supabase.'
    );
  }
}

function renderQuizzes() {
  const el = document.getElementById('quizzes-list');
  if (!el) return;

  const filtered = quizzes.filter(
    (quiz) => getQuizStatus(quiz) === currentStatus
  );

  if (!filtered.length) {
    const messages = {
      upcoming: 'لا توجد كويزات قادمة حاليًا',
      open: 'لا توجد كويزات مفتوحة الآن',
      closed: 'لا توجد كويزات منتهية معروضة'
    };

    showEmpty(el, messages[currentStatus] || 'لا توجد كويزات');
    return;
  }

  el.innerHTML = filtered.map((quiz) => {
    const status = getQuizStatus(quiz);

    const badgeClass =
      status === 'open'
        ? 'badge-success'
        : status === 'closed'
          ? 'badge-danger'
          : 'badge-info';

    const startDate = getStartDate(quiz);
    const endDate = getEndDate(quiz);

    const topics =
      quiz.topics ||
      quiz.rules ||
      quiz.instructions ||
      '';

    const subjectName =
      quiz.subjects?.name ||
      quiz.subject_name ||
      '';

    const quizUrl = quiz.quiz_url || quiz.url || '';

    return `
      <article class="card mb-2">
        <div class="flex justify-between items-center flex-wrap gap-1">
          <h3 class="card-title">
            ${escapeHtml(quiz.title || 'كويز')}
          </h3>

          <span class="badge ${badgeClass}">
            ${escapeHtml(quizStatusLabel(status))}
          </span>
        </div>

        ${
          subjectName
            ? `<p class="text-sm text-muted">${escapeHtml(subjectName)}</p>`
            : ''
        }

        ${
          startDate
            ? `<p class="text-sm mt-1"><strong>الموعد:</strong> ${escapeHtml(getQuizDateText(startDate))}</p>`
            : ''
        }

        ${
          endDate
            ? `<p class="text-sm mt-1"><strong>النهاية:</strong> ${escapeHtml(getQuizDateText(endDate))}</p>`
            : ''
        }

        ${
          quiz.duration_minutes
            ? `<p class="text-sm mt-1">المدة: ${Number(quiz.duration_minutes)} دقيقة</p>`
            : ''
        }

        ${
          quiz.description
            ? `<p class="text-sm text-muted mt-1">${escapeHtml(quiz.description)}</p>`
            : ''
        }

        ${
          topics
            ? `<p class="text-sm mt-1"><strong>التعليمات / الموضوعات:</strong> ${escapeHtml(topics)}</p>`
            : ''
        }

        ${
          quizUrl && status === 'open'
            ? `<a href="${escapeHtml(quizUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm mt-2">فتح الكويز</a>`
            : ''
        }
      </article>
    `;
  }).join('');

  initIcons();
}

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;

    setActiveNav('quizzes');
    initIcons();

    document.querySelectorAll('#tabs .tab[data-status]').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#tabs .tab').forEach((item) => {
          item.classList.remove('active');
        });

        tab.classList.add('active');
        currentStatus = tab.dataset.status || 'upcoming';

        renderQuizzes();
      });
    });

    await loadQuizzes();
  } catch (error) {
    console.error('Quizzes page initialization error:', error);

    const el = document.getElementById('quizzes-list');

    if (el) {
      showError(el, 'تعذر فتح صفحة الكويزات. حاول تسجيل الدخول مجددًا.');
    }
  }
}

init();
