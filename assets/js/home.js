/**
 * NUSC Student Hub - Home Page
 */
import { protectPage } from './auth.js';
import {
  escapeHtml,
  timeAgo,
  formatTime,
  showEmpty,
  showError,
  initIcons,
  setActiveNav,
  onConnectivityChange,
  quizStatusLabel,
  computeQuizStatus
} from './utils.js';
import { supabase } from './supabase.js';
import { freshnessBadgesHtml, touchLastVisit } from './freshness.js';
import { cachedStaleWhileRevalidate, cacheRemove } from './cache.js';
import {
  fetchSubjects,
  fetchAnnouncements,
  fetchMaterials,
  fetchQuizzes,
  fetchLectureFeed,
  fetchSubjectNames
} from './data-api.js';

const TTL = 3 * 60 * 1000;
const ANN_LIMIT = 12;
let profile = null;

async function init() {
  try {
    const result = await protectPage();
    if (!result) return;
    profile = result.profile || null;
    setActiveNav('home');
    initIcons();
    setupUserChip();
    setupPushBanner(result.user?.id || result.session?.user?.id);
    onConnectivityChange((online) => {
      const banner = document.getElementById('offline-banner');
      if (banner) banner.classList.toggle('hidden', online);
    });
    const name = (profile?.full_name || profile?.name || 'طالب').trim() || 'طالب';
    const welcomeName = document.getElementById('welcome-name');
    if (welcomeName) welcomeName.textContent = 'أهلاً، ' + name;
    const welcomeText = document.getElementById('welcome-text');
    if (welcomeText) welcomeText.textContent = 'أهلاً، ' + name;
    const short = document.getElementById('user-name-short');
    if (short) short.textContent = name.split(' ')[0] || name;
    const avatar = document.getElementById('user-avatar');
    if (avatar) avatar.textContent = (name.trim()[0] || '؟').toUpperCase();
    await Promise.all([
      loadSubjects(),
      loadAnnouncements(),
      loadImportantNotice(),
      loadLiveOnlineSections(),
      loadDueReminders(),
      loadStudyPlanToday()
    ]);
    await Promise.all([loadLectures(), loadQuizzes(), loadMaterials(), loadNotifCount()]);
    import('./due-reminders.js')
      .then((m) => m.runDueRemindersOnce())
      .catch(() => {});
    import('./weekly-report.js')
      .then((m) => m.runWeeklyReportOnce())
      .catch(() => {});
  } catch (error) {
    console.error('[NUSC] home init:', error);
  }
}

function setupPushBanner(userId) {
  const banner = document.getElementById('push-enable-banner');
  const btn = document.getElementById('enable-push-btn');
  if (!banner || !btn || !userId) return;
  const setDeniedHelp = () => {
    banner.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'شرح التفعيل';
    const help = banner.querySelector('.push-enable-inner p');
    if (help) {
      help.textContent =
        'المتصفح رافض الإشعارات. من إعدادات الموقع اسمح بالإشعارات، بعدين ارجع هنا واضغط تفعيل. Chrome: القفل بجانب الرابط → الإشعارات → سماح.';
    }
  };
  import('./push.js')
    .then(async (m) => {
      if (!m.pushSupported()) {
        banner.classList.add('hidden');
        return;
      }
      const perm = m.notificationPermission();
      if (perm === 'granted') {
        m.initPushNotifications(userId, { welcome: false }).catch(() => {});
        banner.classList.add('hidden');
        return;
      }
      if (perm === 'denied') {
        setDeniedHelp();
        btn.onclick = () => setDeniedHelp();
        return;
      }
      banner.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'تفعيل';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '...';
        const res = await m.enablePushFromUserGesture(userId);
        if (res.ok) {
          banner.classList.add('hidden');
          try {
            const { showToast } = await import('./utils.js');
            showToast('سيتم ارسال الاشعارات المهمه اليك', 'success');
          } catch {}
        } else if (res.reason === 'denied') {
          setDeniedHelp();
        } else {
          btn.disabled = false;
          btn.textContent = 'تفعيل';
          try {
            const { showToast } = await import('./utils.js');
            showToast('تعذر التفعيل. جرّب من Chrome وحدّث الصفحة.', 'error');
          } catch {}
        }
      });
    })
    .catch(() => {});
}

function setupUserChip() {
  const chip = document.getElementById('user-chip');
  if (!chip) return;
  chip.addEventListener('click', () => {
    window.location.href = '/profile.html';
  });
}

