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
  computeQuizStatus,
  quizStatusLabel,
  createCountdown
} from './utils.js';

let currentStatus = 'upcoming';
const countdowns = [];

async function init() {
  const result = await protectPage();
  if (!result) return;

  setActiveNav('quizzes');
  initIcons();

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentStatus = tab.dataset.status;
      loadQuizzes();
    });
  });

  await loadQuizzes();
}

async function loadQuizzes() {
  countdowns.forEach(clearInterval);
  countdowns.length = 0;

  const el = document.getElementById('quizzes-list');
  el.innerHTML = '<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>';

  try {
    try {
      await supabase.rpc('update_quiz_status');
    } catch {}

    const { data, error } = await supabase
      .from('quizzes')
      .select('id, title, description, topics, instructions, start_at, end_at, duration_minutes, quiz_url, status, subjects(name)')
      .eq('is_published', true)
      .order('start_at', { ascending: true });

    if (error) throw error;

    const filtered = (data || []).filter((q) => computeQuizStatus(q) === currentStatus);

    if (!filtered.length) {
      const msgs = {
        upcoming: 'لا توجد كويزات قادمة حالياً',
        open: 'لا توجد كويزات مفتوحة الآن',
        closed: 'لا توجد كويزات منتهية معروضة'
      };
      showEmpty(el, msgs[currentStatus] || 'لا توجد كويزات');
      return;
    }

    el.innerHTML = filtered.map((q) => {
      const status = computeQuizStatus(q);
      const badgeClass = status === 'open' ? 'badge-success' : status === 'closed' ? 'badge-danger' : 'badge-info';
      const countdownId = `cd-${q.id}`;

      return `
        <div class="card mb-2">
          <div class="flex justify-between items-center flex-wrap gap-1">
            <h3 class="card-title">${escapeHtml(q.title)}</h3>
            <span class="badge ${badgeClass}">${quizStatusLabel(status)}</span>
          </div>
          ${q.subjects?.name ? `<p class="text-sm text-muted">${escapeHtml(q.subjects.name)}</p>` : ''}
          ${q.topics ? `<p class="text-sm mt-1"><strong>الموضوعات:</strong> ${escapeHtml(q.topics)}</p>` : ''}
          <div class="card-meta mt-1">
            ${q.start_at ? `<span>البداية: ${formatDate(q.start_at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>` : ''}
            ${q.end_at ? `<span>النهاية: ${formatDate(q.end_at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>` : ''}
            ${q.duration_minutes ? `<span>المدة: ${q.duration_minutes} دقيقة</span>` : ''}
          </div>
          ${status === 'upcoming' && q.start_at ? `<p class="text-sm mt-1"><strong>العداد:</strong> <span id="${countdownId}">—</span></p>` : ''}
          ${q.instructions ? `<p class="text-sm text-muted mt-1">${escapeHtml(q.instructions.slice(0, 150))}</p>` : ''}
          ${q.quiz_url && status === 'open' ? `<a href="${escapeHtml(q.quiz_url)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm mt-2">فتح الكويز</a>` : ''}
        </div>
      `;
    }).join('');

    filtered.forEach((q) => {
      if (computeQuizStatus(q) === 'upcoming' && q.start_at) {
        const el = document.getElementById(`cd-${q.id}`);
        if (el) {
          const id = createCountdown(q.start_at, el);
          if (id) countdowns.push(id);
        }
      }
    });
  } catch (err) {
    console.error(err);
    showError(el, 'تعذر تحميل الكويزات');
  }
}

init();
