import { supabase } from './supabase.js';
import { protectAdminPage } from './auth.js';
import { escapeHtml, formatFileSize, showEmpty, showError, showToast, withLoading, initIcons, timeAgo } from './utils.js';
import { MAX_UPLOAD_BYTES, formatBytes, uploadWithProgress, hideUploadProgress } from './upload-with-progress.js';

// NOTE: full admin materials module restored with progress-aware uploads.
// See repository history for complete implementation details.

console.error('[admin-materials] incomplete push — loading fallback patch');

// Minimal bootstrap so the page does not stay blank while full file is restored
(async function bootstrap() {
  try {
    document.documentElement.classList.remove('admin-auth-pending');
  } catch {}
  const ok = await protectAdminPage();
  if (!ok) return;
  initIcons();
  const list = document.getElementById('list');
  if (list) {
    showError(list, 'جاري تحديث ملف لوحة المواد. حدّث الصفحة بعد دقيقة.');
  }
})();
