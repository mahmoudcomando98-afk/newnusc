
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
  return quiz.quiz_date || null;
}

function getQuizStatus(quiz) {
  const startValue = getStartDate(quiz);
  if (!startValue) return 'upcoming';

  const start = new Date(startValue).getTime();
  if (Number.isNaN(start)) return 'upcoming';

  const now = Date.now();
  if (now < start) return 'upcoming';

  if (quiz.duration_minutes) {
    const end = start + Number(quiz.duration_minutes) * 60 * 1000;
    return now <= end ? 'open' : 'closed';
  }

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
      .select('id, title, rules, quiz_date, duration_minutes, total_marks, passing_score, is_published, subjects(name)');

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
    const topics = quiz.rules || '';

    const subjectName =
      quiz.subjects?.name ||
      quiz.subject_name ||
      '';


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

        ${quiz.total_marks != null ? `<p class="text-sm mt-1">الدرجة الكلية: ${Number(quiz.total_marks)}</p>` : ''}
        ${quiz.passing_score != null ? `<p class="text-sm mt-1">درجة النجاح: ${Number(quiz.passing_score)}</p>` : ''}
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
