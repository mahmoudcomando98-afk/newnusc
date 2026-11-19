'use strict';

const config = require('./config');
const logger = require('./logger');
const SentStore = require('./sent-store');
const { fetchNewAnnouncements, fetchNewNotifications } = require('./supabase');
const { formatAnnouncement, formatNotification } = require('./format');

const MEDIA_EXTENSIONS = /\.(pdf|png|jpe?g|webp|gif|docx?|pptx?|xlsx?|zip)(\?|$)/i;

async function botTick(whatsapp, seen) {
  /* 1) جيب التحديثات الحديثة */
  const [anns, notifs] = await Promise.allSettled([
    fetchNewAnnouncements(20),
    fetchNewNotifications(20),
  ]);

  const items = [];
  if (anns.status === 'fulfilled') for (const a of anns.value) items.push({ kind: 'announcement', data: a });
  else logger.err('announcements fetch:', anns.reason && anns.reason.message);
  if (notifs.status === 'fulfilled') for (const n of notifs.value) items.push({ kind: 'notification', data: n });
  else logger.err('notifications fetch:', notifs.reason && notifs.reason.message);

  /* 2) التحقق من الإشعارات الجديدة (حسب trigger الوقت) */
  items.sort((a, b) => new Date(a.data.created_at).getTime() - new Date(b.data.created_at).getTime());

  for (const item of items) {
    const id = item.kind + ':' + item.data.id;
    if (seen.has(id)) continue;
    if (item.kind === 'announcement') {
      const { msg, isMedia, originalUrl } = formatAnnouncement(item.data);
      await trySend(whatsapp, item.data, msg, originalUrl, item.kind, id, seen);
    } else {
      const { msg, originalUrl } = formatNotification(item.data);
      await trySend(whatsapp, item.data, msg, originalUrl, item.kind, id, seen);
    }
  }
}

async function trySend(whatsapp, item, message, mediaUrl, kind, id, seen) {
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      if (config.sendMedia && mediaUrl && MEDIA_EXTENSIONS.test(mediaUrl)) {
        await whatsapp.sendMediaFromUrl(mediaUrl, message);
      } else {
        await whatsapp.sendText(message);
      }
      seen.add(id);
      logger.ok(
        (kind === 'announcement' ? 'إعلان جديد' : 'إشعار جديد') +
          ': ' +
          (item.title || item.body || '').slice(0, 60)
      );
      return;
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      logger.warn('محاولة ' + attempt + '/' + config.maxRetries + ' فشلت [' + id.slice(0, 12) + ']: ' + msg);
      if (attempt >= config.maxRetries) {
        logger.err('فقدنا الإشعار: ' + id);
        return;
      }
      /* exponential backoff */
      await new Promise((r) => setTimeout(r, Math.min(10000, 500 * Math.pow(2, attempt))));
    }
  }
}

module.exports = { botTick };