function formatCountdownShort(ms) {
  if (ms <= 0) return 'تم انتهاء موعد التسليم';
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return 'متبقي ' + d + ' يوم و ' + h + ' ساعة';
  if (h > 0) return 'متبقي ' + h + ' ساعة و ' + m + ' دقيقة';
  return 'متبقي ' + m + ' دقيقة';
}

async function fetchAssignmentsWithDue() {
  let result = await supabase
    .from('materials')
    .select('id, title, subject_id, material_type, due_at, is_delivered, is_published, publish_at, created_at')
    .eq('material_type', 'assignment')
    .not('due_at', 'is', null)
    .order('due_at', { ascending: true })
    .limit(30);
  if (result.error) {
    result = await supabase
      .from('materials')
      .select('id, title, subject_id, material_type, due_at, is_delivered, is_published, created_at')
      .order('created_at', { ascending: false })
      .limit(80);
    if (result.error) throw result.error;
  }
  return (result.data || []).filter((m) => {
    if (m.is_published === false) return false;
    if (m.publish_at) {
      const pt = new Date(m.publish_at).getTime();
      if (!Number.isNaN(pt) && pt > Date.now()) return false;
    }
    if (m.is_delivered) return false;
    const t = String(m.material_type || '').toLowerCase();
    if (t && t !== 'assignment') return false;
    return !!m.due_at;
  });
}

async function loadDueReminders() {
  const el = document.getElementById('due-reminders');
  if (!el) return;
  try {
    cacheRemove('home:due_assignments');
    const pack = await cachedStaleWhileRevalidate(
      'home:due_assignments_v2',
      async () => {
        const assignments = await fetchAssignmentsWithDue();
        const ids = [...new Set(assignments.map((a) => a.subject_id).filter(Boolean))];
        const names = await fetchSubjectNames(ids);
        return { assignments, names };
      },
      { ttlMs: TTL }
    );
    const now = Date.now();
    const items = (pack.assignments || [])
      .map((a) => {
        const due = new Date(a.due_at).getTime();
        if (Number.isNaN(due)) return null;
        const left = due - now;
        if (left < -7 * 24 * 60 * 60 * 1000) return null;
        if (left > 14 * 24 * 60 * 60 * 1000) return null;
        return { ...a, due, left, subjectName: pack.names[a.subject_id] || '' };
      })
      .filter(Boolean)
      .sort((a, b) => a.due - b.due)
      .slice(0, 8);
    if (!items.length) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML =
      '<div class="due-reminders-card"><h2>تذكير بمواعيد التسليم</h2><ul class="due-reminders-list">' +
      items
        .map((item) => {
          const ended = item.left <= 0;
          const soon = !ended && item.left < 24 * 60 * 60 * 1000;
          const href = item.subject_id
            ? '/subject-details.html?id=' + encodeURIComponent(item.subject_id)
            : '/subjects.html';
          const status = ended ? 'تم انتهاء موعد التسليم' : formatCountdownShort(item.left);
          const cls = ended ? 'is-ended' : soon ? 'is-soon' : '';
          return (
            '<a class="due-reminders-item ' +
            cls +
            '" href="' +
            escapeHtml(href) +
            '"><div><div class="due-reminders-title">' +
            escapeHtml(item.title || 'واجب') +
            '</div><div class="due-reminders-meta">' +
            escapeHtml(item.subjectName || 'مادة') +
            '</div></div><div class="due-reminders-status">' +
            escapeHtml(status) +
            '</div></a>'
          );
        })
        .join('') +
      '</ul></div>';
  } catch (error) {
    console.warn('[NUSC] loadDueReminders:', error);
    el.classList.add('hidden');
  }
}

