/**
 * Push + in-app notify when assignment is uploaded or solution added.
 */
import { supabase } from './supabase.js';
import { showToast } from './utils.js';
import { sendPushToAll } from './push.js';

function formatDueForMessage(dueAt) {
  if (!dueAt) return '';
  try {
    return new Date(dueAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

export function buildAssignmentNotify({ subjectName, hasSolution, dueAt, isNew }) {
  const title = (subjectName || 'مادة دراسية').slice(0, 120);
  const parts = [];
  if (isNew) {
    parts.push('تم رفع واجب جديد للمادة.');
  } else if (hasSolution) {
    parts.push('اتضاف حل للواجب.');
  } else {
    parts.push('فيه تحديث على واجب المادة.');
  }
  const dueText = formatDueForMessage(dueAt);
  if (dueText) {
    parts.push('آخر موعد للتسليم: ' + dueText + '.');
  } else {
    parts.push('راجع تفاصيل الواجب من داخل المادة.');
  }
  if (hasSolution) {
    parts.push('الواجب موجود بالحل بتاعه.');
  }
  return { title, body: parts.join(' ').slice(0, 500) };
}

export async function notifyAssignmentToStudents({ subjectId, subjectName, hasSolution, dueAt, isNew }) {
  const msg = buildAssignmentNotify({ subjectName, hasSolution, dueAt, isNew });
  const link = subjectId
    ? '/subject-details.html?id=' + encodeURIComponent(subjectId)
    : '/subjects.html';

  try {
    await supabase.from('notifications').insert({
      title: msg.title,
      body: msg.body,
      type: 'info',
      link,
      is_global: true,
      user_id: null
    });
  } catch (err) {
    console.warn('[NUSC] assignment in-app notify:', err);
  }

  try {
    const pushResult = await sendPushToAll({ title: msg.title, body: msg.body, url: link });
    if (pushResult?.ok) {
      const sent = pushResult.sent ?? 0;
      const total = pushResult.total ?? 0;
      if (total === 0) {
        showToast('الواجب اتحفظ. مفيش أجهزة إشعارات مفعّلة لسه.', 'info');
      } else {
        showToast('إشعار الواجب وصل لـ ' + sent + ' من ' + total + ' جهاز', 'success');
      }
      return pushResult;
    }
    if (pushResult?.error) {
      console.warn('[NUSC] assignment push:', pushResult.error);
      showToast('الواجب اتحفظ. إشعار التليفون فشل — راجع send-push', 'info');
    }
    return pushResult;
  } catch (err) {
    console.warn('[NUSC] assignment push failed:', err);
    return { ok: false, error: String(err?.message || err) };
  }
}
