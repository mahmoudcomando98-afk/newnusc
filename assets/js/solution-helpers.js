/**
 * Shared helpers for solution image signed URLs (session-cached).
 */
import { getSignedMaterialUrl } from './signed-url-cache.js';

export async function resolveSolutionImageUrl(path) {
  if (!path) return null;
  try {
    return await getSignedMaterialUrl(path, 600);
  } catch {
    return null;
  }
}