function renderSubjects(rows) {
  const el = document.getElementById('subjects-list');
  if (!el) return;
  const list = (rows || []).slice(0, 6);
  if (!list.length) {
    showEmpty(el, 'لا توجد مواد حالياً.');
    return;
  }
  el.innerHTML = list
    .map((s) => {
      const title = s.name || s.title || 'مادة';
      const code = s.code || s.subject_code || '';
      const instructor = s.instructor || s.doctor_name || '';
      return (
        '<a class="card subject-card home-subject-card" href="/subject-details.html?id=' +
        encodeURIComponent(s.id) +
        '"><div class="home-subject-card-top"><span class="home-subject-symbol" aria-hidden="true"><span data-icon="book"></span></span>' +
        (code
          ? '<span class="subject-code-badge">' + escapeHtml(code) + '</span>'
          : '<span class="subject-code-badge">مادة دراسية</span>') +
        '</div><h3 class="card-title">' +
        escapeHtml(title) +
        '</h3>' +
        (instructor
          ? '<p class="text-sm text-muted home-subject-meta">' + escapeHtml(instructor) + '</p>'
          : '<p class="home-subject-meta home-subject-meta-empty">المحتوى الدراسي والمحاضرات</p>') +
        '<span class="home-subject-open"><span>فتح المادة</span><span class="home-subject-arrow" aria-hidden="true">←</span></span></a>'
      );
    })
    .join('');
  initIcons();
}

async function loadSubjects() {
  const el = document.getElementById('subjects-list');
  if (!el) return;
  try {
    const data = await cachedStaleWhileRevalidate('home:subjects', () => fetchSubjects(8), {
      ttlMs: TTL,
      onUpdate: renderSubjects
    });
    renderSubjects(data);
  } catch (error) {
    console.error('[NUSC] loadSubjects:', error);
    showError(el, 'تعذر تحميل المواد.');
  }
}

function renderLectures(feed) {
  const el = document.getElementById('lectures-list');
  if (!el) return;
  const list = (feed || []).slice(0, 3);
  if (!list.length) {
    showEmpty(el, 'لا توجد محاضرات حديثة.');
    return;
  }
  el.innerHTML = list
    .map(
      (item) =>
        '<a class="list-item" href="' +
        (item.href || '/subjects.html') +
        '" style="text-decoration:none;color:inherit"><div class="list-item-icon" data-icon="book-open"></div><div class="list-item-body"><div class="list-item-title">' +
        escapeHtml(item.title) +
        ' ' +
        freshnessBadgesHtml(item) +
        '</div><div class="list-item-desc">' +
        escapeHtml(item.subject) +
        ' · ' +
        timeAgo(item.created_at) +
        '</div></div></a>'
    )
    .join('');
  initIcons();
}

async function loadLectures() {
  const el = document.getElementById('lectures-list');
  if (!el) return;
  try {
    cacheRemove('home:lectures');
    const data = await cachedStaleWhileRevalidate(
      'home:lectures_v3',
      () => fetchLectureFeed(8),
      { ttlMs: TTL, onUpdate: renderLectures }
    );
    renderLectures(data);
  } catch (error) {
    console.error('[NUSC] loadLectures:', error);
    showError(el, 'تعذر تحميل المحاضرات.');
  }
}

function renderQuizzes(rows, subjectNames) {
  const el = document.getElementById('quizzes-list');
  if (!el) return;
  const ranked = (rows || [])
    .map((q) => ({ q, st: computeQuizStatus(q) }))
    .sort((a, b) => {
      const order = { open: 0, upcoming: 1, closed: 2 };
      return (order[a.st] ?? 9) - (order[b.st] ?? 9);
    });
  const list = ranked.slice(0, 3);
  if (!list.length) {
    showEmpty(el, 'لا توجد كويزات حالياً.');
    return;
  }
  el.innerHTML = list
    .map(({ q, st }) => {
      return (
        '<a class="list-item" href="/quizzes.html" style="text-decoration:none;color:inherit"><div class="list-item-icon" data-icon="clipboard"></div><div class="list-item-body"><div class="list-item-title">' +
        escapeHtml(q.title || 'كويز') +
        '</div><div class="list-item-desc">' +
        escapeHtml((subjectNames && subjectNames[q.subject_id]) || '') +
        ' · ' +
        escapeHtml(quizStatusLabel(st)) +
        '</div></div></a>'
      );
    })
    .join('');
  initIcons();
}

async function loadQuizzes() {
  const el = document.getElementById('quizzes-list');
  if (!el) return;
  try {
    const data = await cachedStaleWhileRevalidate(
      'home:quizzes_v2',
      async () => {
        const rows = await fetchQuizzes(6);
        const ids = [...new Set(rows.map((q) => q.subject_id).filter(Boolean))];
        const names = await fetchSubjectNames(ids);
        return { rows, names };
      },
      { ttlMs: TTL, onUpdate: (fresh) => renderQuizzes(fresh.rows, fresh.names) }
    );
    renderQuizzes(data.rows, data.names);
  } catch (error) {
    console.error('[NUSC] loadQuizzes:', error);
    showError(el, 'تعذر تحميل الكويزات.');
  }
}

