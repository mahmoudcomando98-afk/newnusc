/** Increment material download_count after a successful download. */
import { supabase } from './supabase.js';

export async function trackMaterialDownload(materialId) {
  if (!materialId) return;
  try {
    await supabase.rpc('increment_material_download', { p_material_id: materialId });
  } catch (err) {
    try {
      const { data } = await supabase
        .from('materials')
        .select('download_count')
        .eq('id', materialId)
        .maybeSingle();
      const next = (data?.download_count || 0) + 1;
      await supabase.from('materials').update({ download_count: next }).eq('id', materialId);
    } catch (e2) {
      console.warn('[NUSC] download count skip:', e2);
    }
  }
}
