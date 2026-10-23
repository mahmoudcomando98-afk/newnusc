
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
  return quiz.start_at || quiz.quiz_date || null;
}

function getQuizStatus(quiz) {
  const startValue = getStartDate(quiz);
  const savedStatus = ['upcoming', 'open', 'closed'].includes(quiz.status) ? quiz.status : null;
  if (!startValue) return savedStatus || 'upcoming';
  const start = new Date(startValue).getTime();
  if (Number.isNaN(start)) return savedStatus || 'upcoming';
  const now = Date.now();
  if (now < start) return 'upcoming';
  const explicitEnd = quiz.end_at ? new Date(quiz.end_at).getTime() : NaN;
  if (!Number.isNaN(explicitEnd)) return now <= explicitEnd ? 'open' : 'closed';
  if (quiz.duration_minutes) {
    const end = start + Number(quiz.duration_minutes) * 60 * 1000;
    return now <= end ? 'open' : 'closed';
  }
  return savedStatus === 'closed' ? 'closed' : 'open';
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

function getQuizLoadErrorMessage(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (code === '42P01' || code === 'PGRST205' || /relation .*quizzes.* does not exist|could not find the table .*quizzes/i.test(message)) {
    return 'جدول الكويزات غير موجود في قاعدة البيانات. راجع جدول public.quizzes في Supabase.';
  }
  if (code === '42703' || code === 'PGRST204' || /column .* does not exist|could not find the .*column/i.test(message)) {
    return 'أعمدة جدول الكويزات غير متوافقة مع الصفحة. نفّذ ملف supabase/fix_quizzes_schema.sql من SQL Editor في Supabase.';
  }
  if (code === '42501' || /row-level security|permission denied|not allowed/i.test(message)) {
    return 'صلاحيات قراءة الكويزات غير مفعّلة. راجع سياسات RLS لجدول public.quizzes في Supabase.';
  }
  return 'تعذر تحميل الكويزات. تحقق من اتصال Supabase ومن جدول public.quizzes وسياسات القراءة.';
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
      .select('id, title, description, topics, instructions, start_at, end_at, duration_minutes, total_marks, passing_score, is_published, quiz_url, subject_id, status');

    if (error) throw error;

    const rawQuizzes = (data || []).filter((quiz) => quiz.is_published !== false);
    const subjectIds = [...new Set(rawQuizzes.map((quiz) => quiz.subject_id).filter(Boolean))];
    const subjectNames = new Map();

    if (subjectIds.length) {
      const { data: subjects, error: subjectsError } = await supabase
        .from('subjects')
        .select('id, name')
        .in('id', subjectIds);
      if (subjectsError) {
        console.warn('Could not load quiz subject names:', subjectsError.message);
      } else {
        (subjects || []).forEach((subject) => subjectNames.set(subject.id, subject.name));
      }
    }

    quizzes = rawQuizzes.map((quiz) => ({
      ...quiz,
      subjects: { name: subjectNames.get(quiz.subject_id) || '' }
    }));

    quizzes.sort((a, b) => {
      const aDate = getStartDate(a);
      const bDate = getStartDate(b);
      if (!aDate) return 1;
      if (!bDate) return -1;
      return new Date(aDate).getTime() - new Date(bDate).getTime();
    });

    renderQuizzes();
  } catch (error) {
    console.error('Quizzes loading error:', { code: error?.code, message: error?.message, details: error?.details, hint: error?.hint });
    showError(el, getQuizLoadErrorMessage(error));
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
    const topics = quiz.topics || '';
    const instructions = quiz.instructions || quiz.rules || '';

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
            ? `<p class="text-sm mt-1"><strong>الموضوعات:</strong> ${escapeHtml(topics)}</p>`
            : ''
        }

        ${instructions ? `<p class="text-sm mt-1"><strong>التعليمات:</strong> ${escapeHtml(instructions)}</p>` : ''}

        ${quiz.total_marks != null ? `<p class="text-sm mt-1">الدرجة الكلية: ${Number(quiz.total_marks)}</p>` : ''}
        ${quiz.passing_score != null ? `<p class="text-sm mt-1">درجة النجاح: ${Number(quiz.passing_score)}</p>` : ''}
        ${quiz.quiz_url ? `<div class="mt-2"><a class="btn btn-primary btn-block" href="${escapeHtml(quiz.quiz_url)}" target="_blank" rel="noopener noreferrer">فتح الامتحان ↗</a></div>` : ''}
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
