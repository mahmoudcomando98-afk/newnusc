'use strict';

const config = require('./config');

/* علامات UTF-8 صحيحة تتنشر مع كل رسالة على WhatsApp */
const EMOJI = {
  announce: '📢',
  pin: '📌',
  link: '🔗',
  bell: '🔔',
  clock: '🕐',
  urgent: '🔴',
  warning: '🟠',
  important: '⭐',
  line: '━━━━━━━━━━━━━━',
};

function trim(text, max) {
  const s = String(text || '').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(iso || '');
  }
}

function urgencyFor(importance) {
  const v = String(importance || 'normal').toLowerCase();
  if (v === 'urgent') return EMOJI.urgent + ' عاجل جداً';
  if (v === 'high')   return EMOJI.warning + ' عاجل';
  if (v === 'important') return EMOJI.important + ' مهم';
  return '';
}

function suffixLink(linkLabel, linkUrl) {
  if (!linkUrl) return '';
  const label = trim(linkLabel || 'فتح الرابط', 40);
  return `${EMOJI.link} *${label}:* ${linkUrl}\n`;
}

/* الإعلانات */
function announcement(item) {
  const title = trim(item.title, 140) || 'إعلان جديد';
  const content = trim(item.content, config.maxContentChars);
  const urg = urgencyFor(item.importance);
  const time = fmtTime(item.created_at);

  let msg = `${EMOJI.announce} *إعلان جديد — COMANDO*`;
  if (urg) msg += ` ${urg}`;
  msg += `\n${EMOJI.line}\n`;
  msg += `${EMOJI.pin} *${title}*\n\n`;
  if (content) msg += `${content}\n\n`;
  /* رابط الإعلان نفسه (لو الأدمن حاط رابط) — بدون أي رابط للمنصة نفسها */
  if (item.link_url) msg += `${suffixLink(item.link_label || 'رابط الإعلان', item.link_url)}\n`;
  if (time) msg += `${EMOJI.clock} ${time}`;
  return { msg: msg.trim(), isMedia: null, originalUrl: item.link_url || null };
}

/* الإشعارات العامة */
function notification(item) {
  const title = trim(item.title, 140) || 'إشعار';
  const body  = trim(item.body, 900);
  const time  = fmtTime(item.created_at);

  let msg = `${EMOJI.bell} *إشعار — COMANDO*\n${EMOJI.line}\n`;
  msg += `*${title}*`;
  if (body) msg += `\n\n${body}`;
  if (item.link) msg += `\n\n${EMOJI.link} ${item.link}`;
  if (time) msg += `\n${EMOJI.clock} ${time}`;
  return { msg: msg.trim(), isMedia: null, originalUrl: item.link || null };
}

const formatAnnouncement = announcement;
const formatNotification = notification;

module.exports = { formatAnnouncement, formatNotification, EMOJI };
