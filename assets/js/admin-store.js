import { supabase } from './supabase.js';
import { protectAdminPage } from './auth.js';
import { escapeHtml, showEmpty, showError, showToast, initIcons, formatDate } from './utils.js';

let editingId = null;
let orderFilter = 'pending';

function isAdminProfile(profile) {
  return profile && ['admin', 'moderator'].includes(String(profile.role || ''));
}

async function loadSettings() {
  const { data } = await supabase.from('store_settings').select('*').eq('id', 1).maybeSingle();
  if (!data) return;
  document.getElementById('payment_phone').value = data.payment_phone || '';
  document.getElementById('payment_name').value = data.payment_name || '';
  document.getElementById('payment_instructions').value = data.payment_instructions || '';
}

async function saveSettings(e) {
  e.preventDefault();
  const payload = {
    id: 1,
    payment_phone: document.getElementById('payment_phone').value.trim(),
    payment_name: document.getElementById('payment_name').value.trim() || null,
    payment_instructions: document.getElementById('payment_instructions').value.trim() || null,
    updated_at: new Date().toISOString()
  };
  if (!payload.payment_phone) {
    showToast('اكتب رقم التحويل.', 'error');
    return;
  }
  const { error } = await supabase.from('store_settings').upsert(payload);
  if (error) {
    showToast(error.message || 'تعذر الحفظ', 'error');
    return;
  }
  showToast('تم حفظ بيانات التحويل.', 'success');
}

function resetProductForm() {
  editingId = null;
  document.getElementById('edit-id').value = '';
  document.getElementById('product-form').reset();
  document.getElementById('is_active').checked = true;
  document.getElementById('product-form-title').textContent = 'إضافة قالب';
  document.getElementById('save-product-btn').textContent = 'إضافة';
  document.getElementById('cancel-edit-btn').classList.add('hidden');
}

async function uploadStoreFile(file, folder) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('store').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined
  });
  if (error) throw error;
  return path;
}

async function saveProduct(e) {
  e.preventDefault();
  const title = document.getElementById('title').value.trim();
  const price = Number(document.getElementById('price').value);
  const description = document.getElementById('description').value.trim() || null;
  const previewVideo = document.getElementById('preview_video_url').value.trim() || null;
  const isActive = document.getElementById('is_active').checked;
  const previewFile = document.getElementById('preview_image').files?.[0];
  const productFile = document.getElementById('product_file').files?.[0];

  if (!title || Number.isNaN(price) || price < 0) {
    showToast('اكتب اسم القالب والسعر صح.', 'error');
    return;
  }
  if (!editingId && !productFile) {
    showToast('ارفع ملف القالب.', 'error');
    return;
  }

  const btn = document.getElementById('save-product-btn');
  btn.disabled = true;

  try {
    let previewPath = null;
    if (previewFile) previewPath = await uploadStoreFile(previewFile, 'previews');

    const productPayload = {
      title,
      description,
      price,
      currency: 'EGP',
      preview_video_url: previewVideo,
      is_active: isActive,
      updated_at: new Date().toISOString()
    };
    if (previewPath) productPayload.preview_image_path = previewPath;

    let productId = editingId;
    if (editingId) {
      const { error } = await supabase.from('store_products').update(productPayload).eq('id', editingId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('store_products').insert(productPayload).select('id').single();
      if (error) throw error;
      productId = data.id;
    }

    if (productFile) {
      const filePath = await uploadStoreFile(productFile, 'files');
      const { error: fErr } = await supabase.from('store_product_files').upsert({
        product_id: productId,
        file_path: filePath,
        file_name: productFile.name,
        updated_at: new Date().toISOString()
      });
      if (fErr) throw fErr;
    }

    showToast(editingId ? 'تم تعديل القالب.' : 'تمت إضافة القالب.', 'success');
    resetProductForm();
    await loadProducts();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'تعذر الحفظ. نفّذ store.sql لو الجداول ناقصة.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function loadProducts() {
  const el = document.getElementById('products-list');
  try {
    const { data, error } = await supabase
      .from('store_products')
      .select('id, title, price, currency, is_active, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!data?.length) {
      showEmpty(el, 'لسه مفيش قوالب.');
      return;
    }
    el.innerHTML = data
      .map(
        (p) => `
        <article class="card mb-2">
          <div class="flex justify-between items-start gap-1 flex-wrap">
            <div>
              <h3 class="card-title" style="margin:0">${escapeHtml(p.title)}</h3>
              <p class="text-sm text-muted mt-1">${Number(p.price).toLocaleString('ar-EG')} ج.م · ${p.is_active ? 'ظاهر' : 'مخفي'}</p>
            </div>
            <div class="flex gap-1">
              <button type="button" class="btn btn-sm btn-outline" data-edit="${escapeHtml(p.id)}">تعديل</button>
              <button type="button" class="btn btn-sm btn-danger" data-del="${escapeHtml(p.id)}">حذف</button>
            </div>
          </div>
        </article>`
      )
      .join('');

    el.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { data } = await supabase.from('store_products').select('*').eq('id', btn.dataset.edit).maybeSingle();
        if (!data) return;
        editingId = data.id;
        document.getElementById('edit-id').value = data.id;
        document.getElementById('title').value = data.title || '';
        document.getElementById('description').value = data.description || '';
        document.getElementById('price').value = data.price ?? 0;
        document.getElementById('preview_video_url').value = data.preview_video_url || '';
        document.getElementById('is_active').checked = !!data.is_active;
        document.getElementById('product-form-title').textContent = 'تعديل قالب';
        document.getElementById('save-product-btn').textContent = 'حفظ';
        document.getElementById('cancel-edit-btn').classList.remove('hidden');
        document.getElementById('product-form').scrollIntoView({ behavior: 'smooth' });
      });
    });

    el.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('حذف القالب؟ الطلبات المرتبطة ممكن تتاثر.')) return;
        const { error } = await supabase.from('store_products').delete().eq('id', btn.dataset.del);
        if (error) {
          showToast(error.message || 'تعذر الحذف', 'error');
          return;
        }
        showToast('اتحذف.', 'success');
        await loadProducts();
      });
    });
  } catch (err) {
    console.error(err);
    showError(el, 'تعذر تحميل القوالب. نفّذ supabase/store.sql');
  }
}

