-- ============================================================
-- COMANDO — Multi-Term Workspaces (Phase 1: schema)
-- ملف محلي للمراجعة فقط — لم يتم تنفيذه على أي قاعدة بيانات.
-- لا يعيد تعريف is_admin() / is_admin_or_moderator() المتعارضة.
-- ============================================================

-- 1) دوال مساعدة بأسماء جديدة تمامًا (502337 لا تلمس الدوال القديمة)
create or replace function public.term_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  );
$$;

create or replace function public.term_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'moderator')
      and coalesce(p.is_active, true) = true
  );
$$;

-- 2) جدول الفصول
create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  academic_year text,
  description text,
  status text not null default 'active'
    check (status in ('draft', 'active', 'paused', 'archived')),
  is_default boolean not null default false,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ترم افتراضي واحد فقط
create unique index if not exists terms_one_default
  on public.terms (is_default) where is_default;

-- 3) الطلاب المسموحة لهم الفصول
create table if not exists public.term_members (
  term_id uuid not null references public.terms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (term_id, user_id)
);

-- 4) مسؤولو الترم — الصلاحيات في DB مش في الواجهة
create table if not exists public.term_admins (
  term_id uuid not null references public.terms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  permissions jsonb not null default
    '{"content": true, "students": true, "settings": false}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (term_id, user_id),
  constraint term_admins_permissions_object check (jsonb_typeof(permissions) = 'object')
);

-- 5) الترم النشط لكل مستخدم (طالب أو أدمن)
alter table public.profiles
  add column if not exists current_term_id uuid references public.terms(id) on delete set null;

-- 6) إضافة term_id لكل الجداول المرتبطة بالمحتوى
--    DEFAULT يخلي كل INSERT الحالي يشتغل بدون تعديل الصفحات.
--    نضيف is_active بأمان لأن سياسات RLS الجديدة بتعتمد عليه.
alter table public.subjects                 add column if not exists is_active boolean not null default true;
alter table public.lectures                 add column if not exists is_active boolean not null default true;
alter table public.materials                add column if not exists is_active boolean not null default true;
alter table public.quizzes                  add column if not exists is_active boolean not null default true;
alter table public.schedules                add column if not exists is_active boolean not null default true;
alter table public.schedule_items           add column if not exists is_active boolean not null default true;
alter table public.online_section_sessions  add column if not exists is_active boolean not null default true;
create or replace function public.terms_add_term_columns()
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare t text;
begin
  foreach t in array array[
    'subjects','lectures','materials','quizzes','quiz_rules','announcements',
    'notifications','schedule_items','schedules','online_sections',
    'online_section_sessions','online_schedule_meta','study_tasks',
    'favorites','teacher_upload_links'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'تم تخطي الجدول غير الموجود: %', t;
      continue;
    end if;
    execute format(
      'alter table public.%I add column if not exists term_id uuid references public.terms(id) on delete restrict',
      t
    );
  end loop;
end;
$fn$;
select public.terms_add_term_columns();
drop function public.terms_add_term_columns();

-- 7) الدوال اللي بتقرأ الترم الحالي بعد ما الجداول ات-created
create or replace function public.term_current_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.current_term_id from public.profiles p where p.id = auth.uid()),
    (select t.id from public.terms t where t.is_default and t.status = 'active' order by t.created_at limit 1)
  );
$$;

create or replace function public.term_user_term_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct x.id), '{}'::uuid[])
  from (
    select t.id from public.terms t
      where t.is_public = true and t.status = 'active'
    union
    select tm.term_id from public.term_members tm where tm.user_id = auth.uid()
    union
    select t.id from public.terms t where t.is_default = true and t.status = 'active'
    union
    select t.id from public.terms t where public.term_is_super_admin() and t.status <> 'archived'
  ) x;
$$;

