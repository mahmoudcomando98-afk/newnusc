'use strict';

const config = require('./config');
const logger = require('./logger');

/*
 * جلب آخر الإشعارات والإعلانات من Supabase مباشرة (قراءة فقط).
 * مفيش SDK — نستخدم REST endpoint بمفتاح service_role (مفتاح للقراءة فقط).
 */

function headers() {
  return {
    apikey: config.supabaseServiceRoleKey,
    Authorization: 'Bearer ' + config.supabaseServiceRoleKey,
    Accept: 'application/json',
  };
}

async function getJson(path) {
  const url = config.supabaseUrl.replace(/\/+$/, '') + path;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error('[db] HTTP ' + res.status + ' — ' + txt.slice(0, 250));
  }
  return await res.json();
}

/* الإعلانات الجديدة */
async function fetchNewAnnouncements(limit = 20) {
  if (!config.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY غير موجود — البوت مش هيقرا بيانات.');
  }
  const fields = 'id,title,content,importance,is_published,is_pinned,link_url,link_label,link_status,subject_id,created_at';
  const res = await getJson(
    '/rest/v1/announcements?select=' + encodeURIComponent(fields) +
      '&is_published=eq.true' +
      '&order=created_at.desc' +
      '&limit=' + encodeURIComponent(limit)
  );
  return Array.isArray(res) ? res : [];
}

/* الإشعارات العامة */
async function fetchNewNotifications(limit = 20) {
  if (!config.supabaseServiceRoleKey) return [];
  const fields = 'id,title,body,type,link,created_at,is_global';
  const res = await getJson(
    '/rest/v1/notifications?select=' + encodeURIComponent(fields) +
      '&is_global=eq.true' +
      '&order=created_at.desc' +
      '&limit=' + encodeURIComponent(limit)
  );
  return Array.isArray(res) ? res : [];
}

/* للتشخيص: تأكد إن القراءة شغالة بدون إرسال */
async function ping() {
  const [anns] = await Promise.all([fetchNewAnnouncements(1)]);
  if (anns.length >= 0) return true;
  return false;
}

/* حالة مفتاح إشعارات WhatsApp من platform_settings — الافتراضي مفعل لو المفتاح غير موجود أو تعذرت القراءة */
async function fetchWhatsAppEnabled() {
  if (!config.supabaseServiceRoleKey) return true;
  try {
    const res = await getJson(
      '/rest/v1/platform_settings?select=value&key=eq.whatsapp_notifications_enabled&limit=1'
    );
    if (!Array.isArray(res) || res.length === 0) return true;
    const v = res[0].value;
    return v === true || v === 'true' || v === 1 || v === '1';
  } catch (err) {
    logger.warn('تعذر قراءة whatsapp_notifications_enabled (' + (err && err.message ? err.message : err) + ') — الاستمرار بالوضع المفعل');
    return true;
  }
}

module.exports = { fetchNewAnnouncements, fetchNewNotifications, ping, fetchWhatsAppEnabled };
