-- ============================================================
-- COMANDO — إصلاح ظهور المحتوى بين الترمات (محلي للمراجعة فقط)
-- المشكلة: term_is_visible كان بيرجع true لأي ترم الطالب عضو فيه،
-- فمحتوى الترم الافتراضي كان بيظهر جوّه كل ترم.
-- الحل: المحتوى يظهر بس للترم النشط + المحتوى العام (term_id IS NULL)
--       + الترمات اللي المدير/مسؤول الترم يقدر يديرها.
-- ============================================================

create or replace function public.term_is_visible(p_term uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_term is null
    or p_term = public.term_current_id()
    or public.term_can_manage(p_term);
$$;

revoke all on function public.term_is_visible(uuid) from public, anon;
grant execute on function public.term_is_visible(uuid) to authenticated;
