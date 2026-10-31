import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, showEmpty, showError, showToast, initIcons, formatDate } from './utils.js';

function statusLabel(s) {
  if (s === 'approved') return 'مقبول';
  if (s === 'rejected') return 'مرفوض';
  return 'قيد المراجعة';
}
function statusClass(s) {
  if (s === 'approved') return 'store-status-approved';
  if (s === 'rejected') return 'store-status-rejected';
  return 'store-status-pending';
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
      showToast('الملف مش متاح.', 'error');
      return;
    }
    const { data, error: sErr } = await supabase.storage.from('store').createSignedUrl(fileRow.file_path, 120);
    if (sErr) throw sErr;
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = fileRow.file_name || 'template';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error(err);
    showToast('تعذر التنزيل.', 'error');
  }
}

async function loadOrders(userId) {
  const el = document.getElementById('orders-list');
  try {
    const { data, error } = await supabase
      .from('store_orders')
      .select('id, status, price_at_purchase, admin_note, created_at, product_id, store_products(title)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data?.length) {
      showEmpty(el, 'مفيش طلبات لسه. من <a href="/store.html">المتجر</a> تقدر تطلب قالب.');
      return;
    }

    el.innerHTML = data
      .map((o) => {
        const title = o.store_products?.title || 'قالب';
        return `
          <article class="card mb-2">
            <div class="flex justify-between items-start gap-1 flex-wrap">
              <div>
                <h3 class="card-title" style="margin:0">${escapeHtml(title)}</h3>
                <p class="text-sm text-muted mt-1">${escapeHtml(formatDate(o.created_at))}</p>
                <p class="mt-1"><span class="store-status ${statusClass(o.status)}">${escapeHtml(statusLabel(o.status))}</span></p>
                ${o.admin_note ? `<p class="text-sm text-muted mt-1">${escapeHtml(o.admin_note)}</p>` : ''}
              </div>
              <div class="flex gap-1 flex-wrap">
                <a class="btn btn-sm btn-secondary" href="/store-item.html?id=${encodeURIComponent(o.product_id)}">التفاصيل</a>
                ${o.status === 'approved' ? `<button type="button" class="btn btn-sm btn-primary" data-dl="${escapeHtml(o.product_id)}">تنزيل</button>` : ''}
              </div>
            </div>
          </article>`;
      })
      .join('');

    el.querySelectorAll('[data-dl]').forEach((btn) => {
      btn.addEventListener('click', () => downloadProduct(btn.dataset.dl));
    });
  } catch (err) {
    console.error(err);
    showError(el, 'تعذر تحميل الطلبات. تأكد من تنفيذ supabase/store.sql');
  }
}

async function init() {
  const result = await protectPage();
  if (!result) return;
  initIcons();
  const userId = result.user?.id || result.id;
  await loadOrders(userId);
}

init();
