/* subject-details — materials include is_pinned for student view */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import {
  escapeHtml,
  showEmpty,
  showError,
  showToast,
  initIcons,
  timeAgo
} from './utils.js';

let subjectId = null;
let currentProfile = null;

function qs(name) {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

function safeHttpUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch {
    return '';
  }
}

function isPinnedFlag(row) {
  return row?.is_pinned === true || row?.is_pinned === 'true' || row?.is_pinned === 1 || row?.is_pinned === '1';
}

async function init() {
  subjectId = qs('id');
  if (!subjectId) {
    window.location.href = '/subjects.html';
    return;
  }
  const result = await protectPage();
  if (!result) return;
  currentProfile = result.profile || null;
  initIcons();
  await loadSubject();
  await loadTab('lectures');
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => loadTab(btn.dataset.tab));
  });
}

async function loadSubject() {
  let data = null;
  let error = null;
  ({ data, error } = await supabase
    .from('subjects')
    .select('id, name, code, instructor, description, is_published, is_active')
    .eq('id', subjectId)
    .maybeSingle());
  if (error) {
    ({ data, error } = await supabase.from('subjects').select('*').eq('id', subjectId).maybeSingle());
  }
  if (error || !data) {
    showToast('تعذر تحميل المادة.', 'error');
    return;
  }
  const titleEl = document.getElementById('subject-title');
  const codeEl = document.getElementById('subject-code');
  if (titleEl) titleEl.textContent = data.name || 'مادة';
  if (codeEl) codeEl.textContent = data.code || '';
  document.title = (data.name || 'مادة') + ' | COMANDO';
}

