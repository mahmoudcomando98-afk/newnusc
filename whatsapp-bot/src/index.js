'use strict';

/*
 * COMANDO WhatsApp Bot — نقطة الدخول
 * أوامر:
 *   node src/index.js start       — تشغيل البوت (افتراضي)
 *   node src/index.js pair        — تسجيل دخول بمسح QR ثم يخرج
 *   node src/index.js list-groups — عرض كل المجموعات وآيدياتها
 *   node src/index.js test-send   — إرسال "رسالة اختبار" للجروب
 *   node src/index.js check-db    — فحص قراءة Supabase (بدون إرسال)
 *   node src/index.js help
 */

const fs = require('fs');
const path = require('path');
const SentStore = require('./sent-store');
const logger = require('./logger');
const config = require('./config');
const WhatsAppClient = require('./whatsapp');
const { fetchNewAnnouncements, fetchNewNotifications } = require('./supabase');
const { botTick } = require('./watcher');
const { formatAnnouncement, formatNotification } = require('./format');

/* التحقق من المعاملات */
function requireFlags() {
  if (!config.supabaseServiceRoleKey) {
    console.error('\n❌ SUPABASE_SERVICE_ROLE_KEY غير محدد في .env — البوت مش هيقرا بيانات المنصة.');
    console.error('   Dashboard → Project Settings → API → service_role key (secret)');
    process.exit(1);
  }
}

function requireTarget() {
  if (!config.targetGroupId && !config.targetGroupName && config.targetGroupNames.length === 0) {
    console.error('\n❌ لازم تحدد TARGET_GROUP_NAME أو TARGET_GROUP_ID في .env — انظر README.md للتفاصيل.');
    process.exit(1);
  }
}

/* -- help */
function printHelp() {
  console.log(`
COMANDO WhatsApp Bot
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
استخدام: node src/index.js <command>

  start          — شغّل البوت (الوضع الافتراضي)
  pair           — سجل دخول بمسح QR ثم يخرج
  join-group     — ابدأ الجروب عبر رابط الدعوة من .env ثم يكتب الـ ID تلقائيًا
  list-groups    — اعرض كل جروبات WhatsApp والآيديات
  test-send      — ابعت "رسالة اختبار" للجروب
  check-db       — فحص قراءة Supabase بدون إرسال
  help           — هذه الشاشة

العمليات الشائعة:
  1) أول مرة: node src/index.js pair
     → امسح الـ QR من WhatsApp (إعدادات → الأجهزة المرتبطة → ربط جهاز)
  2) لو الجروب برابط دعوة: node src/index.js join-group
     → ينضم للجروب ويكتب TARGET_GROUP_ID في .env تلقائيًا
     (البديل: node src/index.js list-groups وتحدد الاسم يدويًا)
  3) جرّب: node src/index.js test-send
  4) شغّل: node src/index.js start

لـ Windows ( PowerShell ):
  .\\scripts\\start.ps1       — تشغيل عادي
  .\\scripts\\stop.ps1        — إيقاف
  .\\scripts\\status.ps1      — فحص الحالة
  .\\scripts\\test-send.ps1   — اختبار
  .\\scripts\\pair.ps1        — ربط أول مرة
`);
}

/* --pair */
async function cmdPair() {
  console.log('\n🔑 جلسة WhatsApp — امسح الـ QR من تطبيقك:');
  console.log('   WhatsApp → ⚙️ الإعدادات → الأجهزة المرتبطة → ربط جهاز\n');
  const wa = new WhatsAppClient();
  try {
    await wa.initialize();
    console.log('\n✅ تم الربط — .wwebjs_auth/ تم حفظه. مش هتحتاج تمسح الـ QR تاني.');
    console.log('   المسار: ' + path.join(config.authDir, '**', 'session-comando-whatsapp-bot'));
  } catch (err) {
    console.error('\n❌ فشل الربط:', err.message);
    process.exit(1);
  } finally {
    await wa.destroy();
    process.exit(0);
  }
}

