/**
 * NUSC Student Hub - Quizzes Page
 * Injects filter tabs if HTML is an old build; defaults to showing all quizzes.
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
  quizStatusLabel,
  showToast
} from './utils.js';

let quizzes = [];
let currentStatus = 'all';

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

function ensureTabs() {
  if (document.getElementById('tabs')) return;
  const list = document.getElementById('quizzes-list');
  if (!list || !list.parentNode) return;

  const tabs = document.createElement('div');
  tabs.id = 'tabs';
  tabs.className = 'tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px';
  tabs.innerHTML = `
    <button type="button" class="tab" data-status="upcoming" role="tab">قادمة</button>
    <button type="button" class="tab" data-status="open" role="tab">مفتوحة</button>
    <button type="button" class="tab" data-status="closed" role="tab">منتهية</button>
    <button type="button" class="tab active" data-status="all" role="tab">الكل</button>
  `;
  list.parentNode.insertBefore(tabs, list);
}

function bindTabs() {
  document.querySelectorAll('#tabs .tab[data-status]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#tabs .tab').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
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
  if (!path) return;
  try {
    const modal = ensureSolutionModal();
    const img = document.getElementById('quiz-solution-img');
    img.removeAttribute('src');
    modal.classList.remove('hidden');
    const { data, error } = await supabase.storage.from('materials').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      const { data: pub } = supabase.storage.from('materials').getPublicUrl(path);
      if (pub?.publicUrl) img.src = pub.publicUrl;
      else {
        showToast('تعذر عرض الحل', 'error');
        modal.classList.add('hidden');
      }
      return;
    }
    img.src = data.signedUrl;
  } catch (e) {
    console.error(e);
    showToast('تعذر عرض الحل', 'error');
  }
}

function renderQuizzes() {
  const el = document.getElementById('quizzes-list');
  if (!el) return;

  const filtered =
    currentStatus === 'all'
      ? quizzes
      : quizzes.filter((quiz) => getQuizStatus(quiz) === currentStatus);

  if (!filtered.length) {
    const messages = {
      upcoming: 'لا توجد كويزات قادمة حاليًا',
      open: 'لا توجد كويزات مفتوحة الآن',
      closed: 'لا توجد كويزات منتهية',
      all: 'لا توجد كويزات منشورة. لو أنت أدمن: أضف كويز من لوحة التحكم.'
    };
    showEmpty(el, messages[currentStatus] || 'لا توجد كويزات');
    return;
  }

  el.innerHTML = filtered
    .map((quiz) => {
      const status = getQuizStatus(quiz);
      const badgeClass =
        status === 'open' ? 'badge-success' : status === 'closed' ? 'badge-danger' : 'badge-info';
      const startDate = getStartDate(quiz);
      const topics = quiz.topics || '';
      const instructions = quiz.instructions || quiz.rules || '';
      const subjectName = quiz.subjects?.name || quiz.subject_name || '';
      const hasSolution = !!quiz.solution_image_path;

      return `
      <article class="card quiz-card mb-2">
        <div class="flex justify-between items-center flex-wrap gap-1">
          <h3 class="card-title" style="margin:0">${escapeHtml(quiz.title || 'كويز')}</h3>
          <span class="badge ${badgeClass}">${escapeHtml(quizStatusLabel(status))}</span>
        </div>
        ${subjectName ? `<p class="text-sm text-muted mt-1">${escapeHtml(subjectName)}</p>` : ''}
        ${startDate ? `<p class="text-sm mt-1"><strong>الموعد:</strong> ${escapeHtml(getQuizDateText(startDate))}</p>` : ''}
        ${quiz.duration_minutes ? `<p class="text-sm mt-1">المدة: ${Number(quiz.duration_minutes)} دقيقة</p>` : ''}
        ${quiz.description ? `<p class="text-sm text-muted mt-1">${escapeHtml(quiz.description)}</p>` : ''}
        ${topics ? `<p class="text-sm mt-1"><strong>الموضوعات:</strong> ${escapeHtml(topics)}</p>` : ''}
        ${instructions ? `<p class="text-sm mt-1"><strong>التعليمات:</strong> ${escapeHtml(instructions)}</p>` : ''}
        <div class="mt-2 flex flex-wrap gap-1">
          ${quiz.quiz_url ? `<a class="btn btn-primary" href="${escapeHtml(quiz.quiz_url)}" target="_blank" rel="noopener noreferrer">فتح الامتحان</a>` : ''}
          ${hasSolution ? `<button type="button" class="btn btn-secondary" data-solution="${escapeHtml(quiz.solution_image_path)}">عرض الحل</button>` : ''}
        </div>
      </article>`;
    })
    .join('');

  el.querySelectorAll('[data-solution]').forEach((btn) => {
    btn.addEventListener('click', () => showSolutionImage(btn.dataset.solution));
  });

  initIcons();
}

async function loadQuizzes() {
  const el = document.getElementById('quizzes-list');
  if (!el) return;

  el.innerHTML =
    '<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>';

  try {
    let data = null;
    let error = null;

    const full = await supabase
      .from('quizzes')
      .select(
        'id, title, description, topics, instructions, start_at, end_at, duration_minutes, total_marks, passing_score, is_published, quiz_url, subject_id, status, solution_image_path, quiz_date, rules'
      );
    data = full.data;
    error = full.error;

    if (
      error &&
      /solution_image_path|quiz_date|column .* does not exist|PGRST204|42703/i.test(
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

    quizzes = rows.map((q) => ({
      ...q,
      subject_name: subjectNames[q.subject_id] || ''
    }));

    renderQuizzes();
  } catch (error) {
    console.error('[NUSC] loadQuizzes:', error);
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    let msg = 'تعذر تحميل الكويزات.';
    if (/relation|does not exist|PGRST205|42P01/i.test(message + code)) {
      msg = 'جدول الكويزات غير موجود في Supabase (public.quizzes).';
    } else if (/permission|RLS|42501/i.test(message + code)) {
      msg = 'مفيش صلاحية لقراءة الكويزات. راجع RLS.';
    }
    showError(el, msg);
  }
}

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;

    setActiveNav('quizzes');
    ensureTabs();
    bindTabs();
    initIcons();
    await loadQuizzes();
  } catch (error) {
    console.error('Quizzes init:', error);
    const el = document.getElementById('quizzes-list');
    if (el) showError(el, 'تعذر فتح صفحة الكويزات. حاول تسجيل الدخول مجددًا.');
  }
}

init();
