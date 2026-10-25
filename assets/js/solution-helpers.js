/**
 * Shared solution image URL resolution (assignments + quizzes)
 */
import { supabase } from './supabase.js';

export function normalizeStoragePath(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let path = raw.trim();
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  path = path.replace(/^\/+/, '');
  path = path.replace(/^materials\//i, '');
  path = path.replace(/^object\/(?:public|sign)\/materials\//i, '');
  try {
    if (/%[0-9A-Fa-f]{2}/.test(path)) path = decodeURIComponent(path);
  } catch { /* keep */ }
  return path;
}

export async function resolveSolutionUrl(pathOrUrl) {
  const path = normalizeStoragePath(pathOrUrl);
  if (!path) throw new Error('empty');
  if (/^https?:\/\//i.test(path)) return path;

  const { data, error } = await supabase.storage.from('materials').createSignedUrl(path, 3600);
  if (!error && data?.signedUrl) return data.signedUrl;

  const alts = [];
  if (!path.startsWith('solutions/')) alts.push('solutions/' + path);
  if (path.includes('/')) alts.push(path.split('/').slice(-2).join('/'));
  for (const alt of alts) {
    const r = await supabase.storage.from('materials').createSignedUrl(alt, 3600);
    if (!r.error && r.data?.signedUrl) return r.data.signedUrl;
  }

  const { data: pub } = supabase.storage.from('materials').getPublicUrl(path);
  if (pub?.publicUrl) return pub.publicUrl;

  throw error || new Error('signed_url_failed');
}

export function decodeDataSolution(el) {
  let p = el.getAttribute('data-solution') || '';
  try { p = decodeURIComponent(p); } catch { /* keep */ }
  return p;
}