/* -- join-group */
async function cmdJoinGroup() {
  const invite = config.groupInviteCode;
  if (!invite) {
    console.error('\n❌ GROUP_INVITE_CODE غير موجود في .env — حط رابط الدعوة كامل أو الكود.');
    process.exit(1);
  }
  console.log('\n🔗 الانضمام للجروب عبر رابط الدعوة من .env...');
  const wa = new WhatsAppClient();
  try {
    await wa.initialize();
    const groupId = await wa.joinGroup(invite);

    /* اكتب TARGET_GROUP_ID في .env تلقائيًا */
    const envPath = path.join(config.root, '.env');
    try {
      let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      if (/^TARGET_GROUP_ID=/m.test(content)) {
        content = content.replace(/^TARGET_GROUP_ID=.*$/m, 'TARGET_GROUP_ID=' + groupId);
        fs.writeFileSync(envPath, content, 'utf8');
      } else {
        fs.appendFileSync(envPath, '\nTARGET_GROUP_ID=' + groupId + '\n', 'utf8');
      }
      console.log('\n✅ تم الانضمام للجروب — والـ ID اتسجل في .env تلقائيًا:');
      console.log('   TARGET_GROUP_ID=' + groupId);
    } catch (e) {
      console.log('\n⚠ انضممت للجروب، لكن تعذر تعديل .env — ضيف السطر ده بنفسك:');
      console.log('   TARGET_GROUP_ID=' + groupId);
    }
  } catch (err) {
    console.error('\n❌ فشل الانضمام:', err.message);
    console.error('   ملاحظة: الانضمام البرمجي بيعتمد على دوال داخلية في WhatsApp Web وبتتعطل أحيانًا.');
    console.error('   الحل الأبسط: افتح رابط الدعوة من الموبايل واضغط «انضمام»، وبعدين npm run list-groups وشوف الآيدي.');
    process.exit(1);
  } finally {
    await wa.destroy();
    process.exit(0);
  }
}

/* -- list-groups */
async function cmdListGroups() {
  const wa = new WhatsAppClient();
  try {
    await wa.initialize();
    const groups = await wa.listGroups();
    if (!groups.length) {
      console.log('ما فيش أي جروبات في حسابك.');
      return;
    }
    console.log('\n📱 المجموعات الموجودة في حسابك:\n');
    for (const g of groups) {
      console.log('  ┌─ ' + (g.name || '(بدون اسم)'));
      console.log('  └─ ' + g.id);
    }
    console.log('\n👉 اختار الاسم واملأه في TARGET_GROUP_NAME في .env — أو الرقم وانسقـه مع TARGET_GROUP_ID');
  } catch (err) {
    console.error('خطأ:', err.message);
    process.exit(1);
  } finally {
    await wa.destroy();
    process.exit(0);
  }
}

/* -- test-send */
async function cmdTestSend() {
  requireFlags();
  requireTarget();
  const wa = new WhatsAppClient();
  try {
    await wa.initialize();
    const msg =
      '🧪 *اختبار COMANDO WhatsApp Bot*\n━━━━━━━━━━━━━━\n' +
      'لو وصلتك هذه الرسالة، يبقى البوت شغال تمام ✅\n' +
      'المنصة: ' + config.platformUrl;
    const res = await wa.sendText(msg);
    console.log('\n✅ تم الإرسال للجروبات: ' + res.map((t) => t.name || t.id).join('، '));
  } catch (err) {
    console.error('\n❌ فشل الإرسال:', err.message);
    process.exit(1);
  } finally {
    await wa.destroy();
    process.exit(0);
  }
}

/* -- check-db */
async function cmdCheckDb() {
  requireFlags();
  try {
    const [anns, notifs] = await Promise.all([
      fetchNewAnnouncements(5),
      fetchNewNotifications(5),
    ]);
    console.log('\n📡 قراءة Supabase:');
    console.log('   الإعلانات المنشورة: ' + anns.length);
    for (const a of anns) console.log('     • ' + (a.title || '(بدون عنوان)') + ' — ' + new Date(a.created_at).toLocaleString('ar-EG'));
    console.log('   الإشعارات العامة: ' + notifs.length);
    for (const n of notifs) console.log('     • ' + (n.title || '(بدون عنوان)') + ' — ' + new Date(n.created_at).toLocaleString('ar-EG'));
    if (!anns.length && !notifs.length) console.log('\n   (أو بتعني ببساطة مفيش إشعارات جديدة)');
    console.log('\n✅ السيرفر قراءة تعمل بكفاءة.');
  } catch (err) {
    console.error('\n❌ فشل قراءة Supabase: ' + err.message);
    process.exit(1);
  }
  process.exit(0);
}