function renderAnnouncements(rows) {
  const el = document.getElementById('announcements-list');
  if (!el) return;
  const list = (rows || []).slice(0, 2);
  if (!list.length) {
    showEmpty(el, 'لا توجد إعلانات.');
    return;
  }
  el.innerHTML = list
    .map((a) => {
      const level = String(a.importance || a.priority || 'normal');
      return (
        '<div class="list-item announcement-item ' +
        (['urgent', 'high'].includes(level) ? 'announcement-important' : '') +
        '"><div class="list-item-icon" data-icon="megaphone"></div><div class="list-item-body"><div class="list-item-title">' +
        (a.is_pinned ? '<span data-icon="pin" class="pin-icon"></span>' : '') +
        escapeHtml(a.title || 'إعلان') +
        '</div><div class="list-item-desc">' +
        escapeHtml((a.content || a.body || '').slice(0, 120)) +
        ' · ' +
        timeAgo(a.created_at) +
        '</div></div></div>'
      );
    })
    .join('');
  initIcons();
}

function announcementsLoader() {
  return fetchAnnouncements(ANN_LIMIT);
}

async function loadAnnouncements() {
  const el = document.getElementById('announcements-list');
  if (!el) return;
  try {
    const data = await cachedStaleWhileRevalidate('home:announcements', announcementsLoader, {
      ttlMs: TTL,
      onUpdate: renderAnnouncements
    });
    renderAnnouncements(data);
  } catch (error) {
    console.error('[NUSC] loadAnnouncements:', error);
    showError(el, 'تعذر تحميل الإعلانات.');
  }
}

async function loadImportantNotice() {
  const box = document.getElementById('important-notice');
  if (!box) return;
  try {
    const data = await cachedStaleWhileRevalidate('home:announcements', announcementsLoader, {
      ttlMs: TTL
    });
    const visible = (data || []).filter((n) => n && n.is_published !== false);
    let notice = visible.find((n) => {
      const level = String(n.importance || n.priority || '');
      return n.is_pinned || ['high', 'urgent'].includes(level);
    });
    if (!notice && visible.length) notice = visible[0];
    if (!notice) {
      box.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden');
    const t = document.getElementById('notice-title') || document.getElementById('important-notice-title');
    const c = document.getElementById('notice-text') || document.getElementById('important-notice-content');
    const tm = document.getElementById('important-notice-time');
    if (t) t.textContent = notice.title || 'إشعار مهم';
    if (c) c.textContent = notice.content || notice.body || '';
    if (tm) tm.textContent = timeAgo(notice.created_at);
    try {
      initIcons();
    } catch {}
  } catch (error) {
    console.warn('[NUSC] loadImportantNotice:', error);
  }
}

function renderMaterials(rows, subjectNames) {
  const el = document.getElementById('materials-list');
  if (!el) return;
  const list = (rows || []).slice(0, 3);
  if (!list.length) {
    showEmpty(el, 'لا توجد ملفات مضافة بعد');
    return;
  }
  el.innerHTML = list
    .map((material) => {
      const subjectName = (subjectNames && subjectNames[material.subject_id]) || '';
      const href = material.subject_id
        ? '/subject-details.html?id=' + encodeURIComponent(material.subject_id)
        : '/subjects.html';
      return (
        '<a class="list-item" href="' +
        escapeHtml(href) +
        '" style="text-decoration:none;color:inherit"><div class="list-item-icon" data-icon="file"></div><div class="list-item-body"><div class="list-item-title">' +
        escapeHtml(material.title || 'ملف') +
        ' ' +
        freshnessBadgesHtml(material) +
        '</div><div class="list-item-desc">' +
        escapeHtml(subjectName) +
        (material.file_type ? ' · ' + escapeHtml(material.file_type) : '') +
        ' · ' +
        timeAgo(material.created_at) +
        '</div></div></a>'
      );
    })
    .join('');
  initIcons();
  touchLastVisit();
}

async function loadMaterials() {
  const el = document.getElementById('materials-list');
  if (!el) return;
  try {
    const data = await cachedStaleWhileRevalidate(
      'home:materials',
      async () => {
        const rows = await fetchMaterials(8);
        const ids = [...new Set(rows.map((m) => m.subject_id).filter(Boolean))];
        const names = await fetchSubjectNames(ids);
        return { rows, names };
      },
      { ttlMs: TTL, onUpdate: (fresh) => renderMaterials(fresh.rows, fresh.names) }
    );
    renderMaterials(data.rows, data.names);
  } catch (error) {
    console.error('[NUSC] loadMaterials:', error);
    showError(el, 'تعذر تحميل الملفات. حاول مرة أخرى.');
  }
}

async function loadStudyPlanToday() {
  const el = document.getElementById('study-plan-banner');
  const text = document.getElementById('study-plan-banner-text');
  if (!el || !text) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const { data, error } = await supabase
      .from('study_tasks')
      .select('id, title, is_done')
      .eq('user_id', user.id)
      .gte('due_at', start.toISOString())
      .lt('due_at', end.toISOString());
    if (error) return;

    const tasks = data || [];
    const total = tasks.length;
    const done = tasks.filter((t) => !!t.is_done).length;
    const pending = total - done;

    if (total === 0) {
      el.classList.remove('hidden');
      el.classList.remove('is-due');
      text.textContent = 'مفيش مهام مجدولة النهاردة — تحب تضيف واحدة من زر "خطتي"؟';
      return;
    }
    el.classList.remove('hidden');
    text.textContent = pending === 0
      ? `اهنيك! النهاردة خلصت كل مهامك ${done}/${total} 🎉`
      : `عندك ${pending} ${pending === 1 ? 'مهمة' : 'مهام'} النهاردة لسة — ${done} من ${total} خلصت`;
  } catch (error) {
    console.error('[NUSC] loadStudyPlanToday:', error);
  }
}

