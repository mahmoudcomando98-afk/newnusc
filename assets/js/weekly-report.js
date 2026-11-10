/**
 * التقرير الأسبوعي للطالب — يُعرض كإشعار محلي مرة واحدة في الأسبوع.
 * يعتمد على بيانات الطالب نفسه فقط (quiz_attempts + material_user_downloads)،
 * ولا يحتاج أي سيرفر أو صلاحيات إضافية.
 */
import { supabase } from './supabase.js';
import { showLocalNotification } from './push.js';

const FLAG_PREFIX = 'nusc_weekly_report_';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function runWeeklyReportOnce() {
  const weekKey = isoWeekKey();
  try {
    if (localStorage.getItem(FLAG_PREFIX + weekKey) === '1') return;
  } catch {
    /* private mode */
  }
  // ضع العلامة أولًا حتى لا يتكرر التقرير إن تعددت التابات/مرات الفتح
  try {
    localStorage.setItem(FLAG_PREFIX + weekKey, '1');
  } catch {
    /* ignore */
  }

  try {
    const since = new Date(Date.now() - WEEK_MS).toISOString();

    const { data: attempts, error: quizErr } = await supabase
      .from('quiz_attempts')
      .select('score, max_score')
      .eq('status', 'submitted')
      .gte('submitted_at', since)
      .limit(200);

    const results = quizErr ? [] : attempts || [];
    const quizCount = results.length;
    const scored = results.filter((r) => (r.max_score || 0) > 0);
    const avg = scored.length
      ? Math.round(
          scored.reduce((sum, r) => sum + (100 * (r.score || 0)) / r.max_score, 0) / scored.length
        )
      : null;

    const { count: downloadsWeek, error: dlErr } = await supabase
      .from('material_user_downloads')
      .select('material_id', { count: 'exact', head: true })
      .gte('last_downloaded_at', since);

    const bits = [];
    if (quizErr) {
      /* تعذر جلب الكويزات — نكمل بالباقي */
    } else if (quizCount > 0) {
      bits.push(`${quizCount} كويز بمتوسط ${avg ?? '—'}%`);
    } else {
      bits.push('لسه ماحلتش كويزات الأسبوع ده');
    }
    if (!dlErr && (downloadsWeek || 0) > 0) {
      bits.push(`${downloadsWeek} تحميل ملفات جديدة`);
    }
    if (!bits.length) return;

    await showLocalNotification('ملخص أسبوعك 📚', {
      body: 'ملخص مذاكرتك: ' + bits.join(' · '),
      url: '/notifications.html',
      tag: `weekly-report-${weekKey}`
    });
  } catch (err) {
    console.warn('[NUSC] weekly report:', err);
  }
}
