/**
 * COMANDO - Quizzes Page
 */

import { supabase } from './supabase.js';
import { protectPage } from './auth.js';

import {
  escapeHtml,
  formatDate,
  showError,
  initIcons,
  setActiveNav,
  quizStatusLabel,
  showToast
} from './utils.js';
import { resolveSolutionUrl, decodeDataSolution } from './solution-helpers.js';

let quizzes = [];
let currentStatus = 'all';

function getStartDate(quiz) {
  return quiz.start_at || quiz.quiz_date || null;
}

function getQuizStatus(quiz) {
  const startValue = getStartDate(quiz);
  const savedStatus = ['upcoming', 'open', 'closed'].includes(quiz.status) ? quiz.status : null;
  if (!startValue && !quiz.end_at) return savedStatus || 'upcoming';
  const now = Date.now();
  if (startValue) {
    const start = new Date(startValue).getTime();
    if (!Number.isNaN(start) && now < start) return 'upcoming';
  }
  const explicitEnd = quiz.end_at ? new Date(quiz.end_at).getTime() : NaN;
  if (!Number.isNaN(explicitEnd) && now > explicitEnd) return 'closed';
  if (startValue && quiz.duration_minutes && !quiz.end_at) {
    const start = new Date(startValue).getTime();
    if (!Number.isNaN(start)) {
      const end = start + Number(quiz.duration_minutes) * 60 * 1000;
      if (now > end) return 'closed';
    }
  }
  if (startValue) {
    const start = new Date(startValue).getTime();
    if (!Number.isNaN(start) && now >= start) {
      if (!quiz.end_at && !quiz.duration_minutes) return savedStatus === 'open' ? 'open' : 'closed';
      return 'open';
    }
  }
  if (quiz.end_at && now <= explicitEnd) return 'open';
  return savedStatus === 'open' ? 'open' : 'closed';
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

function bindTabs() {
  document.querySelectorAll('#tabs .quiz-chip[data-status]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#tabs .quiz-chip').forEach((item) => {
        item.classList.toggle('is-active', item === tab);
        item.setAttribute('aria-selected', String(item === tab));
      });
      currentStatus = tab.dataset.status || 'all';
      renderQuizzes();
    });
  });
}

function ensureSolutionModal() {
  let modal = document.getElementById('quiz-solution-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'quiz-solution-modal';
  modal.className = 'modal hidden';
  modal.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal-content card" style="max-width:min(920px,94vw);padding:12px">
      <div class="flex justify-between items-center mb-2">
        <h3 class="card-title" style="margin:0">حل الكويز</h3>
        <button type="button" class="btn btn-sm btn-secondary" data-close>إغلاق</button>
      </div>
      <img id="quiz-solution-img" alt="حل الكويز" style="width:100%;height:auto;border-radius:8px;display:block" />
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => modal.classList.add('hidden'));
  });
  return modal;
}

async function showSolutionImage(path) {
  if (!path) {
    showToast('مفيش صورة حل للكويز ده', 'error');
    return;
  }
  try {
    const modal = ensureSolutionModal();
    const img = document.getElementById('quiz-solution-img');
    img.removeAttribute('src');
    modal.classList.remove('hidden');
    const url = await resolveSolutionUrl(path);
    img.onerror = () => {
      showToast('تعذر تحميل صورة الحل', 'error');
      modal.classList.add('hidden');
    };
    img.src = url;
  } catch (e) {
    showToast('تعذر عرض الحل', 'error');
  }
}