function parseTimeToMinutes(t) {
  if (!t) return null;
  const s = String(t).slice(0, 8);
  const parts = s.split(':').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0])) return null;
  return parts[0] * 60 + (parts[1] || 0);
}

function isSectionLiveNow(row, now) {
  now = now || new Date();
  const day = Number(row.day_of_week);
  if (!Number.isInteger(day) || day < 0 || day > 6) return false;
  if (now.getDay() !== day) return false;
  const start = parseTimeToMinutes(row.start_time);
  if (start == null) return false;
  let end = parseTimeToMinutes(row.end_time);
  if (end == null) end = start + 120;
  if (end <= start) end += 24 * 60;
  const nowM = now.getHours() * 60 + now.getMinutes();
  return nowM >= start - 15 && nowM <= end + 10;
}

async function loadLiveOnlineSections() {
  const el = document.getElementById('live-online-sections');
  if (!el) return;
  try {
    const data = await cachedStaleWhileRevalidate(
      'home:online_sections',
      async () => {
        const { data: rows, error } = await supabase
          .from('online_sections')
          .select('id, day_of_week, start_time, end_time, course_name, instructor, join_url, is_published')
          .eq('is_published', true)
          .limit(40);
        if (error) throw error;
        return rows || [];
      },
      { ttlMs: TTL }
    );
    const live = (data || []).filter((r) => isSectionLiveNow(r));
    if (!live.length) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML =
      '<div class="card"><h2 class="card-title">سكاشن أونلاين الآن</h2>' +
      live
        .map((r) => {
          const href = r.join_url || '/online-sections.html';
          return (
            '<a class="list-item" href="' +
            escapeHtml(href) +
            '" ' +
            (r.join_url ? 'target="_blank" rel="noopener"' : '') +
            ' style="text-decoration:none;color:inherit"><div class="list-item-body"><div class="list-item-title">' +
            escapeHtml(r.course_name || 'سكشن') +
            '</div><div class="list-item-desc">' +
            escapeHtml(r.instructor || '') +
            (r.start_time ? ' · ' + escapeHtml(String(r.start_time).slice(0, 5)) : '') +
            '</div></div></a>'
          );
        })
        .join('') +
      '</div>';
  } catch (error) {
    console.warn('[NUSC] loadLiveOnlineSections:', error);
    el.classList.add('hidden');
  }
}

async function loadNotifCount() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .or('is_global.eq.true,user_id.eq.' + (profile?.id || '00000000-0000-0000-0000-000000000000'));
    if (error) throw error;
    const n = count || 0;
    if (n > 0) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (error) {
    console.warn('[NUSC] loadNotifCount:', error);
    badge.classList.add('hidden');
  }
}

init();
