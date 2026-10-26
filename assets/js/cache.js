/**
 * NUSC client cache — localStorage with TTL + stale-while-revalidate.
 * Speeds up repeat visits even when the network is slow or under load.
 */

const PREFIX = 'nusc_cache:';
const DEFAULT_TTL_MS = 3 * 60 * 1000; // 3 minutes fresh
const DEFAULT_MAX_STALE_MS = 30 * 60 * 1000; // still usable up to 30 min

function key(name) {
  return PREFIX + String(name);
}

function readEntry(name) {
  try {
    const raw = localStorage.getItem(key(name));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Fresh data only (within TTL). */
export function cacheGet(name) {
  const entry = readEntry(name);
  if (!entry) return null;
  if (entry.exp && Date.now() > entry.exp) {
    return null;
  }
  return entry.data;
}

/**
 * Return data even if TTL expired, as long as within maxStale window.
 * Useful to paint UI instantly under server pressure.
 */
export function cacheGetSoft(name, maxStaleMs = DEFAULT_MAX_STALE_MS) {
  const entry = readEntry(name);
  if (!entry) return null;
  const written = entry.written || (entry.exp ? entry.exp - DEFAULT_TTL_MS : 0);
  if (written && Date.now() - written > maxStaleMs) {
    try {
      localStorage.removeItem(key(name));
    } catch {
      /* ignore */
    }
    return null;
  }
  return entry.data ?? null;
}

export function cacheSet(name, data, ttlMs = DEFAULT_TTL_MS) {
  try {
    const now = Date.now();
    localStorage.setItem(
      key(name),
      JSON.stringify({
        written: now,
        exp: now + Math.max(1000, ttlMs),
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

/**
 * Stale-while-revalidate:
 * - If any usable cache exists → return it immediately and refresh in background.
 * - If empty → await network once.
 * onUpdate(fresh) is called when background refresh finishes (optional).
 */
export async function cachedStaleWhileRevalidate(
  name,
  loader,
  { ttlMs = DEFAULT_TTL_MS, maxStaleMs = DEFAULT_MAX_STALE_MS, onUpdate } = {}
) {
  const soft = cacheGetSoft(name, maxStaleMs);

  const refresh = Promise.resolve()
    .then(loader)
    .then((data) => {
      if (data !== null && data !== undefined) cacheSet(name, data, ttlMs);
      if (typeof onUpdate === 'function' && data !== null && data !== undefined) {
        try {
          onUpdate(data);
        } catch {
          /* ignore render errors */
        }
      }
      return data;
    });

  if (soft !== null && soft !== undefined) {
    refresh.catch(() => {});
    return soft;
  }

  return refresh;
}

/** Run independent loaders in parallel; never rejects the whole batch. */
export async function parallelAll(tasks) {
  const entries = Object.entries(tasks);
  const results = await Promise.all(
    entries.map(async ([name, fn]) => {
      try {
        const value = await fn();
        return [name, { ok: true, value }];
      } catch (error) {
        return [name, { ok: false, error }];
      }
    })
  );
  return Object.fromEntries(results);
}