function renderQuizzes() {
  const el = document.getElementById('quizzes-list');
  if (!el) return;

  /* عدّادات الرقائق */
  const counts = { all: quizzes.length, open: 0, upcoming: 0, closed: 0 };
  for (const quiz of quizzes) {
    const s = getQuizStatus(quiz);
    counts[s] = (counts[s] || 0) + 1;
  }
  for (const [key, val] of Object.entries(counts)) {
    const node = document.querySelector('[data-count-for="' + key + '"]');
    if (node) node.textContent = val;
  }

  const filtered =
    currentStatus === 'all'
      ? quizzes
      : quizzes.filter((quiz) => getQuizStatus(quiz) === currentStatus);

  if (!filtered.length) {
    const messages = {
      upcoming: 'لا توجد كويزات قادمة حاليًا',
      open: 'لا توجد كويزات مفتوحة الآن',
      closed: 'لا توجد كويزات منتهية',
      all: 'لا توجد كويزات منشورة.'
    };
    el.innerHTML =
      '<div class="quiz-empty"><span data-icon="clipboard"></span>' +
      '<h2>' + escapeHtml(messages[currentStatus] || 'لا توجد كويزات') + '</h2>' +
      '<p>أي كويز جديد بينزل، هتلاقيه هنا أول بأول — تابع التعليمات من الإدارة.</p>' +
      '</div>';
    initIcons();
    return;
  }

  el.innerHTML = filtered
    .map((quiz) => {
      const status = getQuizStatus(quiz);
      const statusClass =
        status === 'open' ? 'quiz-card--open' : status === 'upcoming' ? 'quiz-card--upcoming' : 'quiz-card--closed';
      const statusPill =
        status === 'open' ? 'quiz-status--open' : status === 'upcoming' ? 'quiz-status--upcoming' : 'quiz-status--closed';
      const startDate = getStartDate(quiz);
      const instructions = quiz.instructions || quiz.rules || '';
      const subjectName = quiz.subjects?.name || quiz.subject_name || '';
      const hasSolution = !!quiz.solution_image_path;
      const interactive = !!quiz.has_questions;
      const done = quiz.my_score != null;
      const canReveal = !!quiz.can_reveal;

      return `
      <article class="quiz-card ${statusClass}">
        <div class="quiz-top">
          ${subjectName ? `<span class="quiz-subject">${escapeHtml(subjectName)}</span>` : '<span></span>'}
          <span class="quiz-status ${statusPill}"><span class="quiz-dot"></span>${escapeHtml(quizStatusLabel(status))}</span>
        </div>
        <h3 class="quiz-title">${escapeHtml(quiz.title || 'كويز')}</h3>
        ${quiz.description ? `<p class="quiz-desc">${escapeHtml(quiz.description)}</p>` : ''}
        ${instructions ? `<p class="quiz-desc"><strong>التعليمات:</strong> ${escapeHtml(instructions)}</p>` : ''}
        <div class="quiz-meta">
          ${startDate ? `<div class="quiz-meta-row"><span data-icon="calendar"></span><span class="quiz-meta-label">يفتح:</span><span class="quiz-meta-value">${escapeHtml(getQuizDateText(startDate))}</span></div>` : ''}
          ${quiz.end_at ? `<div class="quiz-meta-row"><span data-icon="clock"></span><span class="quiz-meta-label">يقفل:</span><span class="quiz-meta-value">${escapeHtml(getQuizDateText(quiz.end_at))}</span></div>` : ''}
          ${quiz.duration_minutes ? `<div class="quiz-meta-row"><span data-icon="clock"></span><span class="quiz-meta-label">المدة:</span><span class="quiz-meta-value">${Number(quiz.duration_minutes)} دقيقة</span></div>` : ''}
        </div>
        <div class="quiz-foot">
          ${
            interactive && status === 'open' && !done
              ? `<a class="btn btn-primary" href="/quiz-take.html?id=${encodeURIComponent(quiz.id)}">ابدأ الكويز</a>`
              : ''
          }
          ${
            interactive && done
              ? `<a class="btn btn-secondary" href="/quiz-take.html?id=${encodeURIComponent(quiz.id)}">${canReveal ? 'عرض التفاصيل' : 'عرض درجتك'}</a>`
              : ''
          }
          ${
            interactive && status === 'upcoming'
              ? `<button type="button" class="btn btn-secondary" disabled>لسه ما فتحش</button>`
              : ''
          }
          ${quiz.quiz_url ? `<a class="btn btn-primary" href="${escapeHtml(quiz.quiz_url)}" target="_blank" rel="noopener noreferrer">دخول الامتحان</a>` : ''}
          ${hasSolution && (status === 'closed' || canReveal) ? `<button type="button" class="btn btn-secondary" data-solution="${escapeHtml(encodeURIComponent(quiz.solution_image_path || ''))}">عرض الحل</button>` : ''}
          ${done ? `<span class="quiz-score"><span data-icon="check"></span>درجتك: ${quiz.my_score} / ${quiz.my_max_score ?? '—'}</span>` : ''}
        </div>
      </article>`;
    })
    .join('');

  el.querySelectorAll('[data-solution]').forEach((btn) => {
    btn.addEventListener('click', () => showSolutionImage(decodeDataSolution(btn)));
  });

  initIcons();
}

async function loadQuizzes() {
  const el = document.getElementById('quizzes-list');
  if (!el) return;

  el.innerHTML =
    '<div class="quiz-skeleton" aria-hidden="true"><div class="quiz-skel-card"></div><div class="quiz-skel-card"></div><div class="quiz-skel-card"></div></div>';

  try {
    let data = null;
    let error = null;

    const full = await supabase
      .from('quizzes')
      .select(
        'id, title, description, topics, instructions, start_at, end_at, duration_minutes, total_marks, passing_score, is_published, quiz_url, subject_id, status, solution_image_path, has_questions, quiz_date, rules'
      );
    data = full.data;
    error = full.error;

    if (
      error &&
      /has_questions|solution_image_path|quiz_date|column .* does not exist|PGRST204|42703/i.test(
        String(error.message || '') + String(error.code || '')
      )
    ) {
      const basic = await supabase
        .from('quizzes')
        .select(
          'id, title, description, start_at, end_at, duration_minutes, is_published, quiz_url, subject_id, status, rules'
        );
      data = basic.data;
      error = basic.error;
    }

    if (error) throw error;

    const rows = (data || []).filter((q) => q.is_published !== false);

    let subjectNames = {};
    const ids = [...new Set(rows.map((q) => q.subject_id).filter(Boolean))];
    if (ids.length) {
      const { data: subjects } = await supabase.from('subjects').select('id, name').in('id', ids);
      subjectNames = Object.fromEntries((subjects || []).map((s) => [s.id, s.name]));
    }

    quizzes = await Promise.all(
      rows.map(async (q) => {
        let my_score = null;
        let my_max_score = null;
        let can_reveal = false;
        try {
          const { data: res } = await supabase.rpc('get_my_quiz_result', { p_quiz_id: q.id });
          if (res?.has_result) {
            my_score = res.score;
            my_max_score = res.max_score;
            can_reveal = !!res.can_reveal;
          }
        } catch {
          /* RPC may not exist yet */
        }
        return {
          ...q,
          subject_name: subjectNames[q.subject_id] || '',
          my_score,
          my_max_score,
          can_reveal
        };
      })
    );

    renderQuizzes();
  } catch (error) {
    console.error('[COMANDO] loadQuizzes:', error);
    showError(el, 'تعذر تحميل الكويزات.');
  }
}

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;

    setActiveNav('quizzes');
    bindTabs();
    initIcons();
    await loadQuizzes();
  } catch (error) {
    const el = document.getElementById('quizzes-list');
    if (el) showError(el, 'تعذر فتح صفحة الكويزات.');
  }
}

init();
