/**
 * Mandatory WhatsApp group join gate (UI only — cannot verify real membership).
 * After user opens the invite and confirms, we unlock the home page.
 */

const WA_URL = 'https://chat.whatsapp.com/FOkYIVS0bHdLkdHIuLo7Zp';
const STORAGE_KEY = 'comando_wa_group_joined_v1';

export function hasJoinedWhatsAppGroup() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markWhatsAppJoined() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* private mode */
  }
}

export function setupWhatsAppGate({ skip = false } = {}) {
  if (skip || hasJoinedWhatsAppGroup()) return;

  const gate = document.getElementById('wa-gate');
  if (!gate) return;

  gate.classList.add('is-visible');
  gate.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  const joinBtn = document.getElementById('wa-gate-join');
  const doneBtn = document.getElementById('wa-gate-done');
  let opened = false;

  if (joinBtn) {
    joinBtn.addEventListener('click', () => {
      opened = true;
      if (doneBtn) {
        doneBtn.disabled = false;
        doneBtn.textContent = 'انضممت للجروب — متابعة';
      }
    });
  }

  if (doneBtn) {
    doneBtn.disabled = true;
    doneBtn.addEventListener('click', () => {
      if (!opened) {
        // still allow after second click if they already joined before
        opened = true;
        doneBtn.disabled = false;
        return;
      }
      markWhatsAppJoined();
      gate.classList.remove('is-visible');
      gate.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    });
  }
}

export { WA_URL };
