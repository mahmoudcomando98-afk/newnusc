/** Shared material download with soft re-download reminder */
import { supabase } from './supabase.js';
import { showToast } from './utils.js';
import { getSignedMaterialUrl } from './signed-url-cache.js';
import { downloadFileComplete } from './download-file.js';
import { remindIfAlreadyDownloaded } from './download-guard.js';

export async function downloadMaterialFile(id, path, button) {
  if (!path) {
    showToast('مسار الملف غير متوفر.', 'error');
    return;
  }
  try {
    await remindIfAlreadyDownloaded(id);
    const url = await getSignedMaterialUrl(path, 900);
    try {
      await supabase.rpc('increment_download_count', { p_material_id: id });
    } catch (countError) {
      console.warn('Could not count file download:', countError);
    }
    const nameGuess =
      (button?.dataset?.name || path.split('/').pop() || 'file').split('?')[0];
    const fileSize = Number(button?.dataset?.size) || 0;
    await downloadFileComplete({ url, filename: nameGuess, button, fileSize });
    showToast('تم تنزيل الملف.', 'success');
  } catch (error) {
    console.error(error);
    showToast('تعذر تنزيل الملف.', 'error');
  }
}
