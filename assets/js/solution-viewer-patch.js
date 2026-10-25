import { showToast, escapeHtml } from './utils.js';
import { resolveSolutionUrl, decodeDataSolution } from './solution-helpers.js';
import { supabase } from './supabase.js';

/** Capture assignment solution clicks and load image reliably */
export function installSolutionViewerPatch() {
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-solution]');
    if (!btn) return;
    // Only handle assignment solutions on subject pages (quiz page has its own handler)
    if (document.body.classList.contains('quizzes-page')) return;
    ev.preventDefault();
    ev.stopPropagation();
    const path = decodeDataSolution(btn);
    if (!path) {
      showToast('مفيش صورة حل مرتبطة بالواجب ده', 'error');
      return;
    }
    let modal = document.getElementById('solution-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'solution-modal';
      modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);padding:16px;align-items:center;justify-content:center';
      modal.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:min(96vw,720px);max-height:92vh;overflow:auto;padding:16px;width:100%"><div class="flex justify-between items-center mb-2"><h3 style="margin:0;font-size:1.05rem">عرض الحل</h3><button type="button" class="btn btn-sm btn-secondary" id="solution-modal-close">إغلاق</button></div><div id="solution-modal-body"></div></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
      document.getElementById('solution-modal-close').addEventListener('click', () => { modal.style.display = 'none'; });
    }
    const body = document.getElementById('solution-modal-body');
    body.innerHTML = '<p class="text-sm text-muted">جاري تحميل صورة الحل…</p>';
    modal.style.display = 'flex';
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess || !sess.session) {
        showToast('سجّل دخول تاني عشان تشوف الحل', 'error');
        modal.style.display = 'none';
        return;
      }
      const url = await resolveSolutionUrl(path);
      body.innerHTML = '<img src="' + escapeHtml(url) + '" alt="صورة الحل" style="max-width:100%;height:auto;border-radius:8px" />';
    } catch (e) {
      console.error(e);
      body.innerHTML = '<p class="text-sm" style="color:var(--danger)">مش قادرين نعرض صورة الحل دلوقتي. بلّغ الأدمن لو استمرت المشكلة.</p>';
      showToast('تعذر عرض الحل', 'error');
    }
  }, true);
}

installSolutionViewerPatch();
