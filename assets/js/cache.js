/**
 * NUSC client cache — localStorage with TTL.
 * Used to reduce repeated Supabase reads on the same session.
 */

const PREFIX = 'nusc_cache:';
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

function key(name) {
  return PREFIX + String(name);
}

export function cacheGet(name) {
  try {
    const raw = localStorage.getItem(key(name));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.exp && Date.now() > parsed.exp) {
      localStorage.removeItem(key(name));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function cacheSet(name, data, ttlMs = DEFAULT_TTL_MS) {
  try {
    localStorage.setItem(
      key(name),
      JSON.stringify({
        exp: Date.now() + Math.max(1000, ttlMs),
        data
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function cacheRemove(name) {
  try {
    localStorage.removeItem(key(name));
  } catch {
    /* ignore */
  }
}

export function cacheClear(prefix = '') {
  try {
    const full = PREFIX + prefix;
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(full)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Fetch with cache: returns cached value if fresh, otherwise runs loader and stores result. */
export async function cached(name, loader, ttlMs = DEFAULT_TTL_MS) {
  const hit = cacheGet(name);
  if (hit !== null && hit !== undefined) return hit;
  const data = await loader();
  if (data !== null && data !== undefined) cacheSet(name, data, ttlMs);
  return data;
}

/** Soft refresh: return cache immediately, refresh in background. */
export async function cachedStaleWhileRevalidate(name, loader, ttlMs = DEFAULT_TTL_MS) {
  const hit = cacheGet(name);
  const refresh = Promise.resolve()
    .then(loader)
    .then((data) => {
      if (data !== null && data !== undefined) cacheSet(name, data, ttlMs);
      return data;
    })
    .catch(() => hit);
  if (hit !== null && hit !== undefined) {
    refresh.catch(() => {});
    return hit;
  }
  return refresh;
}
