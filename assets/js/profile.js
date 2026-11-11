/**
 * NUSC Student Hub - Profile
 */

import { supabase, signOut } from './supabase.js';
import { protectPage } from './auth.js';
import {
  escapeHtml,
  formatDate,
  showToast,
  withLoading,
  initIcons,
  setActiveNav
} from './utils.js';

let profile = null;

async function fetchMyCode() {
  try {
    const { data } = await supabase
      .from('student_codes')
      .select('code')
      .eq('linked_user_id', profile?.id)
      .maybeSingle();
    return data?.code ? String(data.code).trim() : null;
  } catch {
    return null;
  }
}

async function init() {
  const result = await protectPage();
  if (!result) return;
  profile = result.profile || null;
  if (!profile) {
    const el = document.getElementById('profile-card');
    if (el) {
      el.innerHTML =
        '<p class="text-muted">تعذر تحميل بيانات الحساب. حدّث الصفحة أو سجّل دخول مرة أخرى.</p>';
    }
    setActiveNav('profile');
    initIcons();
    return;
  }

  setActiveNav('profile');
  initIcons();
  profile.code = await fetchMyCode();
  renderProfile();
  setupForms();

  if (profile.role === 'admin' || profile.role === 'moderator') {
    document.getElementById('admin-link')?.classList.remove('hidden');
  }

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
      await signOut();
    } catch {
      window.location.href = '/login.html';
    }
  });
}

function renderProfile() {
  const el = document.getElementById('profile-card');
  const initial = (profile.full_name || '?').charAt(0);

  el.innerHTML = `
    <div class="flex items-center gap-2 mb-2">
      <div class="user-avatar" style="width:56px;height:56px;font-size:1.4rem">
        ${profile.avatar_url ? `<img src="${escapeHtml(profile.avatar_url)}" alt="" />` : escapeHtml(initial)}
      </div>
      <div>
        <h2 style="font-size:1.2rem">${escapeHtml(profile.full_name || '')}</h2>
        ${profile.code ? `<p class="text-sm text-muted" dir="ltr" style="text-align:right">كود: <strong>${escapeHtml(profile.code)}</strong></p>` : ''}
      </div>
    </div>
    <div class="card-meta">
      <span>${escapeHtml(profile.college || '')}</span>
      <span>${escapeHtml(profile.academic_year || '')}</span>
      ${profile.created_at ? `<span>منذ ${formatDate(profile.created_at)}</span>` : ''}
    </div>
  `;

  document.getElementById('full_name').value = profile.full_name || '';
  document.getElementById('email').value = profile.code || '—';
}

function setupForms() {
  const profileForm = document.getElementById('profile-form');
  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = profileForm.querySelector('[type="submit"]');
    const handler = withLoading(btn, async () => {
      const full_name = document.getElementById('full_name').value.trim();

      if (!full_name) {
        showToast('الاسم مطلوب', 'error');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ full_name })
        .eq('id', profile.id);

      if (error) {
        showToast(error.message || 'فشل التحديث', 'error');
        return;
      }

      profile.full_name = full_name;
      renderProfile();
      showToast('تم حفظ البيانات', 'success');
    });
    await handler();
  });
}

init();
