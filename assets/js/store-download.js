/**
 * Secure store template download.
 * File path is never taken from a public table row the student can browse freely;
 * we call get_approved_store_file() which only returns data after admin approval.
 */
import { supabase } from './supabase.js';

const SIGNED_TTL_SEC = 60;

export async function downloadApprovedStoreProduct(productId) {
  if (!productId) {
    return { ok: false, reason: 'missing_id' };
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return { ok: false, reason: 'auth' };
  }

  // Server-side gate (SECURITY DEFINER): empty result = not approved / not allowed
  const { data: rows, error: rpcErr } = await supabase.rpc('get_approved_store_file', {
    p_product_id: productId
  });

  if (rpcErr) {
    // Fallback if RPC not deployed yet: still require approved order + RLS on files
    const { data: order } = await supabase
      .from('store_orders')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('product_id', productId)
      .eq('status', 'approved')
      .maybeSingle();
    if (!order) {
      return { ok: false, reason: 'not_approved', message: rpcErr.message };
    }
    const { data: fileRow, error: fErr } = await supabase
      .from('store_product_files')
      .select('file_path, file_name')
      .eq('product_id', productId)
      .maybeSingle();
    if (fErr || !fileRow?.file_path) {
      return { ok: false, reason: 'no_file', message: fErr?.message };
    }
    return finishDownload(fileRow.file_path, fileRow.file_name);
  }

  const fileRow = Array.isArray(rows) ? rows[0] : rows;
  if (!fileRow?.file_path) {
    return { ok: false, reason: 'not_approved' };
  }

  return finishDownload(fileRow.file_path, fileRow.file_name);
}

async function finishDownload(filePath, fileName) {
  const { data, error } = await supabase.storage
    .from('store')
    .createSignedUrl(filePath, SIGNED_TTL_SEC);

  if (error || !data?.signedUrl) {
    return { ok: false, reason: 'sign', message: error?.message };
  }

  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = fileName || 'template';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { ok: true };
}
