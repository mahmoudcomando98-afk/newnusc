/**
 * NUSC Student Hub - Lecture Details
 */

import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import {
  escapeHtml, formatDate, formatFileSize, materialTypeLabel,
  showEmpty, showError, initIcons, showToast
} from './utils.js';

const lectureId = new URLSearchParams(window.location.search).get('id');

async function init() {
  if (!lectureId) {
    window.location.href = '/subjects.html';
    return;
  }
  const result = await protectPage();
  if (!result) return;
  initIcons();
  await loadLecture();
}

async function loadLecture() {
  const el = document.getElementById('lecture-content');
  try {
    const { data: lecture, error } = await supabase
      .from('lectures')
      .select('*, subjects(id, name)')
      .eq('id', lectureId)
      .eq('is_published', true)
      .single();

    if (error || !lecture) {
      showError(el, 'المحاضرة غير موجودة أو غير منشورة');
      return;
    }

    document.getElementById('page-title').textContent = lecture.title;
    document.title = `${lecture.title} | NUSC Student Hub`;

    const { data: materials } = await supabase
      .from('materials')
      .select('id, title, file_name, file_path, file_type, file_size, material_type')
      .eq('lecture_id', lectureId)
      .eq('is_published', true)
      .order('created_at');

    let linksHtml = '';
    if (lecture.external_links?.length) {
      linksHtml = `
        <div class="section mt-3">
          <h3 class="mb-1">روابط إضافية</h3>
          <div class="card">
            ${lecture.external_links.map((link) => `
              <a href="${escapeHtml(link.url || link)}" target="_blank" rel="noopener" class="list-item" style="text-decoration:none">
                <div class="list-item-body">
                  <div class="list-item-title">${escapeHtml(link.title || link.url || link)}</div>
                </div>
              </a>`).join('')}
          </div>
        </div>`;
    }

    let videoHtml = '';
    if (lecture.video_url) {
      videoHtml = `
        <div class="section mt-2">
          <a href="${escapeHtml(lecture.video_url)}" target="_blank" rel="noopener" class="btn btn-outline btn-block">
            مشاهدة الفيديو التعليمي
          </a>
        </div>`;
    }

    let materialsHtml = '';
    if (materials?.length) {
      materialsHtml = `
        <div class="section mt-3">
          <h3 class="mb-1">ملفات المحاضرة</h3>
          <div class="card">
            ${materials.map((m) => `
              <div class="list-item">
                <div class="list-item-icon" data-icon="file"></div>
                <div class="list-item-body">
                  <div class="list-item-title">${escapeHtml(m.title)}</div>
                  <div class="list-item-desc">
                    ${materialTypeLabel(m.material_type)}
                    ${m.file_size ? ` \u00b7 ${formatFileSize(m.file_size)}` : ''}
                  </div>
                </div>
                <button type="button" class="btn btn-sm btn-secondary" data-path="${escapeHtml(m.file_path)}" data-id="${m.id}">
                  <span data-icon="download"></span>
                </button>
              </div>`).join('')}
          </div>
        </div>`;
    } else {
      materialsHtml = `<div class="section mt-3"><div class="card"><p class="text-muted text-center" style="padding:20px">لا توجد ملفات مرفقة</p></div></div>`;
    }

    el.innerHTML = `
      <div class="card mb-2">
        <h1 style="font-size:1.25rem;margin-bottom:8px">${escapeHtml(lecture.title)}</h1>
        <div class="card-meta">
          ${lecture.lecture_number ? `<span class="badge badge-primary">محاضرة ${lecture.lecture_number}</span>` : ''}
          ${lecture.subjects?.name ? `<span>${escapeHtml(lecture.subjects.name)}</span>` : ''}
          ${lecture.lecture_date ? `<span>${formatDate(lecture.lecture_date)}</span>` : ''}
        </div>
        ${lecture.description ? `<p class="mt-2 text-sm">${escapeHtml(lecture.description)}</p>` : ''}
        ${lecture.notes ? `<div class="mt-2"><strong class="text-sm">ملاحظات:</strong><p class="text-sm text-muted">${escapeHtml(lecture.notes)}</p></div>` : ''}
      </div>
      ${videoHtml}
      ${materialsHtml}
      ${linksHtml}`;

    initIcons();
    el.querySelectorAll('[data-path]').forEach((btn) => {
      btn.addEventListener('click', () => downloadFile(btn.dataset.id, btn.dataset.path));
    });
  } catch (err) {
    console.error(err);
    showError(el, 'تعذر تحميل المحاضرة');
  }
}

async function downloadFile(id, path) {
  try {
    const { data, error } = await supabase.storage.from('materials').createSignedUrl(path, 60);
    if (error) throw error;
    if (id) await supabase.rpc('increment_download_count', { p_material_id: id });
    window.open(data.signedUrl, '_blank');
  } catch (err) {
    showToast('تعذر تنزيل الملف', 'error');
  }
}

init();
