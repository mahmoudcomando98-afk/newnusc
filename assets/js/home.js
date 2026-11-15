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
import { supabase, readProfileCache } from './supabase.js';
import { freshnessBadgesHtml, touchLastVisit } from './freshness.js';
import { cachedStaleWhileRevalidate } from './cache.js';
import {
  fetchSubjects,
  fetchAnnouncements,
  fetchMaterials,
  fetchQuizzes,
  fetchLectureFeed,
  fetchSubjectNames
} from './data-api.js';

const TTL = 5 * 60 * 1000;
const ANN_LIMIT = 12;
let profile = null;

async function init() {
  try {
    try {
      const cached = readProfileCache();
      const welcomeEarly = document.getElementById('welcome-name');
      if (cached?.full_name && welcomeEarly) {
        welcomeEarly.textContent = 'أهلاً، ' + cached.full_name;
      }
      const shortEarly = document.getElementById('user-name-short');
      if (cached?.full_name && shortEarly) {
        shortEarly.textContent = String(cached.full_name).split(' ')[0] || cached.full_name;
      }
      const avatarEarly = document.getElementById('user-avatar');
      if (cached?.full_name && avatarEarly) {
        avatarEarly.textContent = (String(cached.full_name).trim()[0] || '؟').toUpperCase();
      }
    } catch {
      /* ignore */
    }
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
    const meta = result.user?.user_metadata || {};
    const name = (
      profile?.full_name ||
      profile?.name ||
      meta.full_name ||
      meta.name ||
      'طالب'
    ).toString().trim() || 'طالب';
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
      loadImportantNotice(),
      loadLiveOnlineSections(),
      loadDueReminders(),
      loadLectures(),
      loadQuizzes(),
      loadMaterials(),
      loadNotifCount()
    ]);
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

/* RESTORED_PARTIAL_MARKER - full file continues via second push if needed */
init();
