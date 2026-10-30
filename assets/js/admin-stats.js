/**
 * Lightweight admin stats: top downloads + push subscribers.
 */
import { supabase } from './supabase.js';

export async function loadAdminStats(containerId = 'extra-stats') {
  const el = document.getElementById(containerId);
  if (!el) return;

  try {
    const [topDl, pushCount] = await Promise.all([
      supabase
        .from('materials')
        .select('id, title, download_count, subject_id')
        .order('download_count', { ascending: false })
        .limit(5),
      supabase.from('push_subscriptions').select('id', { count: 'exact', head: true })
    ]);

    const rows = (topDl.data || []).filter((r) => (r.download_count || 0) > 0);
    const devices = pushCount.count ?? 0;

    let listHtml = '';
    if (!rows.length) {
      listHtml = '<p class="text-sm text-muted">لسه مفيش تنزيلات مسجّلة.</p>';
    } else {
      listHtml =
        '<ul class="text-sm" style="list-style:none;padding:0;margin:0">' +
        rows
          .map(
            (r, i) =>
              `<li style="padding:6px 0;border-bottom:1px solid var(--border,#eee)">${i + 1}. ${escape(r.title || 'ملف')} — <strong>${r.download_count || 0}</strong></li>`
          )
          .join('') +
        '</ul>';
    }

    el.innerHTML = `
      <div class="card mb-2">
        <h3 class="card-title" style="font-size:1rem">أجهزة مفعّلة للإشعارات</h3>
        <p style="font-size:1.5rem;font-weight:700;color:var(--primary);margin:4px 0">${devices}</p>
        <p class="text-sm text-muted">عدد الأجهزة المشتركة في إشعارات التليفون</p>
      </div>
      <div class="card">
        <h3 class="card-title" style="font-size:1rem">أكثر الملفات تنزيلًا</h3>
        ${listHtml}
      </div>`;
  } catch (err) {
    console.warn('[NUSC] admin stats:', err);
    el.innerHTML =
      '<p class="text-sm text-muted">الإحصائيات مش متاحة دلوقتي. لو عمود download_count مش موجود نفّذ SQL: publish_schedule_and_reminders.sql</p>';
  }
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
