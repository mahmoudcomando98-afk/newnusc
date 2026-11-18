-- COMANDO — سيكشن تعويضي لجدول السكاشن الأونلاين
-- نفّذ الملف ده مرة واحدة في Supabase SQL Editor.
-- بيشتغل من غير ما يكسر أي بيانات موجودة.

alter table public.online_sections
  add column if not exists is_compensatory boolean not null default false;

comment on column public.online_sections.is_compensatory is
  'لو true فالسيكشن ده تعويضي — بيظهر للطلاب في قسم منفصل، وبينزل إشعار + إعلان تلقائي عند إضافته/تغيير ميعاده.';
