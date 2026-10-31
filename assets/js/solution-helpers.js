/**
 * Shared helpers for solution image paths and signed URLs.
 */
import { getSignedMaterialUrl } from './signed-url-cache.js';

/** Normalize a storage object path or full URL into a bucket-relative path. */
export function normalizeStoragePath(raw) {
  if (!raw) return '';
  let path = String(raw).trim();
  if (!path) return '';

  // Full public/signed URL → extract object path after /object/…/materials/
  try {
    if (/^https?:\/\//i.test(path)) {
      const u = new URL(path);
      const markers = ['/object/public/materials/', '/object/sign/materials/', '/object/authenticated/materials/'];
      for (const m of markers) {
        const idx = u.pathname.indexOf(m);
        if (idx !== -1) {
          path = decodeURIComponent(u.pathname.slice(idx + m.length));
          break;
        }
      }
    }
  } catch {
    /* keep path */
  }

  path = path.replace(/^\/+/, '');
  if (path.startsWith('materials/')) path = path.slice('materials/'.length);
  return path;
}

/** Read solution path from a button[data-solution] (may be URI-encoded). */
export function decodeDataSolution(btn) {
  if (!btn) return '';
  const raw = btn.getAttribute('data-solution') || btn.dataset?.solution || '';
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Resolve a solution image path to a usable signed URL (session-cached).
 * @param {string} path storage path or URL
 * @returns {Promise<string|null>}
 */
export async function resolveSolutionUrl(path) {
  const normalized = normalizeStoragePath(path);
  if (!normalized) return null;
  try {
    return await getSignedMaterialUrl(normalized, 600);
  } catch (err) {
    console.warn('[NUSC] resolveSolutionUrl failed:', err);
    return null;
  }
}

/** Alias used by subject-details / other pages. */
export async function resolveSolutionImageUrl(path) {
  return resolveSolutionUrl(path);
}
