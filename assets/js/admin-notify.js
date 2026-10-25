/** Call after admin creates/publishes an announcement or notification. */
import { sendPushToAll } from './push.js';

export async function notifyStudents({ title, body, url = '/notifications.html' }) {
  try {
    return await sendPushToAll({
      title: title || 'إشعار جديد',
      body: String(body || '').slice(0, 180),
      url
    });
  } catch (e) {
    console.warn('[NUSC] notifyStudents:', e);
    return { ok: false, error: e };
  }
}
