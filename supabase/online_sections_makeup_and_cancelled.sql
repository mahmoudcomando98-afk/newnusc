-- COMANDO — سيلكتور السكاشن المعوقة: سيكشن تعويضي + سكشن ملغى
-- نفّذ الملف ده مرة واحدة في Supabase SQL Editor.
-- آمن ينفذ أكتر من مرة — كلها if not exists.

alter table public.online_sections
  add column if not exists is_compensatory boolean not null default false;

alter table public.online_sections
  add column if not exists is_cancelled boolean not null default false;
