'use strict';

/*
 * آلية الإرسال — whatsapp-web.js (مكتبة غير رسمية مبنية على WhatsApp Web).
 * ليست API الرسمي — تستخدم جلسة WhatsApp Web المحفوظة في .wwebjs_auth للربط الدائم.
 *
 * مسؤولية الاستخدام: البوت يرتبط بحسابك الشخصي برضاك — WhatsApp يقدر يقيد أو يحظر
 * أي حساب يخالف شروط الاستخدام. للحد من المخاطر: لا ترسل رسائل تجارية جماعية،
 * ولا تشارك مجلد .wwebjs_auth، واستخدم الرقم للإشعارات فقط.
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const logger = require('./logger');

class WhatsAppClient {
  constructor() {
    this._client = null;
    this._initialized = false;
    this._targetChats = null;
  }

  get client() {
    return this._client;
  }

  async initialize() {
    if (this._initialized) return;
    if (!fs.existsSync(config.authDir)) fs.mkdirSync(config.authDir, { recursive: true });
    const puppeteerArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=200,200',
      '--window-position=-2000,-2000',
      '--start-minimized',
    ];
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'comando-whatsapp-bot',
        dataPath: config.authDir,
      }),
      puppeteer: {
        headless: false, /* WhatsApp Web يحظر headless — اشغل headless:false لكن بخفية */
        args: puppeteerArgs,
        defaultViewport: { width: 200, height: 200 },
        ignoreHTTPSErrors: true,
        /* متاح للاستضافة (Docker): لو PUPPETEER_EXECUTABLE_PATH متصفحة بتشغيل chromium النظام بدل اللي بينزله puppeteer */
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      },
    });

    let resolveReady;
    const readyPromise = new Promise((resolve) => { resolveReady = resolve; });

    client.on('qr', (qr) => {
      console.log('\n╔══════════════════════════════════════════════════╗');
      console.log('║  Scan this QR code with your WhatsApp app        ║');
      console.log('║  Settings → Linked Devices → Link a Device        ║');
      console.log('╚══════════════════════════════════════════════════╝\n');
      qrcode.generate(qr, { small: true });
      console.log('\n(ينتظر المسح... جلسة .wwebjs_auth/ هتُحفظ على القرص بعد المسح)\n');
    });

    client.on('authenticated', () => logger.info('WhatsApp — مصادقة ناجحة'));
    client.on('auth_failure', (m) => logger.err('WhatsApp — فشل المصادقة: ' + m));
    client.on('ready', () => {
      logger.ok('WhatsApp — متصل وجاهز');
      resolveReady();
    });
    client.on('disconnected', (r) => logger.warn('WhatsApp — انقطع الاتصال: ' + r));
    client.on('loading_screen', (percent, msg) => {
      if (percent < 100) process.stdout.write('\rWhatsApp — جاري التحميل ' + percent + '%');
    });

    this._client = client;
    await client.initialize();
    await readyPromise;
    this._initialized = true;
  }

  /**
   * يحل كل المجموعات المستهدفة من .env:
   *   TARGET_GROUP_ID  → المعرف المباشر (الأدق)
   *   TARGET_GROUP_NAME → اسم مطابق تماماً
   *   TARGET_GROUP_NAMES → عدة أسماء مفصولة بفواصل، كلها تستقبل الرسالة
   * لو ما لقاش أي مطابقة بالاسم، يجرب مطابقة جزئية (contains) كحل أخير.
   * @returns {Promise<Array<{ id: string, name: string }>>}
   */
  async resolveTargetChats() {
    if (this._targetChats) return this._targetChats;

    const names = [];
    if (config.targetGroupName) names.push(config.targetGroupName);
    names.push(...config.targetGroupNames);
    if (!config.targetGroupId && names.length === 0) {
      throw new Error('لم يتم تحديد TARGET_GROUP_NAME / TARGET_GROUP_NAMES / TARGET_GROUP_ID في .env');
    }

    const chats = await this._client.getChats();
    const picked = new Map();

    if (config.targetGroupId) {
      const direct = chats.find((c) => c.id && c.id._serialized === config.targetGroupId);
      if (direct) picked.set(direct.id._serialized, direct);
      else logger.warn('TARGET_GROUP_ID مش موجود في قائمة المجموعات؛ هنبحث بالاسم.');
    }

    /* مطابقة كاملة للاسم */
    for (const name of names) {
      const match = chats.find((c) => c.name && c.name.trim() === name.trim());
      if (match) picked.set(match.id._serialized, match);
      else logger.warn('مفيش جروب بالاسم "' + name + '" — ممكن يكون الاسم اتغير.');
    }

    /* لو فشل الكامل — مطابقة جزئية */
    if (!picked.size) {
      for (const name of names) {
        const match = chats.find(
          (c) => c.name && c.name.toLowerCase().includes(name.toLowerCase())
        );
        if (match) {
          picked.set(match.id._serialized, match);
          logger.warn('مطابقة جزئية: "' + name + '" → "' + match.name + '"');
        }
      }
    }

    if (!picked.size) {
      const groupList = chats
        .filter((c) => c.isGroup)
        .map((c) => '  ' + (c.name || '(بدون اسم)') + ' — ' + c.id._serialized)
        .join('\n');
      logger.err('مفيش أي جروب مطابق. المجموعات المتاحة:\n' + groupList);
      throw new Error('اختار اسم مطابق من القائمة وحطه في .env (أو استخدم TARGET_GROUP_ID)');
    }

    this._targetChats = [...picked.values()].map((c) => ({
      id: c.id._serialized,
      name: c.name || '',
    }));
    for (const t of this._targetChats) {
      logger.ok('الجروب المستهدف: ' + (t.name || '(بدون اسم)') + ' (' + t.id + ')');
    }
    return this._targetChats;
  }

  /** للتوافق — أول جروب من المستهدفين */
  async findTargetChat() {
    const targets = await this.resolveTargetChats();
    return targets[0];
  }

  /**
   * الانضمام لجروب عبر رابط دعوة (invite link).
   * @param {string} inviteCode - الكود فقط (بدون https://chat.whatsapp.com/)
   * @returns {Promise<string>} معرّف الجروب بعد الانضمام
   */
  async joinGroup(inviteCode) {
    if (!this._client) throw new Error('client not initialized');
    const code = String(inviteCode || '').trim();
    if (!code) throw new Error('كود الدعوة فاضي — حط GROUP_INVITE_CODE في .env');
    logger.info('جاري الانضمام للجروب عبر رابط الدعوة...');
    const groupId = await this._client.acceptInvite(code);
    logger.ok('تم الانضمام — معرف الجروب: ' + groupId);
    return groupId;
  }

  /**
   * قائمة المجموعات — تساعد المستخدم في معرفة الـ ID الصحيح
   */
  async listGroups() {
    if (!this._client) throw new Error('client not initialized');
    const chats = await this._client.getChats();
    return chats
      .filter((c) => c.isGroup)
      .map((c) => ({ id: c.id._serialized, name: c.name }));
  }

  async sendText(text) {
    const targets = await this.resolveTargetChats();
    let ok = 0;
    const errors = [];
    for (const t of targets) {
      try {
        await this._client.sendMessage(t.id, text);
        ok++;
      } catch (err) {
        errors.push((t.name || t.id) + ': ' + (err && err.message ? err.message : String(err)));
        logger.warn('فشل الإرسال للجروب ' + (t.name || t.id) + ' — ' + errors[errors.length - 1]);
      }
    }
    if (ok === 0) {
      throw new Error('فشل الإرسال لكل المجموعات — ' + errors.join(' | '));
    }
    return targets;
  }

  /**
   * إرسال ملف/صورة من رابط المصدر (مثل رابط PDF/صورة في الإعلان)
   * الوسائط بتتحمل مرة واحدة وتتبعت لكل مجموعة مستهدفة.
   */
  async sendMediaFromUrl(mediaUrl, caption) {
    const targets = await this.resolveTargetChats();

    let media = null;
    try {
      media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
    } catch (err) {
      logger.warn('فشل تحميل الوسائط من الرابط: ' + (err && err.message ? err.message : err) + ' — هبعت نص فقط');
    }

    let ok = 0;
    const errors = [];
    for (const t of targets) {
      try {
        if (media) {
          await this._client.sendMessage(t.id, media, { caption });
        } else {
          await this._client.sendMessage(t.id, caption || '');
        }
        ok++;
      } catch (err) {
        errors.push((t.name || t.id) + ': ' + (err && err.message ? err.message : String(err)));
        logger.warn('فشل الإرسال للجروب ' + (t.name || t.id));
      }
    }
    if (ok === 0) {
      throw new Error('فشل الإرسال لكل المجموعات — ' + errors.join(' | '));
    }
    return targets;
  }

  async destroy() {
    try {
      if (this._client) await this._client.destroy();
    } catch (err) {
      /* ignore */
    }
    this._client = null;
    this._initialized = false;
    this._targetChats = null;
  }
}

module.exports = WhatsAppClient;
