/**
 * Silent online presence — does NOT touch auth session or logout.
 * Upserts last_seen only; failures are ignored.
 */

import { supabase } from './supabase.js';

const INTERVAL_MS = 45 * 1000;
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

let timer = null;
let currentUserId = null;

async function beat(userId) {
  if (!userId) return;
  try {
    const path =
      typeof window !== 'undefined'
        ? String(window.location.pathname || '').slice(0, 200)
        : null;
    const now = new Date().toISOString();
    const { error } = await supabase.from('online_presence').upsert(
      {
        user_id: userId,
        last_seen_at: now,
        updated_at: now,
        path
      },
      { onConflict: 'user_id' }
    );
    if (error) {
      // Silent — never logout or throw to caller
      console.warn('[NUSC presence]', error.message);
    }
  } catch (err) {
    console.warn('[NUSC presence]', err?.message || err);
  }
}

/**
 * Start heartbeats for a logged-in user. Safe to call multiple times.
 * Does not request permission, does not refresh session, does not sign out.
 */
export function startPresence(userId) {
  if (!userId) return;
  if (currentUserId === userId && timer) return;
  stopPresence();
  currentUserId = userId;
  beat(userId);
  timer = setInterval(() => beat(userId), INTERVAL_MS);

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
  }
}

function onVisible() {
  if (document.visibilityState === 'visible' && currentUserId) {
    beat(currentUserId);
  }
}

export function stopPresence() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisible);
  }
  currentUserId = null;
}

/** Admin: count users seen within the last few minutes. */
export async function countOnlineUsers() {
  try {
    const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
    const { count, error } = await supabase
      .from('online_presence')
      .select('user_id', { count: 'exact', head: true })
      .gte('last_seen_at', since);
    if (error) {
      console.warn('[NUSC presence] count:', error.message);
      return null;
    }
    return count ?? 0;
  } catch (err) {
    console.warn('[NUSC presence] count failed:', err?.message || err);
    return null;
  }
}
