-- ============================================================
-- COMANDO — Multi-Term Workspaces (Phase 3: backfill)
-- ملف محلي للمراجعة فقط — لم يتم تنفيذه على أي قاعدة بيانات.
-- يعتمد على terms_001 + terms_002.Affects existing rows but does NOT delete data.
-- ============================================================

-- 1) ترم افتراضي واحد للمحتوى الحالي
insert into public.terms (name, academic_year, description, status, is_default, is_public, sort_order)
select
  'الترم الحالي',
  null,
  'المحتوى الحالي للمنصة قبل تفعيل نظام الفصول الدراسية.',
  'active',
  true,
  true,
  0
where not exists (
  select 1 from public.terms where is_default = true
);

-- 2) كل المستخدمين يبدأوا على الترم الافتراضي
update public.profiles p
   set current_term_id = d.id
  from (
    select id from public.terms where is_default = true order by created_at limit 1
  ) d
 where p.current_term_id is null;

-- 3) نقل كل المحتوى الموجود للترم الافتراضي (عشان ما يظهرش كـ «عام» في كل ترم)
create or replace function public.terms_backfill_content()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d uuid;
  t text;
begin
  select id into d from public.terms where is_default = true order by created_at limit 1;
  if d is null then
    raise exception 'لا يوجد ترم افتراضي — نفّذ terms_001 وterms_003 بالترتيب';
  end if;

  foreach t in array array[
    'subjects','lectures','materials','quizzes','quiz_rules','announcements',
    'notifications','schedule_items','schedules','online_sections',
    'online_section_sessions','online_schedule_meta','study_tasks',
    'favorites','teacher_upload_links'
  ]
  loop
    if to_regclass('public.' || t) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = t and column_name = 'term_id'
       )
    then
      execute format('update public.%I set term_id = $1 where term_id is null', t) using d;
      raise notice 'backfill term_id: %', t;
    else
      raise notice 'تم تخطي % (الجدول أو عمود term_id غير موجود)', t;
    end if;
  end loop;

  if to_regclass('public.online_schedule_meta') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'online_schedule_meta' and column_name = 'term_id'
     )
  then
    update public.online_schedule_meta set term_id = d where term_id is null;
    alter table public.online_schedule_meta alter column term_id set not null;
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.online_schedule_meta'::regclass and contype = 'p'
    ) then
      alter table public.online_schedule_meta add primary key (term_id);
    end if;
  end if;
end;
$$;
select public.terms_backfill_content();
drop function public.terms_backfill_content();

-- 4) المسؤولون الحاليون (moderator) يصبحون مسؤولي الترم الافتراضي
insert into public.term_admins (term_id, user_id, permissions, created_by)
select
  d.id,
  p.id,
  '{"content": true, "students": true, "settings": false}'::jsonb,
  null
from public.profiles p
cross join (select id from public.terms where is_default = true order by created_at limit 1) d
where p.role = 'moderator'
  and coalesce(p.is_active, true) = true
on conflict (term_id, user_id) do nothing;

-- 5) الطلاب الحاليون أعضاء في الترم الافتراضي (حتى لو كان خاصًا)
insert into public.term_members (term_id, user_id)
select d.id, p.id
from public.profiles p
cross join (select id from public.terms where is_default = true order by created_at limit 1) d
where p.role = 'student'
on conflict (term_id, user_id) do nothing;

-- 6) فهرس إضافي للبحث حسب الترم + النشر
create index if not exists materials_term_published_idx
  on public.materials (term_id, is_published, created_at desc);
create index if not exists subjects_term_published_idx
  on public.subjects (term_id, is_published, sort_order);
create index if not exists announcements_term_published_idx
  on public.announcements (term_id, is_published, created_at desc);

