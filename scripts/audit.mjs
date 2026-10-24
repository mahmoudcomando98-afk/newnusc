import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', '.vercel']);
const sourceExtensions = new Set(['.html', '.js', '.mjs', '.ts', '.css']);
const forbiddenProjectRef = /keaoerzmdxthrgpqnwvs/i;\nconst hardcodedSupabaseUrl = /https:\\/\\/[a-z0-9-]+\\.supabase\\.co/i;\nconst hardcodedPublishableKey = /sb_publishable_[a-z0-9_-]{20,}/i;\nconst hardcodedJwt = /eyJ[a-zA-Z0-9_-]{20,}\\.[a-zA-Z0-9_-]{10,}\\.[a-zA-Z0-9_-]{10,}/;
const authForms = new Map([
  ['login.html', 'login-form'],
  ['register.html', 'register-form'],
  ['forgot-password.html', 'forgot-form'],
  ['reset-password.html', 'reset-form']
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) files.push(...await walk(full));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

const files = await walk(root);
for (const [relative, formId] of authForms) {
  const full = path.join(root, relative);
  let source;
  try {
    source = await readFile(full, 'utf8');
  } catch {
    errors.push(`Missing auth page: ${relative}`);
    continue;
  }
  const form = source.match(new RegExp('<form\\b[^>]*id=["\\']' + formId + '["\\'][^>]*>', 'i'));
  if (!form) {
    errors.push(`Missing expected form #${formId} in ${relative}`);
    continue;
  }
  if (!/\\bmethod=["']post["']/i.test(form[0])) {
    errors.push(`Auth form must declare method="post": ${relative} #${formId}`);
  }
  if (/\\bmethod=["']get["']/i.test(form[0])) {
    errors.push(`GET is forbidden for credential form: ${relative}`);
  }
}

for (const full of files) {
  const relative = path.relative(root, full).replaceAll(path.sep, '/');
  const source = await readFile(full, 'utf8');
  if (forbiddenProjectRef.test(source)) {
    errors.push(`Removed Supabase project reference found in frontend source: ${relative}`);
  }
  if (/\bservice_role\s*[:=]\s*['"][^'"]{12,}['"]/i.test(source)) {
    errors.push(`Possible service-role secret hardcoded in source: ${relative}`);
  }
}

for (const required of ['404.html', '500.html']) {
  try { await access(path.join(root, required)); }
  catch { errors.push(`Missing fallback error page: ${required}`); }
}

if (errors.length) {
  console.error('NUSC static audit FAILED');
  for (const item of errors) console.error(' - ' + item);
  process.exitCode = 1;
} else {
  console.log(`NUSC static audit passed (${files.length} source files checked).`);
}
for (const item of warnings) console.warn('WARN: ' + item);
