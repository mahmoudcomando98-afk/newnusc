/**
 * Send due-date reminders (24h / 3h) once per assignment.
 * Runs when a student opens home — throttled per session.
 */
import { supabase } from './supabase.js';
import { sendPushToAll } from './push.js';

const SESSION_KEY = 'nusc_due_reminders_ran';
const HOUR = 60 * 60 * 1000;

function windowHit(dueMs, targetHours, toleranceHours) {
  const left = dueMs - Date.now();
  const target = targetHours * HOUR;
  const tol = toleranceHours * HOUR;
  return left > 0 && left <= target + tol && left >= target - tol;
}

export async function runDueRemindersOnce() {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* private mode */
  }

  try {
    let { data, error } = await supabase
      .from('materials')
      .select(
        'id, title, subject_id, due_at, is_published, is_delivered, reminder_sent_24h, reminder_sent_3h, material_type'
      )
      .eq('material_type', 'assignment')
      .not('due_at', 'is', null)
      .limit(40);

    if (error) {
      // columns may be missing — still try basic select
      const fallback = await supabase
        .from('materials')
        .select('id, title, subject_id, due_at, is_published, is_delivered, material_type')
        .eq('material_type', 'assignment')
        .not('due_at', 'is', null)
        .limit(40);
      data = fallback.data;
      error = fallback.error;
    }
    if (error || !data?.length) return;

    const subjectIds = [...new Set(data.map((m) => m.subject_id).filter(Boolean))];
    let names = {};
    if (subjectIds.length) {
      const { data: subs } = await supabase.from('subjects').select('id, name').in('id', subjectIds);
      names = Object.fromEntries((subs || []).map((s) => [s.id, s.name]));
    }

    for (const row of data) {
      if (row.is_published === false || row.is_delivered) continue;
      const dueMs = new Date(row.due_at).getTime();
      if (Number.isNaN(dueMs) || dueMs <= Date.now()) continue;

      const subjectName = names[row.subject_id] || 'مادة';
      const link = row.subject_id
        ? '/subject-details.html?id=' + encodeURIComponent(row.subject_id)
        : '/subjects.html';
      const dueText = new Date(row.due_at).toLocaleString('ar-EG', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });

      // ~3 hours left
      if (!row.reminder_sent_3h && windowHit(dueMs, 3, 0.75)) {
        await dispatchReminder(row, {
          flag: 'reminder_sent_3h',
          title: subjectName,
          body: `تذكير: باقي حوالي 3 ساعات على تسليم «${row.title || 'الواجب'}». آخر موعد: ${dueText}`,
          link
        });
        continue;
      }

      // ~24 hours left
      if (!row.reminder_sent_24h && windowHit(dueMs, 24, 2)) {
        await dispatchReminder(row, {
          flag: 'reminder_sent_24h',
          title: subjectName,
          body: `تذكير: باقي يوم على تسليم «${row.title || 'الواجب'}». آخر موعد: ${dueText}`,
          link
        });
      }
    }
  } catch (err) {
    console.warn('[NUSC] due reminders:', err);
  }
}

async function dispatchReminder(row, { flag, title, body, link }) {
  try {
    await supabase.from('notifications').insert({
      title: title.slice(0, 120),
      body: body.slice(0, 500),
      type: 'warning',
      link,
      is_global: true,
      user_id: null
    });
  } catch (e) {
    console.warn('[NUSC] due in-app notify:', e);
  }

  try {
    await sendPushToAll({ title: title.slice(0, 120), body: body.slice(0, 500), url: link });
  } catch (e) {
    console.warn('[NUSC] due push:', e);
  }

  try {
    await supabase.from('materials').update({ [flag]: true }).eq('id', row.id);
  } catch (e) {
    console.warn('[NUSC] due flag update (run SQL migration if column missing):', e);
  }
}
