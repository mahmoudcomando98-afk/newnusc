/**
 * COMANDO — خطتي (جدول المذاكرة الشخصي)
 */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { fetchSubjects } from './data-api.js';
import {
  escapeHtml,
  showToast,
  initIcons,
  setActiveNav,
  showEmpty,
  showError
} from './utils.js';

const TYPE_LABEL = { study: 'مذاكرة', solve: 'حل/تمارين', review: 'مراجعة', exam: 'حل/امتحان', other: 'أخرى' };

const state = {
  tasks: [],
  subjects: [],
  days: []
};

const $ = (id) => document.getElementById(id);

async function init() {
  const result = await protectPage();
  if (!result) return;
  setActiveNav('study-plan');
  initIcons();

  try {
    const subjects = await fetchSubjects(50);
    state.subjects = (subjects || []).slice();
  } catch { /* tolerate missing subjects */ }

  const dueInput = $('t-due');
  if (dueInput) {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    dueInput.value = toLocalInputValue(now);
  }

  const subjectSelect = $('t-subject');
  if (subjectSelect) {
    state.subjects.forEach((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.name || 'مادة';
      subjectSelect.appendChild(o);
    });
  }

  await loadTasks();
  bindHandlers();
}

function daysAhead(n = 7) {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push(d);
  }
  return out;
}

function pad(n) { return String(n).padStart(2, '0'); }

function isoDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function toLocalInputValue(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function fullDateLabel(d) {
  return new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

function subjectName(id) {
  if (!id) return null;
  const s = state.subjects.find((x) => x.id === id);
  return s ? (s.name || null) : null;
}

async function loadTasks() {
  state.days = daysAhead(7);
  const start = new Date(state.days[0]);
  const end = new Date(state.days[state.days.length - 1]);
  end.setDate(end.getDate() + 1);
  const { data, error } = await supabase
    .from('study_tasks')
    .select('id, title, subject_id, task_type, due_at, is_done, done_at')
    .gte('due_at', start.toISOString())
    .lt('due_at', end.toISOString())
    .order('due_at', { ascending: true });

  if (error) {
    showError($('study-week'), 'تعذر تحميل خطتي: ' + error.message);
    return;
  }
  state.tasks = data || [];
  render();
}

function render() {
  renderStats();
  renderWeek();
}

function renderStats() {
  const todayIso = isoDate(state.days[0]);
  const todayTasks = state.tasks.filter((t) => t.due_at && isoDate(new Date(t.due_at)) === todayIso);
  const doneToday = todayTasks.filter((t) => t.is_done).length;
  $('stat-today').textContent = String(todayTasks.length);
  $('stat-done-today').textContent = String(doneToday);
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.is_done).length;
  $('stat-week').textContent = total ? Math.round((done / total) * 100) + '%' : '0%';
}

function renderWeek() {
  const container = $('study-week');
  if (!container) return;
  if (!state.tasks.length) {
    container.innerHTML = '<div class="study-empty" style="grid-column:1/-1">لسه ما عندكش مهام في خطتي — ابدأ بإضافة مهمة دلوقتي</div>';
    return;
  }
  container.innerHTML = state.days.map((day, idx) => renderDay(day, idx)).join('');
}

function renderDay(day, idx) {
  const isToday = idx === 0;
  const dayIso = isoDate(day);
  const dayTasks = state.tasks.filter((t) => t.due_at && isoDate(new Date(t.due_at)) === dayIso);
  dayTasks.sort((a, b) => {
    if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
    return String(a.due_at).localeCompare(String(b.due_at));
  });

  const label = idx === 0 ? 'النهاردة' : idx === 1 ? 'بكرة' : new Intl.DateTimeFormat('ar-EG', { weekday: 'long' }).format(day);
  const dateLabel = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long' }).format(day);

  const items = dayTasks.length
    ? dayTasks.map(renderTask).join('')
    : '<div class="study-empty">مفيش — تحب تضيف حاجة؟</div>';

  return (
    '<section class="study-day' + (isToday ? ' is-today' : '') + '" data-day="' + dayIso + '">' +
      '<div class="study-day-header"><div><h3 class="study-day-title">' + escapeHtml(label) + '</h3><span class="study-day-date">' + escapeHtml(dateLabel) + '</span></div></div>' +
      '<div class="study-day-tasks">' + items + '</div>' +
    '</section>'
  );
}

function renderTask(t) {
  const sub = subjectName(t.subject_id);
  const time = new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' }).format(new Date(t.due_at));
  const typeLabel = TYPE_LABEL[t.task_type] || TYPE_LABEL.other;
  const isDone = !!t.is_done;
  const checkChar = isDone
    ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 10"/></svg>'
    : '';
  return (
    '<article class="study-task' + (isDone ? ' is-done' : '') + '" data-id="' + escapeHtml(t.id) + '">' +
      '<button type="button" class="study-task-check" data-action="toggle" aria-pressed="' + String(isDone) + '" aria-label="' + (isDone ? 'إلغاء الإنجاز' : 'علم كمنجزة') + '">' + checkChar + '</button>' +
      '<div class="study-task-body">' +
        '<div class="study-task-title" title="' + escapeHtml(t.title || '') + '">' + escapeHtml(t.title || '') + '</div>' +
        '<div class="study-task-meta">' +
          '<span class="study-task-chip study-task-chip--' + escapeHtml(t.task_type || 'other') + '">' + escapeHtml(typeLabel) + '</span>' +
          (sub ? '<span class="study-task-chip">' + escapeHtml(sub) + '</span>' : '') +
          '<span class="study-task-chip study-task-chip--other">' + escapeHtml(time) + '</span>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="study-task-delete" data-action="delete" aria-label="حذف">×</button>' +
    '</article>'
  );
}

function bindHandlers() {
  $('study-add-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    addTask();
  });

  $('study-week')?.addEventListener('click', async (e) => {
    const actionEl = e.target.closest('[data-action]');
    const taskEl = e.target.closest('.study-task');
    if (!actionEl || !taskEl) return;
    const id = taskEl.dataset.id;
    if (!id) return;
    const act = actionEl.dataset.action;
    if (act === 'toggle') {
      await toggleTask(id);
    } else if (act === 'delete') {
      if (!confirm('تمسح المهمة دي؟')) return;
      await deleteTask(id);
    }
  });
}