async function loadSubjectMaterials() {
  let data = null;
  let error = null;
  const preferred =
    'id, title, description, subject_id, material_type, file_type, file_name, file_size, file_path, solution_image_path, due_at, created_at, is_published, is_pinned, is_delivered, submission_url, publish_at, download_count';
  ({ data, error } = await supabase.from('materials').select(preferred).eq('subject_id', subjectId));
  if (error) {
    ({ data, error } = await supabase.from('materials').select('*').eq('subject_id', subjectId));
  }
  if (error) throw error;
  return (data || [])
    .filter((item) => {
      if (item.is_published === false) return false;
      if (item.publish_at) {
        const t = new Date(item.publish_at).getTime();
        if (!Number.isNaN(t) && t > Date.now()) return false;
      }
      return true;
    })
    .map((item) => ({ ...item, material_type: item.material_type || 'lecture' }))
    .sort((a, b) => {
      const pinA = isPinnedFlag(a) ? 1 : 0;
      const pinB = isPinnedFlag(b) ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
}

function shortFileType(raw) {
  if (!raw) return '';
  const s = String(raw).toLowerCase();
  if (s.includes('pdf')) return 'PDF';
  if (s.includes('word') || s.includes('doc')) return 'Word';
  if (s.includes('powerpoint') || s.includes('ppt')) return 'PowerPoint';
  if (s.includes('sheet') || s.includes('xls')) return 'Excel';
  if (s.includes('zip') || s.includes('rar')) return 'أرشيف';
  if (s.includes('image') || s.includes('png') || s.includes('jpg') || s.includes('jpeg') || s.includes('webp'))
    return 'صورة';
  if (s.includes('/')) return s.split('/').pop().toUpperCase().slice(0, 8);
  return String(raw).slice(0, 12);
}

function freshnessBadgesHtml(material) {
  try {
    const created = material.created_at ? new Date(material.created_at).getTime() : 0;
    if (!created) return '';
    const age = Date.now() - created;
    if (age < 1000 * 60 * 60 * 48) return '<span class="badge badge-success">جديد</span>';
  } catch {
    /* ignore */
  }
  return '';
}

function materialCard(material, badgeLabel) {
  const hasSolution = !!(material.solution_image_path || material.solution_image_url || material.solution_url);
  const solutionPath = material.solution_image_path || material.solution_image_url || material.solution_url || '';
  const isAssignment = badgeLabel === 'واجب' || material.material_type === 'assignment';
  let submitLink = '';
  if (isAssignment && material.submission_url) submitLink = safeHttpUrl(material.submission_url);
  const isDelivered = isAssignment && !!material.is_delivered;
  const dueRaw = material.due_at || material.deadline_at || material.due_date || null;
  let dueDate = '';
  if (isAssignment && dueRaw) {
    try {
      dueDate = new Date(dueRaw).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      dueDate = '';
    }
  }
  const typeLabel = shortFileType(material.file_type || material.file_name || '');
  const filePath = material.file_path || '';
  return `
    <article class="material-card card" data-id="${escapeHtml(String(material.id))}">
      <div class="material-card-body">
        <div class="material-card-title">${isPinnedFlag(material) ? '<span data-icon="pin" class="pin-icon"></span>' : ''}${escapeHtml(material.title || 'ملف')} ${freshnessBadgesHtml(material)}</div>
        <div class="material-card-meta flex gap-1 items-center" style="flex-wrap:wrap;margin-top:6px">
          ${badgeLabel ? `<span class="badge">${escapeHtml(badgeLabel)}</span>` : ''}
          ${isPinnedFlag(material) ? '<span class="badge badge-primary">مثبّت</span>' : ''}
          ${typeLabel ? `<span class="badge">${escapeHtml(typeLabel)}</span>` : ''}
          ${isDelivered ? '<span class="badge badge-success">تم التسليم</span>' : ''}
          ${dueDate && !isDelivered ? `<span class="text-sm text-muted">آخر موعد: ${escapeHtml(dueDate)}</span>` : ''}
        </div>
        <div class="material-card-actions flex gap-1" style="margin-top:10px;flex-wrap:wrap">
          ${filePath ? `<button type="button" class="btn btn-sm btn-primary" data-download="${escapeHtml(filePath)}" data-name="${escapeHtml(material.title || 'file')}">تنزيل</button>` : ''}
          ${hasSolution ? `<button type="button" class="btn btn-sm btn-outline" data-solution="${escapeHtml(solutionPath)}">عرض الحل</button>` : ''}
          ${submitLink ? `<a class="btn btn-sm btn-secondary" href="${escapeHtml(submitLink)}" target="_blank" rel="noopener">رابط التسليم</a>` : ''}
        </div>
      </div>
    </article>`;
}

async function loadTab(tab) {
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const el = document.getElementById('content-list');
  if (!el) return;
  el.innerHTML = '<div class="text-muted text-sm">جاري التحميل…</div>';
  try {
    if (tab === 'announcements') {
      await loadAnnouncements(el);
      return;
    }
    const materials = await loadSubjectMaterials();
    const map = {
      lectures: ['lecture', 'محاضرة'],
      sections: ['section', 'سكشن'],
      assignments: ['assignment', 'واجب'],
      summaries: ['summary', 'ملخص'],
      past_exams: ['past_exam', 'امتحان سابق']
    };
    const [type, label] = map[tab] || ['lecture', 'ملف'];
    let list = materials.filter((m) => String(m.material_type || '').toLowerCase() === type);
    if (tab === 'lectures' && !list.length) {
      list = materials.filter((m) => !['assignment', 'section', 'summary', 'past_exam'].includes(String(m.material_type || '').toLowerCase()));
    }
    if (!list.length) {
      showEmpty(el, 'مفيش ملفات في القسم ده لسه.');
      return;
    }
    el.innerHTML = list.map((m) => materialCard(m, label)).join('');
    initIcons();
    bindMaterialActions(el);
  } catch (err) {
    console.error(err);
    showError(el, 'تعذر الاتصال بمحتوى المحاضرات أو الملفات. جرب مرة تانية.');
  }
}

function bindMaterialActions(el) {
  el.querySelectorAll('[data-download]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const path = btn.getAttribute('data-download');
      if (!path) return;
      window.open(path.startsWith('http') ? path : path, '_blank', 'noopener');
    });
  });
  el.querySelectorAll('[data-solution]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const path = btn.getAttribute('data-solution');
      if (path) window.open(path, '_blank', 'noopener');
    });
  });
}

async function loadAnnouncements(el) {
  let data = null;
  let error = null;
  ({ data, error } = await supabase
    .from('announcements')
    .select('id, title, content, body, is_pinned, is_published, created_at, subject_id')
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false })
    .limit(40));
  if (error) {
    ({ data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false })
      .limit(40));
  }
  if (error) {
    showError(el, 'تعذر تحميل الإعلانات.');
    return;
  }
  const rows = (data || []).filter((a) => a.is_published !== false);
  if (!rows.length) {
    showEmpty(el, 'مفيش إعلانات للمادة دي.');
    return;
  }
  rows.sort((a, b) => Number(isPinnedFlag(b)) - Number(isPinnedFlag(a)));
  el.innerHTML = rows
    .map(
      (a) => `
      <div class="list-item">
        <div class="list-item-body">
          <div class="list-item-title">${isPinnedFlag(a) ? '<span data-icon="pin" class="pin-icon"></span>' : ''}${escapeHtml(a.title || 'إعلان')}</div>
          <div class="list-item-desc">${escapeHtml((a.content || a.body || '').slice(0, 180))}</div>
          <div class="text-sm text-muted">${timeAgo(a.created_at)}</div>
        </div>
      </div>`
    )
    .join('');
  initIcons();
}

init().catch((e) => {
  console.error(e);
  showToast('تعذر فتح صفحة المادة.', 'error');
});