/* -- start (افتراضي) */
async function cmdStart() {
  requireFlags();
  requireTarget();
  const seen = new SentStore();
  logger.info('╔════════════════════════════════════════════╗');
  logger.info('║  COMANDO WhatsApp Bot — بدء التشغيل        ║');
  logger.info('╚════════════════════════════════════════════╝');
  logger.info('منصة: ' + config.platformUrl);
  logger.info('العنوان: ' + (config.targetGroupName || config.targetGroupId || config.targetGroupNames[0]));
  logger.info('الفاصل بين الفحوص: ' + config.pollIntervalSeconds + ' ثانية');

  /* أول تشغيل على الإطلاق: علّم كل الإعلانات/الإشعارات الموجودة كـ "اتبعتت"
     عشان البوت ما يبعتش 40 رسالة قديمة للجروب دفعة واحدة. */
  if (!config.sendOnFirstRun && seen.isEmpty()) {
    try {
      const [anns, notifs] = await Promise.all([
        fetchNewAnnouncements(50).catch(() => []),
        fetchNewNotifications(50).catch(() => []),
      ]);
      const ids = [
        ...anns.map((a) => 'announcement:' + a.id),
        ...notifs.map((n) => 'notification:' + n.id),
      ];
      if (ids.length) {
        seen.addAll(ids);
        logger.warn(
          `أول تشغيل: تم تسجيل ${ids.length} عنصر قديم كـ "مُرسَل" — البوت هيبعت الجديدة بس. ` +
          `لو عايز يبعت القديم كمان، حط SEND_ON_FIRST_RUN=true في .env`
        );
      }
    } catch {
      /* لو فشل الفحص هنا نكمل عادي — أول فحص عند التشغيل هيتكفل بيهم */
    }
  }

  const wa = new WhatsAppClient();
  try {
    logger.info('جاري الاتصال بـ WhatsApp...');
    await wa.initialize();
    const targets = await wa.resolveTargetChats();
    logger.ok('الجروبات المستهدفة: ' + targets.map((t) => t.name || t.id).join('، '));

    logger.info('جاري فحص الإشعارات الجديدة (مرة واحدة أول تشغيل)...');

    /* نبض افتراضي بين الفحوص */
    let isTicking = false;
    const intervalMs = Math.max(5000, config.pollIntervalSeconds * 1000);
    const timer = setInterval(async () => {
      if (isTicking) return; /* فاصل */
      isTicking = true;
      try {
        await botTick(wa, seen);
      } catch (err) {
        logger.err('tick error: ' + (err && err.message ? err.message : String(err)));
      } finally {
        isTicking = false;
      }
    }, intervalMs);

    /* الطور الأول = فحص واحد فوراً */
    try {
      await botTick(wa, seen);
    } catch (err) {
      logger.err('tick error: ' + (err && err.message ? err.message : String(err)));
    }

    /* keep_pta alive — رد بـ Ctrl+C للخروج */
    logger.ok('البوت شغال. Ctrl+C للخروج.');
    process.on('SIGINT', async () => {
      logger.warn('تم إيقاف البوت بناءً على طلبك.');
      clearInterval(timer);
      await wa.destroy();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      logger.warn('تم إيقاف البوت (SIGTERM).');
      clearInterval(timer);
      await wa.destroy();
      process.exit(0);
    });
  } catch (err) {
    logger.err('فشل البدء: ' + (err && err.message ? err.message : String(err)));
    try { await wa.destroy(); } catch { /* ignore */ }
    process.exit(1);
  }
}

/* router */
(async () => {
  const cmd = (process.argv[2] || 'start').toLowerCase();
  switch (cmd) {
    case 'start':       return cmdStart();
    case 'pair':        return cmdPair();
    case 'join-group':  return cmdJoinGroup();
    case 'list-groups': return cmdListGroups();
    case 'test-send':   return cmdTestSend();
    case 'check-db':    return cmdCheckDb();
    case 'help':
    case '--help':
    case '-h':          return printHelp();
    default:
      console.log('أمر غير معروف: ' + cmd + '\n');
      printHelp();
      process.exit(1);
  }
})().catch((err) => {
  console.error('خطأ غير متوقع:', err && err.message ? err.message : err);
  process.exit(1);
});