async function addTask() {
  const title = String($('t-title')?.value || '').trim();
  const type = $('t-type')?.value || 'study';
  const subjectId = $('t-subject')?.value || null;
  const due = $('t-due')?.value || '';
  if (!title) {
    showToast('اكتب عنوان المهمة.', 'error');
    return;
  }
  const dueDate = due ? new Date(due) : null;
  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    showToast('اختار تاريخ صحيح.', 'error');
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) {
    showToast('سجل دخول تاني.', 'error');
    return;
  }

  const payload = {
    user_id: userId,
    title,
    subject_id: subjectId || null,
    task_type: type,
    due_at: dueDate.toISOString()
  };

  const { data: created, error } = await supabase
    .from('study_tasks')
    .insert(payload)
    .select('id, title, subject_id, task_type, due_at, is_done, done_at')
    .single();

  if (error || !created) {
    showToast(error?.message || 'تعذر الحفظ.', 'error');
    return;
  }

  state.tasks.push(created);
  state.tasks.sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));
  render();

  $('t-title').value = '';
  $('t-subject').value = '';
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  $('t-due').value = toLocalInputValue(now);
  showToast('تمت الإضافة', 'success');
}

async function toggleTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  const nextDone = !task.is_done;
  const { error } = await supabase
    .from('study_tasks')
    .update({ is_done: nextDone, done_at: nextDone ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) {
    showToast('تعذر التحديث: ' + error.message, 'error');
    return;
  }
  task.is_done = nextDone;
  task.done_at = nextDone ? new Date().toISOString() : null;
  render();
}

async function deleteTask(id) {
  const { error } = await supabase.from('study_tasks').delete().eq('id', id);
  if (error) {
    showToast('تعذر الحذف: ' + error.message, 'error');
    return;
  }
  state.tasks = state.tasks.filter((t) => t.id !== id);
  render();
}

init().catch((err) => {
  console.error('[study-plan] init error:', err);
  showError(document.getElementById('study-week'), 'تعذر فتح خطتي. حاول حدّث الصفحة.');
});
