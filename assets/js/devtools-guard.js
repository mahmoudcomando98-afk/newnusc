/**
 * DevTools shortcut blocking disabled by request.
 * Real protection is RLS + no secrets in the frontend.
 */

export async function flushPendingDevtoolsAlert() {
  return false;
}

export async function reportDevtoolsAttempt() {
  return false;
}

export function initDevtoolsGuard() {
  /* no-op */
}

export default { initDevtoolsGuard, reportDevtoolsAttempt, flushPendingDevtoolsAlert };
