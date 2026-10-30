/**
 * Reuse signed Storage URLs within the tab session.
 * New createSignedUrl tokens defeat browser HTTP cache across page loads;
 * caching the same URL in-session lets the browser reuse a prior response
 * and avoids extra sign+fetch round-trips for the same path.
 */
import { supabase } from './supabase.js';

const cache = new Map();

/**
 * @param {string} path storage object path
 * @param {number} [ttlSec=900] signed URL lifetime (seconds)
 * @param {string} [bucket='materials']
 * @returns {Promise<string>} signed URL
 */
export async function getSignedMaterialUrl(path, ttlSec = 900, bucket = 'materials') {
  if (!path) throw new Error('مسار الملف فاضي');
  const key = bucket + ':' + path;
  const now = Date.now();
  const hit = cache.get(key);
  // refresh 60s before real expiry
  if (hit && hit.expiresAt > now + 60_000) {
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
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.url;
  return null;
}

export function clearSignedUrlCache() {
  cache.clear();
}