create or replace function public.term_can_manage(p_term uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.term_is_super_admin()
    or (
      p_term is not null
      and exists (
        select 1 from public.term_admins ta
        where ta.user_id = auth.uid()
          and ta.term_id = p_term
          and coalesce(ta.permissions->>'content', 'false') = 'true'
      )
    );
$$;

create or replace function public.term_can_manage_students(p_term uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.term_is_super_admin()
    or (
      p_term is not null
      and exists (
        select 1 from public.term_admins ta
        where ta.user_id = auth.uid()
          and ta.term_id = p_term
          and coalesce(ta.permissions->>'students', 'false') = 'true'
      )
    );
$$;

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
    or p_term = any(public.term_user_term_ids())
    or public.term_can_manage(p_term);
$$;

-- 8) Defaults بعد تعريف الدوال (يتخطّى الجداول الناقصة بأمان)
create or replace function public.terms_set_term_defaults()
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare t text;
begin
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
      execute format(
        'alter table public.%I alter column term_id set default public.term_current_id()',
        t
      );
    end if;
  end loop;
end;
$fn$;
select public.terms_set_term_defaults();
drop function public.terms_set_term_defaults();

-- 9) فهارس الأداء (فقط للجداول اللي ليها عمود term_id)
create or replace function public.terms_create_term_indexes()
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare t text;
begin
  foreach t in array array[
    'subjects','lectures','materials','quizzes','announcements','notifications',
    'schedule_items','online_sections','online_section_sessions'
  ]
  loop
    if to_regclass('public.' || t) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = t and column_name = 'term_id'
       )
    then
      execute format(
        'create index if not exists %I on public.%I (term_id)',
        t || '_term_idx',
        t
      );
    end if;
  end loop;
end;
$fn$;
select public.terms_create_term_indexes();
drop function public.terms_create_term_indexes();

-- 10) إصلاح قيد «ترم واحد فقط» في جدول ميتا الأونلاين
create or replace function public.terms_fix_online_meta_key()
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare r record;
begin
  if to_regclass('public.online_schedule_meta') is null then
    raise notice 'جدول online_schedule_meta غير موجود — تم تخطي إصلاح القيد';
    return;
  end if;
  for r in
    select conname from pg_constraint
    where conrelid = 'public.online_schedule_meta'::regclass and contype = 'c'
  loop
    execute format('alter table public.online_schedule_meta drop constraint %I', r.conname);
  end loop;
  alter table public.online_schedule_meta drop constraint if exists online_schedule_meta_pkey;
  alter table public.online_schedule_meta alter column id drop default;
end;
$fn$;
select public.terms_fix_online_meta_key();
drop function public.terms_fix_online_meta_key();

-- 11) RPC لتغيير الترم النشط — التحقق في DB مش في الواجهة
create or replace function public.set_current_term(p_term uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_term is null then
    return false;
  end if;

  if not public.term_is_super_admin()
     and not (p_term = any(public.term_user_term_ids())) then
    raise exception 'الترم غير متاح لهذا المستخدم';
  end if;

  update public.profiles
     set current_term_id = p_term
   where id = auth.uid();

  return found;
end;
$$;

revoke all on function
  public.term_is_super_admin(),
  public.term_is_staff(),
  public.term_current_id(),
  public.term_user_term_ids(),
  public.term_can_manage(uuid),
  public.term_can_manage_students(uuid),
  public.term_is_visible(uuid),
  public.set_current_term(uuid)
  from public, anon;
grant execute on function
  public.term_is_super_admin(),
  public.term_is_staff(),
  public.term_current_id(),
  public.term_user_term_ids(),
  public.term_can_manage(uuid),
  public.term_can_manage_students(uuid),
  public.term_is_visible(uuid),
  public.set_current_term(uuid)
  to authenticated;

-- 12) أي مستخدم جديد يبدأ على الترم الافتراضي
create or replace function public.terms_set_new_user_term()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.current_term_id is null then
    new.current_term_id := (
      select t.id from public.terms t
      where t.is_default = true and t.status = 'active'
      order by t.created_at limit 1
    );
  end if;
  return new;
end;
$$;

drop trigger if exists terms_set_new_user_term on public.profiles;
create trigger terms_set_new_user_term
  before insert on public.profiles
  for each row execute function public.terms_set_new_user_term();
