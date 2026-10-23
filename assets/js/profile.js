/**
 * NUSC Student Hub - Profile
 */

import { supabase, signOut } from './supabase.js';
import { protectPage } from './auth.js';
import { updatePassword } from './auth.js';
import {
  escapeHtml,
  formatDate,
  showToast,
  withLoading,
  initIcons,
  setActiveNav
} from './utils.js';

let profile = null;

async function init() {
  const result = await protectPage();
  if (!result) return;
  profile = result.profile;

  setActiveNav('profile');
  initIcons();
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
        <p class="text-sm text-muted">${escapeHtml(profile.email || '')}</p>
      </div>
    </div>
    <div class="card-meta">
      ${profile.student_id ? `<span>الرقم: ${escapeHtml(profile.student_id)}</span>` : ''}
      <span>${escapeHtml(profile.college || '')}</span>
      <span>${escapeHtml(profile.academic_year || '')}</span>
      ${profile.created_at ? `<span>منذ ${formatDate(profile.created_at)}</span>` : ''}
    </div>
  `;

  document.getElementById('full_name').value = profile.full_name || '';
  document.getElementById('student_id').value = profile.student_id || '';
  document.getElementById('email').value = profile.email || '';
}

function setupForms() {
  const profileForm = document.getElementById('profile-form');
  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = profileForm.querySelector('[type="submit"]');
    const handler = withLoading(btn, async () => {
      const full_name = document.getElementById('full_name').value.trim();
      const student_id = document.getElementById('student_id').value.trim() || null;

      if (!full_name) {
        showToast('الاسم مطلوب', 'error');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ full_name, student_id })
        .eq('id', profile.id);

      if (error) {
        showToast(error.message || 'فشل التحديث', 'error');
        return;
      }

      profile.full_name = full_name;
      profile.student_id = student_id;
      renderProfile();
      showToast('تم حفظ التعديلات', 'success');
    });
    await handler();
  });

  const passwordForm = document.getElementById('password-form');
  passwordForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPass = document.getElementById('new_password').value;
    const confirm = document.getElementById('confirm_password').value;

    if (newPass !== confirm) {
      showToast('كلمتا المرور غير متطابقتين', 'error');
      return;
    }

    const btn = passwordForm.querySelector('[type="submit"]');
    const handler = withLoading(btn, async () => {
      try {
        await updatePassword(newPass);
        passwordForm.reset();
        showToast('تم تحديث كلمة المرور', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    await handler();
  });
}

init();
