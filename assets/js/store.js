import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, showEmpty, showError, initIcons, setActiveNav } from './utils.js';

function formatPrice(price, currency) {
  const n = Number(price);
  if (Number.isNaN(n)) return '';
  const cur = currency === 'EGP' || !currency ? 'ج.م' : currency;
  return `${n.toLocaleString('ar-EG')} ${cur}`;
}

async function signedPreview(path) {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage.from('store').createSignedUrl(path, 600);
    if (error) return null;
    return data?.signedUrl || null;
  } catch {
    return null;
  }
}

async function loadProducts() {
  const el = document.getElementById('store-list');
  if (!el) return;
  el.innerHTML = '<div class="skeleton-card"><div class="skeleton skeleton-title"></div></div>';

  try {
    const { data, error } = await supabase
      .from('store_products')
      .select('id, title, description, price, currency, preview_image_path, sort_order, created_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data?.length) {
      showEmpty(el, 'لسه مفيش قوالب معروضة.');
      return;
    }

    const cards = await Promise.all(
      data.map(async (p) => {
        const img = await signedPreview(p.preview_image_path);
        return `
          <a class="store-card" href="/store-item.html?id=${encodeURIComponent(p.id)}">
            <div class="store-card-media">
              ${img ? `<img src="${escapeHtml(img)}" alt="" loading="lazy" />` : '<span class="text-muted text-sm">معاينة</span>'}
            </div>
            <div class="store-card-body">
              <h2 class="store-card-title">${escapeHtml(p.title || '')}</h2>
              ${p.description ? `<p class="store-card-desc">${escapeHtml(p.description)}</p>` : ''}
              <p class="store-price">${escapeHtml(formatPrice(p.price, p.currency))}</p>
            </div>
          </a>`;
      })
    );

    el.innerHTML = cards.join('');
  } catch (err) {
    console.error(err);
    const msg = String(err?.message || '');
    if (/relation|42P01|PGRST/i.test(msg)) {
      showError(el, 'جدول المتجر مش موجود. نفّذ supabase/store.sql في Supabase.');
    } else {
      showError(el, 'تعذر تحميل المتجر. حاول مرة تانية.');
    }
  }
}

async function init() {
  const ok = await protectPage();
  if (!ok) return;
  setActiveNav('store');
  initIcons();
  await loadProducts();
}

init();
