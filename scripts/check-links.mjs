#!/usr/bin/env node
/**
 * يفحص أن كل رابط داخلي مطلق (/...) في ملفات HTML يشير إلى:
 *   1) ملف موجود في جذر المشروع، أو
 *   2) ملف موجود في public/ (يُنسخ إلى dist كما هو)، أو
 *   3) مسار معرّف كـ rewrite في vercel.json
 * يخرج بخطأ (exit 1) إن وُجدت روابط مكسورة.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'scripts']);
const ATTR_RE = /(?:href|src|action)\s*=\s*["'](\/[^"']*)["']/g;

const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
const rewriteSources = new Set(
  (vercel.rewrites ?? []).map((r) => r.source.replace(/\/+$/, '') || '/')
);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full);
    } else if (entry.name.endsWith('.html')) {
      yield full;
    }
  }
}

function resolveCandidate(urlPath) {
  const cleaned = urlPath.split('?')[0].split('#')[0];
  if (!cleaned || cleaned === '/') return true;
  const rel = decodeURIComponent(cleaned.replace(/^\/+/, ''));
  if (existsSync(join(ROOT, rel))) return true;
  if (existsSync(join(ROOT, 'public', rel))) return true;
  if (rewriteSources.has(cleaned.replace(/\/+$/, '') || '/')) return true;
  // المسارات بدون امتداد تقبل المطابقة على ملف .html المجاور
  if (!extname(rel) && existsSync(join(ROOT, `${rel}.html`))) return true;
  return false;
}

const broken = [];
let checked = 0;
for (const file of walk(ROOT)) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(ATTR_RE)) {
    const url = match[1];
    if (/^\/\//.test(url)) continue; // protocol-relative → خارجي
    checked += 1;
    if (!resolveCandidate(url)) {
      broken.push({ file: file.slice(ROOT.length), url });
    }
  }
}

console.log(`checked ${checked} internal references`);
if (broken.length) {
  console.error('broken internal links:');
  for (const { file, url } of broken) console.error(`  ${file} -> ${url}`);
  process.exit(1);
}
console.log('all internal links resolve ✓');
