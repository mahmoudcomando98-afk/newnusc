/**
 * soft-nav معطّل — التنقل التقليدي فقط.
 * الملف موجود عشان أي استيراد قديم مايكسرش البناء.
 */

export async function softNavigate(href) {
  if (href) window.location.href = href;
}

export function softNavEnabled() {
  return false;
}
