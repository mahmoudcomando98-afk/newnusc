import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, showError, showToast, initIcons } from './utils.js';

function formatPrice(price, currency) {
  const n = Number(price);
  if (Number.isNaN(n)) return '';
  const cur = currency === 'EGP' || !currency ? 'ج.م' : currency;
  return `${n.toLocaleString('ar-EG')} ${cur}`;
}

function statusLabel(s) {
  if (s === 'approved') return 'مقبول — تقدر تنزّل';
  if (s === 'rejected') return 'مرفوض';
  return 'قيد مراجعة الأدمن';
}

function statusClass(s) {
  if (s === 'approved') return 'store-status-approved';
  if (s === 'rejected') return 'store-status-rejected';
  return 'store-status-pending';
}

async function signedUrl(path, sec = 600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('store').createSignedUrl(path, sec);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function downloadProduct(productId) {
  try {
    const { data: fileRow, error } = await supabase
      .from('store_product_files')
      .select('file_path, file_name')
      .eq('product_id', productId)
      .maybeSingle();
    if (error) throw error;
    if (!fileRow?.file_path) {
      showToast('الملف مش متاح. لو دفعت واتبعت إثبات، استنى موافقة الأدمن.', 'error');
      return;
    }
    const url = await signedUrl(fileRow.file_path, 120);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileRow.file_name || 'template';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error(err);
    showToast('تعذر التنزيل. تأكد إن الطلب اتقبل.', 'error');
  }
}

async function submitOrder(product, userId) {
  const note = document.getElementById('student_note')?.value?.trim() || '';
  const fileInput = document.getElementById('proof_file');
  const file = fileInput?.files?.[0];
  if (!file) {
    showToast('ارفع صورة إثبات التحويل.', 'error');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    showToast('حجم الصورة كبير. خلّيه أقل من 8 ميجا.', 'error');
    return;
  }

  const btn = document.getElementById('submit-order-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'جاري الإرسال…';
  }

  try {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `proofs/${userId}/${product.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('store').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined
    });
    if (upErr) throw upErr;

    const { error: insErr } = await supabase.from('store_orders').insert({
      user_id: userId,
      product_id: product.id,
      price_at_purchase: product.price,
      status: 'pending',
      proof_path: path,
      student_note: note || null
    });
    if (insErr) {
      if (/unique|duplicate|23505/i.test(String(insErr.message || '') + String(insErr.code || ''))) {
        showToast('عندك طلب مفتوح أو مقبول لنفس القالب بالفعل. شوف طلباتي.', 'error');
      } else {
        throw insErr;
      }
      return;
    }

    showToast('تم إرسال الطلب. استنى موافقة الأدمن.', 'success');
    await render(product.id, userId);
  } catch (err) {
    console.error(err);
    showToast(err.message || 'تعذر إرسال الطلب.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'إرسال إثبات الدفع';
    }
  }
}

async function render(productId, userId) {
  const root = document.getElementById('item-root');
  if (!root) return;

  try {
    const [{ data: product, error: pErr }, { data: settings }, { data: order }] = await Promise.all([
      supabase
        .from('store_products')
        .select('id, title, description, price, currency, preview_image_path, preview_video_url, is_active')
        .eq('id', productId)
        .maybeSingle(),
      supabase.from('store_settings').select('*').eq('id', 1).maybeSingle(),
      supabase
        .from('store_orders')
        .select('id, status, admin_note, created_at')
        .eq('user_id', userId)
        .eq('product_id', productId)
        .in('status', ['pending', 'approved', 'rejected'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    if (pErr) throw pErr;
    if (!product || product.is_active === false) {
      showError(root, 'القالب مش متاح.');
      return;
    }

    let previewImg = null;
    if (product.preview_image_path) {
      try {
        previewImg = await signedUrl(product.preview_image_path);
      } catch {
        previewImg = null;
      }
    }

    const payPhone = settings?.data?.payment_phone || settings?.payment_phone || '';
    const payName = settings?.data?.payment_name || settings?.payment_name || '';
    const payInst =
      settings?.data?.payment_instructions ||
      settings?.payment_instructions ||
      'حوّل المبلغ ثم ارفع إثبات التحويل.';

    // fix settings shape (maybeSingle returns data directly)
    const phone = (settings && settings.payment_phone) || '';
    const name = (settings && settings.payment_name) || '';
    const instructions =
      (settings && settings.payment_instructions) ||
      'حوّل المبلغ على الرقم، ثم ارفع صورة إثبات التحويل.';

    const latest = order;
    let orderBlock = '';
    if (latest) {
      orderBlock = `
        <div class="card mb-3">
          <p class="mb-1"><span class="store-status ${statusClass(latest.status)}">${escapeHtml(statusLabel(latest.status))}</span></p>
          ${latest.admin_note ? `<p class="text-sm text-muted mt-1">ملاحظة الأدمن: ${escapeHtml(latest.admin_note)}</p>` : ''}
          ${latest.status === 'approved' ? `<button type="button" class="btn btn-primary mt-2" id="download-btn">تنزيل القالب</button>` : ''}
          ${latest.status === 'pending' ? `<p class="text-sm text-muted mt-2">طلبك تحت المراجعة. تقدر تتابع من <a href="/my-orders.html">طلباتي</a>.</p>` : ''}
          ${latest.status === 'rejected' ? `<p class="text-sm text-muted mt-2">لو حابب تحاول تاني، تواصل مع الأدمن أو ابعت طلب جديد بعد ما يتقفّل الوضع.</p>` : ''}
        </div>`;
    } else {
      orderBlock = `
        <div class="store-pay-box">
          <p class="text-sm text-muted mb-1">حوّل المبلغ على:</p>
          <p class="store-pay-phone">${escapeHtml(phone || '— لم يُحدد بعد —')}</p>
          ${name ? `<p class="text-sm mt-1">باسم: <strong>${escapeHtml(name)}</strong></p>` : ''}
          <p class="text-sm text-muted mt-2">${escapeHtml(instructions)}</p>
          <p class="store-price mt-2">المبلغ: ${escapeHtml(formatPrice(product.price, product.currency))}</p>
        </div>
        <div class="card">
          <h2 class="card-title" style="font-size:1rem">إثبات الدفع</h2>
          <div class="form-group">
            <label class="form-label" for="proof_file">صورة الإيصال *</label>
            <input id="proof_file" type="file" accept="image/*" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label" for="student_note">ملاحظة (اختياري)</label>
            <input id="student_note" class="form-input" maxlength="200" placeholder="رقم العملية أو أي ملاحظة" />
          </div>
          <button type="button" class="btn btn-primary" id="submit-order-btn">إرسال إثبات الدفع</button>
        </div>`;
    }

    root.innerHTML = `
      <article>
        ${previewImg ? `<div class="store-card-media mb-2" style="border-radius:12px;overflow:hidden"><img src="${escapeHtml(previewImg)}" alt="" style="width:100%;display:block" /></div>` : ''}
        ${product.preview_video_url ? `<div class="mb-2"><video class="store-preview-video" controls src="${escapeHtml(product.preview_video_url)}"></video></div>` : ''}
        <h1 style="font-size:1.2rem;margin:0 0 6px">${escapeHtml(product.title || '')}</h1>
        <p class="store-price mb-2">${escapeHtml(formatPrice(product.price, product.currency))}</p>
        ${product.description ? `<p class="text-sm mb-3">${escapeHtml(product.description)}</p>` : ''}
        ${orderBlock}
      </article>`;

    initIcons();

    document.getElementById('submit-order-btn')?.addEventListener('click', () => submitOrder(product, userId));
    document.getElementById('download-btn')?.addEventListener('click', () => downloadProduct(product.id));
  } catch (err) {
    console.error(err);
    showError(root, 'تعذر تحميل القالب. لو الجداول مش موجودة نفّذ supabase/store.sql');
  }
}

async function init() {
  const result = await protectPage();
  if (!result) return;
  initIcons();
  const userId = result.user?.id || result.id;
  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    location.replace('/store.html');
    return;
  }
  await render(id, userId);
}

init();
