/**
 * Client cache — localStorage with TTL + stale-while-revalidate.
 * Empty arrays/objects are not treated as a lasting success (forces network).
 */

const PREFIX = 'comando_cache:';
const LEGACY_PREFIX = 'nusc_cache:';
const DEFAULT_TTL_MS = 90 * 1000;
const DEFAULT_MAX_STALE_MS = 20 * 60 * 1000;

function key(name) {
  return PREFIX + String(name);
}

function isEmptyPayload(data) {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === 'object') {
    if (Array.isArray(data.rows) && data.rows.length === 0) return true;
    if (Array.isArray(data.assignments) && data.assignments.length === 0 && !data.names) return true;
  }
  return false;
}

function readEntry(name) {
  try {
    let raw = localStorage.getItem(key(name));
    if (!raw) {
      raw = localStorage.getItem(LEGACY_PREFIX + String(name));
      if (raw) {
        try {
          localStorage.setItem(key(name), raw);
          localStorage.removeItem(LEGACY_PREFIX + String(name));
        } catch {
          /* ignore */
        }
      }
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function cacheGet(name) {
  const entry = readEntry(name);
  if (!entry) return null;
  if (entry.exp && Date.now() > entry.exp) return null;
  if (isEmptyPayload(entry.data)) return null;
  return entry.data;
}

export function cacheGetSoft(name, maxStaleMs = DEFAULT_MAX_STALE_MS) {
  const entry = readEntry(name);
  if (!entry) return null;
  if (isEmptyPayload(entry.data)) return null;
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
    if (isEmptyPayload(data)) {
      try {
        localStorage.removeItem(key(name));
      } catch {
        /* ignore */
      }
      return false;
    }
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
    localStorage.removeItem(LEGACY_PREFIX + String(name));
  } catch {
    /* ignore */
  }
}

export function cacheClear(prefix = '') {
  try {
    const prefixes = [PREFIX + prefix, LEGACY_PREFIX + prefix];
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && prefixes.some((p) => k.startsWith(p))) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export async function cached(name, loader, ttlMs = DEFAULT_TTL_MS) {
  const hit = cacheGet(name);
  if (hit !== null && hit !== undefined) return hit;
  const data = await loader();
  if (data !== null && data !== undefined) cacheSet(name, data, ttlMs);
  return data;
}

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
          /* ignore */
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
