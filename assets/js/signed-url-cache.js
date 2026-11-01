/**
 * Reuse signed Storage URLs within the tab session.
 * Longer TTL + session reuse reduces re-sign + re-download (Storage Egress).
 */
import { supabase } from './supabase.js';

const cache = new Map();

/** Default 1 hour — same token in-session lets the browser HTTP-cache the file bytes. */
const DEFAULT_TTL_SEC = 3600;

/**
 * @param {string} path storage object path
 * @param {number} [ttlSec=3600] signed URL lifetime (seconds)
 * @param {string} [bucket='materials']
 * @returns {Promise<string>} signed URL
 */
export async function getSignedMaterialUrl(path, ttlSec = DEFAULT_TTL_SEC, bucket = 'materials') {
  if (!path) throw new Error('مسار الملف فاضي');
  const key = bucket + ':' + path;
  const now = Date.now();
  const hit = cache.get(key);
  // refresh 90s before real expiry
  if (hit && hit.expiresAt > now + 90_000) {
    return hit.url;
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSec);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('تعذر إنشاء رابط الملف');
  cache.set(key, {
    url: data.signedUrl,
    expiresAt: now + ttlSec * 1000
  });
  return data.signedUrl;
}

export function peekSignedMaterialUrl(path, bucket = 'materials') {
  const hit = cache.get(bucket + ':' + path);
  if (hit && hit.expiresAt > Date.now() + 90_000) return hit.url;
  return null;
}

export function clearSignedUrlCache() {
  cache.clear();
}
