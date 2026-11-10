/**
 * تذكيرات مواعيد تسليم الواجبات (24 ساعة / 3 ساعات).
 * تعمل على جهاز الطالب: إشعار محلي عبر الـ Service Worker — بدون أي كتابة في قاعدة البيانات
 * (سياسات RLS تمنع الطلاب من إدخال إشعارات عامة، والدالة send-push مقصورة على الأدمن).
 * يُعرض أيضًا قسم "المهام القادمة" في الصفحة الرئيسية كعرض داخل التطبيق.
 */
import { supabase } from './supabase.js';
import { showLocalNotification } from './push.js';

const FLAG_PREFIX = 'nusc_due_notified_';
const HOUR = 60 * 60 * 1000;

function windowHit(dueMs, targetHours, toleranceHours) {
  const left = dueMs - Date.now();
  const target = targetHours * HOUR;
  const tol = toleranceHours * HOUR;
  return left > 0 && left <= target + tol && left >= target - tol;
}

function flagSet(key) {
  try {
    return localStorage.getItem(FLAG_PREFIX + key) === '1';
  } catch {
    return false;
  }
}

function flagSetMark(key) {
  try {
    localStorage.setItem(FLAG_PREFIX + key, '1');
  } catch {
    /* private mode */
  }
}

export async function runDueRemindersOnce() {
  try {
    let { data, error } = await supabase
      .from('materials')
      .select(
        'id, title, subject_id, due_at, is_published, is_delivered, material_type'
      )
      .eq('material_type', 'assignment')
      .not('due_at', 'is', null)
      .limit(40);

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

      // ~3 ساعات متبقية
      if (windowHit(dueMs, 3, 0.75)) {
        const key = `${row.id}_3h`;
        if (!flagSet(key)) {
          flagSetMark(key);
          await showLocalNotification(subjectName, {
            body: `تذكير: باقي حوالي 3 ساعات على تسليم «${row.title || 'الواجب'}». آخر موعد: ${dueText}`,
            url: link,
            tag: `due-${row.id}-3h`
          });
        }
        continue;
      }

      // ~24 ساعة متبقية
      if (windowHit(dueMs, 24, 2)) {
        const key = `${row.id}_24h`;
        if (!flagSet(key)) {
          flagSetMark(key);
          await showLocalNotification(subjectName, {
            body: `تذكير: باقي يوم على تسليم «${row.title || 'الواجب'}». آخر موعد: ${dueText}`,
            url: link,
            tag: `due-${row.id}-24h`
          });
        }
      }
    }
  } catch (err) {
    console.warn('[NUSC] due reminders:', err);
  }
}