async function loadOrders() {
  const el = document.getElementById('orders-list');
  try {
    let q = supabase
      .from('store_orders')
      .select(
        'id, status, price_at_purchase, proof_path, student_note, admin_note, created_at, user_id, product_id, store_products(title)'
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (orderFilter !== 'all') q = q.eq('status', orderFilter);

    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) {
      showEmpty(el, 'مفيش طلبات في الفلتر ده.');
      return;
    }

    // profiles for names/emails
    const uids = [...new Set(data.map((o) => o.user_id).filter(Boolean))];
    let profiles = {};
    if (uids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name, email').in('id', uids);
      profiles = Object.fromEntries((ps || []).map((p) => [p.id, p]));
    }

    el.innerHTML = (
      await Promise.all(
        data.map(async (o) => {
          const title = o.store_products?.title || 'قالب';
          const student = profiles[o.user_id] || {};
          let proofLink = '';
          if (o.proof_path) {
            try {
              const { data: s } = await supabase.storage.from('store').createSignedUrl(o.proof_path, 600);
              if (s?.signedUrl) {
                proofLink = `<a class="btn btn-sm btn-secondary" href="${escapeHtml(s.signedUrl)}" target="_blank" rel="noopener">عرض الإثبات</a>`;
              }
            } catch {
              /* ignore */
            }
          }
          return `
            <article class="card mb-2" data-order="${escapeHtml(o.id)}">
              <h3 class="card-title" style="margin:0">${escapeHtml(title)}</h3>
              <p class="text-sm text-muted mt-1">${escapeHtml(student.full_name || student.email || o.user_id)}</p>
              <p class="text-sm mt-1">${Number(o.price_at_purchase).toLocaleString('ar-EG')} ج.م · ${escapeHtml(formatDate(o.created_at))}</p>
              <p class="mt-1"><span class="store-status store-status-${escapeHtml(o.status)}">${escapeHtml(o.status)}</span></p>
              ${o.student_note ? `<p class="text-sm mt-1">ملاحظة الطالب: ${escapeHtml(o.student_note)}</p>` : ''}
              <div class="flex gap-1 flex-wrap mt-2">
                ${proofLink}
                ${o.status === 'pending' ? `
                  <button type="button" class="btn btn-sm btn-primary" data-approve="${escapeHtml(o.id)}">موافقة</button>
                  <button type="button" class="btn btn-sm btn-danger" data-reject="${escapeHtml(o.id)}">رفض</button>
                ` : ''}
              </div>
            </article>`;
        })
      )
    ).join('');

    el.querySelectorAll('[data-approve]').forEach((btn) => {
      btn.addEventListener('click', () => reviewOrder(btn.dataset.approve, 'approved'));
    });
    el.querySelectorAll('[data-reject]').forEach((btn) => {
      btn.addEventListener('click', () => reviewOrder(btn.dataset.reject, 'rejected'));
    });
  } catch (err) {
    console.error(err);
    showError(el, 'تعذر تحميل الطلبات.');
  }
}

async function reviewOrder(id, status) {
  const note =
    status === 'rejected'
      ? prompt('سبب الرفض (اختياري):') || null
      : prompt('ملاحظة للطالب (اختياري):') || null;

  const { data: sessionData } = await supabase.auth.getSession();
  const adminId = sessionData?.session?.user?.id || null;

  const { error } = await supabase
    .from('store_orders')
    .update({
      status,
      admin_note: note,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    showToast(error.message || 'تعذر التحديث', 'error');
    return;
  }
  showToast(status === 'approved' ? 'تمت الموافقة.' : 'تم الرفض.', 'success');
  await loadOrders();
}

async function init() {
  const ok = await protectAdminPage();
  if (!ok) return;
  document.documentElement.classList.remove('admin-auth-pending');
  initIcons();

  document.getElementById('pay-form').addEventListener('submit', saveSettings);
  document.getElementById('product-form').addEventListener('submit', saveProduct);
  document.getElementById('cancel-edit-btn').addEventListener('click', resetProductForm);

  document.querySelectorAll('#order-tabs [data-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      orderFilter = btn.dataset.status;
      document.querySelectorAll('#order-tabs [data-status]').forEach((b) => {
        b.classList.toggle('btn-primary', b === btn);
        b.classList.toggle('btn-secondary', b !== btn);
      });
      loadOrders();
    });
  });

  await loadSettings();
  await loadProducts();
  await loadOrders();
}

init();
