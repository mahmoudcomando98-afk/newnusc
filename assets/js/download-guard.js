/**
 * Soft download reminder: first download is quiet;
 * later attempts show a friendly message but still allow download.
 */
import { supabase } from './supabase.js';
import { showToast } from './utils.js';

function storageKey(userId, materialId) {
  return `nusc_dl_${userId}_${materialId}`;
}

function readLocalPrior(userId, materialId) {
  try {
    return localStorage.getItem(storageKey(userId, materialId)) === '1';
  } catch {
    return false;
  }
}

function writeLocalPrior(userId, materialId) {
  try {
    localStorage.setItem(storageKey(userId, materialId), '1');
  } catch {
    /* private mode */
  }
}

/**
 * Call before starting the actual download.
 * Shows a soft message if the student downloaded this file before.
 * Always allows the download to continue.
 * @returns {Promise<{ prior: boolean }>}
 */
export async function remindIfAlreadyDownloaded(materialId) {
  if (!materialId) return { prior: false };

  let userId = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id || null;
  } catch {
    userId = null;
  }
  if (!userId) return { prior: false };

  let prior = readLocalPrior(userId, materialId);

  try {
    const { data, error } = await supabase.rpc('record_material_download', {
      p_material_id: materialId
    });
    if (!error && data) {
      prior = !!data.prior;
    } else {
      // fallback without RPC: read then upsert
      const { data: row } = await supabase
        .from('material_user_downloads')
        .select('download_count')
        .eq('user_id', userId)
        .eq('material_id', materialId)
        .maybeSingle();
      if (row?.download_count > 0) prior = true;
      if (row) {
        await supabase
          .from('material_user_downloads')
          .update({
            download_count: (row.download_count || 1) + 1,
            last_downloaded_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('material_id', materialId);
      } else {
        await supabase.from('material_user_downloads').insert({
          user_id: userId,
          material_id: materialId,
          download_count: 1
        });
      }
    }
  } catch {
    /* table/rpc may not exist yet — localStorage still works */
  }

  writeLocalPrior(userId, materialId);

  if (prior) {
    showToast('انت محمّل الملف مرة، كفاية ونبي. تقدر تنزّله تاني عادي.', 'info', 4500);
  }

  return { prior };
}
