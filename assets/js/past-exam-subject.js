/**
 * Past exams for one subject.
 */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import {
  escapeHtml,
  showEmpty,
  showError,
  initIcons,
  formatFileSize,
  timeAgo,
  showToast
} from './utils.js';
import { downloadFileComplete } from './download-file.js';

const subjectId = new URLSearchParams(window.location.search).get('id');

function shortFileType(raw) {
  if (!raw) return '';
  const s = String(raw).toLowerCase();
  if (s.includes('pdf')) return 'PDF';
  if (s.includes('word') || s.includes('doc')) return 'Word';
  if (s.includes('image') || s.includes('png') || s.includes('jpg')) return 'صورة';
  return String(raw).slice(0, 12);
}

async function init() {
  if (!subjectId) {
    window.location.replace('/past-exams.html');
    return;
  }
  const result = await protectPage();
  if (!result) return;
  initIcons();
  await load();
}

async function load() {
  const header = document.getElementById('subject-header');
  const list = document.getElementById('exams-list');
  try {
    const { data: subject, error: subErr } = await supabase
      .from('subjects')
      .select('*')
      .eq('id', subjectId)
      .maybeSingle();
    if (subErr) throw subErr;
    if (!subject || subject.is_published === false || subject.is_active === false) {
      showError(header, 'المادة مش متاحة.');
      list.innerHTML = '';
      return;
    }

    const title = subject.name || 'مادة';
    document.title = `امتحانات ${title} | NUSC`;
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = title;
    header.innerHTML = `
      <h1 style="font-size:1.15rem;margin:0 0 4px">${escapeHtml(title)}</h1>
      <p class="text-sm text-muted" style="margin:0">الامتحانات السابقة</p>
      ${subject.code ? `<p class="mt-1"><span class="badge badge-primary">${escapeHtml(subject.code)}</span></p>` : ''}
    `;

    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('material_type', 'past_exam')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const exams = (data || []).filter((m) => m.is_published !== false);
    if (!exams.length) {
      showEmpty(list, 'لسه مفيش امتحانات سابقة للمادة دي.');
      return;
    }

    list.innerHTML = `<div class="card">${exams
      .map((exam) => {
        const typeLabel = shortFileType(exam.file_type);
        const year = exam.exam_year || exam.year || '';
        const platformLink = `${window.location.origin}/file-view.html?id=${encodeURIComponent(exam.id)}`;
        return `
      <div class="material-card">
        <div class="material-card-top">
          <div class="material-card-icon" data-icon="clipboard"></div>
          <div class="material-card-body">
            <div class="material-card-title">${escapeHtml(exam.title || 'امتحان')}</div>
            <div class="material-card-meta">
              <span class="badge">امتحان سابق</span>
              ${year ? `<span>${escapeHtml(String(year))}</span>` : ''}
              ${typeLabel ? `<span>${escapeHtml(typeLabel)}</span>` : ''}
              ${exam.file_size ? `<span>${escapeHtml(formatFileSize(exam.file_size))}</span>` : ''}
              ${exam.created_at ? `<span>${escapeHtml(timeAgo(exam.created_at))}</span>` : ''}
            </div>
            ${exam.description ? `<p class="material-card-desc">${escapeHtml(exam.description)}</p>` : ''}
          </div>
        </div>
        <div class="material-card-actions">
          <button type="button" class="btn btn-sm btn-primary material-action-btn" data-view="${escapeHtml(exam.id)}">عرض</button>
          <button type="button" class="btn btn-sm btn-secondary material-action-btn" data-download="${escapeHtml(exam.id)}" data-path="${escapeHtml(exam.file_path || '')}">
            <span class="dl-spinner hidden" aria-hidden="true"></span>
            <span class="material-dl-label">تنزيل</span>
          </button>
          <button type="button" class="btn btn-sm btn-outline material-action-btn" data-copy="${escapeHtml(platformLink)}">نسخ الرابط</button>
        </div>
      </div>`;
      })
      .join('')}</div>`;

    list.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.location.href = `/file-view.html?id=${encodeURIComponent(btn.dataset.view)}`;
      });
    });
    list.querySelectorAll('[data-download]').forEach((btn) => {
      btn.addEventListener('click', () => downloadExam(btn.dataset.download, btn.dataset.path, btn));
    });
    list.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.copy);
          showToast('تم نسخ الرابط.', 'success');
        } catch {
          showToast('ما قدرناش ننسخ الرابط.', 'error');
        }
      });
    });
    initIcons();
  } catch (error) {
    console.error(error);
    showError(list, 'تعذر تحميل الامتحانات. حاول مرة أخرى.');
  }
}

async function downloadExam(id, path, button) {
  if (!path) {
    showToast('مسار الملف مش متاح.', 'error');
    return;
  }
  try {
    const { data, error } = await supabase.storage.from('materials').createSignedUrl(path, 120);
    if (error) throw error;
    const nameGuess = (path.split('/').pop() || 'exam.pdf').split('?')[0];
    await downloadFileComplete({ url: data.signedUrl, filename: nameGuess, button });
    showToast('تم تنزيل الملف.', 'success');
  } catch (error) {
    console.error(error);
    showToast('مش قادرين ننزّل الملف دلوقتي.', 'error');
  }
}

init();
