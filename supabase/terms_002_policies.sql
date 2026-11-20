-- ============================================================
-- COMANDO — Multi-Term Workspaces (Phase 2: RLS)
-- ملف محلي للمراجعة فقط — لم يتم تنفيذه على أي قاعدة بيانات.
-- يعتمد على terms_001_schema.sql ويجب تنفيذه بعد ملفات الحماية القديمة.
-- ============================================================

-- 1) إزالة السياسات القديمة على جداول المحتوى فقط، مع الإبقاء على
--    «Maintenance access gate» (RESTRICTIVE) وسياساتنا التي تبدأ بـ term_.
create or replace function public.terms_drop_old_policies()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t text;
  r record;
begin
  foreach t in array array[
    'subjects','lectures','materials','quizzes','quiz_rules','announcements',
    'notifications','schedule_items','schedules','online_sections',
    'online_section_sessions','online_schedule_meta','study_tasks',
    'favorites','teacher_upload_links'
  ]
  loop
    for r in
      select policyname from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname <> 'Maintenance access gate'
        and policyname not like 'term_%'
    loop
      execute format('drop policy if exists %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end;
$$;
select public.terms_drop_old_policies();
drop function public.terms_drop_old_policies();

-- 2) الفصول نفسها
alter table public.terms enable row level security;
alter table public.term_members enable row level security;
alter table public.term_admins enable row level security;

drop policy if exists term_terms_read on public.terms;
create policy term_terms_read on public.terms
  for select to authenticated
  using (
    public.term_is_super_admin()
    or public.term_can_manage(id)
    or (status = 'active' and (is_public = true or id = any(public.term_user_term_ids())))
  );

drop policy if exists term_terms_write on public.terms;
create policy term_terms_write on public.terms
  for all to authenticated
  using (public.term_is_super_admin())
  with check (public.term_is_super_admin());

-- 3) عضوية الطلاب
drop policy if exists term_members_read on public.term_members;
create policy term_members_read on public.term_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.term_is_super_admin()
    or public.term_can_manage(term_id)
  );

drop policy if exists term_members_write on public.term_members;
create policy term_members_write on public.term_members
  for all to authenticated
  using (
    public.term_is_super_admin()
    or public.term_can_manage_students(term_id)
  )
  with check (
    public.term_is_super_admin()
    or public.term_can_manage_students(term_id)
  );

-- 4) مسؤولو الترم — الكتابة للمدير الأساسي فقط (منع تخريف الصلاحيات)
drop policy if exists term_admins_read on public.term_admins;
create policy term_admins_read on public.term_admins
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.term_is_super_admin()
  );

drop policy if exists term_admins_write on public.term_admins;
create policy term_admins_write on public.term_admins
  for all to authenticated
  using (public.term_is_super_admin())
  with check (public.term_is_super_admin());

-- 5) سياسات المحتوى العام (منشور + ضمن الترم)
drop policy if exists term_subjects_read on public.subjects;
create policy term_subjects_read on public.subjects
  for select to authenticated
  using (
    public.term_can_manage(term_id)
    or (
      public.term_is_visible(term_id)
      and coalesce(is_published, true) = true
      and coalesce(is_active, true) = true
    )
  );
drop policy if exists term_subjects_write on public.subjects;
create policy term_subjects_write on public.subjects
  for all to authenticated
  using (public.term_can_manage(term_id))
  with check (public.term_can_manage(term_id));

drop policy if exists term_lectures_read on public.lectures;
create policy term_lectures_read on public.lectures
  for select to authenticated
  using (
    public.term_can_manage(term_id)
    or (
      public.term_is_visible(term_id)
      and coalesce(is_published, true) = true
      and coalesce(is_active, true) = true
    )
  );
drop policy if exists term_lectures_write on public.lectures;
create policy term_lectures_write on public.lectures
  for all to authenticated
  using (public.term_can_manage(term_id))
  with check (public.term_can_manage(term_id));

drop policy if exists term_materials_read on public.materials;
create policy term_materials_read on public.materials
  for select to authenticated
  using (
    public.term_can_manage(term_id)
    or (
      public.term_is_visible(term_id)
      and coalesce(is_published, true) = true
      and coalesce(is_active, true) = true
      and (publish_at is null or publish_at <= now())
    )
  );
drop policy if exists term_materials_write on public.materials;
create policy term_materials_write on public.materials
  for all to authenticated
  using (public.term_can_manage(term_id))
  with check (public.term_can_manage(term_id));

drop policy if exists term_quizzes_read on public.quizzes;
create policy term_quizzes_read on public.quizzes
  for select to authenticated
  using (
    public.term_can_manage(term_id)
    or (
      public.term_is_visible(term_id)
      and coalesce(is_published, true) = true
      and coalesce(is_active, true) = true
    )
  );
drop policy if exists term_quizzes_write on public.quizzes;
create policy term_quizzes_write on public.quizzes
  for all to authenticated
  using (public.term_can_manage(term_id))
  with check (public.term_can_manage(term_id));

drop policy if exists term_quiz_rules_read on public.quiz_rules;
create policy term_quiz_rules_read on public.quiz_rules
  for select to authenticated
  using (
    public.term_can_manage(term_id)
    or (public.term_is_visible(term_id) and coalesce(is_published, true) = true)
  );
drop policy if exists term_quiz_rules_write on public.quiz_rules;
create policy term_quiz_rules_write on public.quiz_rules
  for all to authenticated
  using (public.term_can_manage(term_id))
  with check (public.term_can_manage(term_id));

drop policy if exists term_announcements_read on public.announcements;
create policy term_announcements_read on public.announcements
  for select to authenticated
  using (
    public.term_can_manage(term_id)
    or (
      public.term_is_visible(term_id)
      and coalesce(is_published, true) = true
      and (expires_at is null or expires_at > now())
      and (publish_at is null or publish_at <= now())
    )
  );
drop policy if exists term_announcements_write on public.announcements;
create policy term_announcements_write on public.announcements
  for all to authenticated
  using (public.term_can_manage(term_id))
  with check (public.term_can_manage(term_id));

-- 6) الإشعارات: خاصة بالمستخدم أو عامة، داخل الترم المرئي
drop policy if exists term_notifications_read on public.notifications;
create policy term_notifications_read on public.notifications
  for select to authenticated
  using (
    public.term_can_manage(term_id)
    or (
      public.term_is_visible(term_id)
      and (user_id is null or user_id = auth.uid())
    )
  );
drop policy if exists term_notifications_write on public.notifications;
create policy term_notifications_write on public.notifications
  for all to authenticated
  using (public.term_can_manage(term_id))
  with check (public.term_can_manage(term_id));

-- 7) الجدول (الاسمين القديم والجاري)
drop policy if exists term_schedule_items_read on public.schedule_items;
create policy term_schedule_items_read on public.schedule_items
  for select to authenticated
  using (
    public.term_can_manage(term_id)
    or (public.term_is_visible(term_id) and coalesce(is_active, true) = true)
  );
drop policy if exists term_schedule_items_write on public.schedule_items;
create policy term_schedule_items_write on public.schedule_items
  for all to authenticated
  using (public.term_can_manage(term_id))
  with check (public.term_can_manage(term_id));

drop policy if exists term_schedules_read on public.schedules;
create policy term_schedules_read on public.schedules
  for select to authenticated
  using (
    public.term_can_manage(term_id)
    or (
      public.term_is_visible(term_id)
      and coalesce(is_published, true) = true
      and coalesce(is_active, true) = true
    )
  );
drop policy if exists term_schedules_write on public.schedules;
create policy term_schedules_write on public.schedules
  for all to authenticated
  using (public.term_can_manage(term_id))
  with check (public.term_can_manage(term_id));

-- 8) السكاشن الأونلاين (نظامين)
drop policy if exists term_online_sections_read on public.online_sections;
create policy term_online_sections_read on public.online_sections
  for select to authenticated
  using (
    public.term_can_manage(term_id)
    or (public.term_is_visible(term_id) and coalesce(is_published, true) = true)
  );
drop policy if exists term_online_sections_write on public.online_sections;
create policy term_online_sections_write on public.online_sections
  for all to authenticated
  using (public.term_can_manage(term_id))
  with check (public.term_can_manage(term_id));

drop policy if exists term_online_sessions_read on public.online_section_sessions;
create policy term_online_sessions_read on public.online_section_sessions
  for select to authenticated
  using (
    public.term_can_manage(term_id)
    or (public.term_is_visible(term_id) and coalesce(is_active, true) = true)
  );
drop policy if exists term_online_sessions_write on public.online_section_sessions;
create policy term_online_sessions_write on public.online_section_sessions
  for all to authenticated
  using (public.term_can_manage(term_id))
  with check (public.term_can_manage(term_id));

drop policy if exists term_online_meta_read on public.online_schedule_meta;
create policy term_online_meta_read on public.online_schedule_meta
  for select to authenticated
  using (public.term_can_manage(term_id) or public.term_is_visible(term_id));
drop policy if exists term_online_meta_write on public.online_schedule_meta;
create policy term_online_meta_write on public.online_schedule_meta
  for all to authenticated
  using (public.term_can_manage(term_id))
  with check (public.term_can_manage(term_id));

-- 9) بيانات خاصة بالمستخدم داخل الترم
drop policy if exists term_study_tasks_read on public.study_tasks;
create policy term_study_tasks_read on public.study_tasks
  for select to authenticated
  using (user_id = auth.uid() and public.term_is_visible(term_id));
drop policy if exists term_study_tasks_write on public.study_tasks;
create policy term_study_tasks_write on public.study_tasks
  for all to authenticated
  using (user_id = auth.uid() and public.term_is_visible(term_id))
  with check (user_id = auth.uid() and public.term_is_visible(term_id));

drop policy if exists term_favorites_read on public.favorites;
create policy term_favorites_read on public.favorites
  for select to authenticated
  using (user_id = auth.uid() and public.term_is_visible(term_id));
drop policy if exists term_favorites_write on public.favorites;
create policy term_favorites_write on public.favorites
  for all to authenticated
  using (user_id = auth.uid() and public.term_is_visible(term_id))
  with check (user_id = auth.uid() and public.term_is_visible(term_id));

drop policy if exists term_teacher_links_read on public.teacher_upload_links;
create policy term_teacher_links_read on public.teacher_upload_links
  for select to authenticated
  using (public.term_can_manage(term_id));
drop policy if exists term_teacher_links_write on public.teacher_upload_links;
create policy term_teacher_links_write on public.teacher_upload_links
  for all to authenticated
  using (public.term_can_manage(term_id))
  with check (public.term_can_manage(term_id));

-- 10) Storage: قراءة ملفات الترم الحالي فقط (مسارات التخزين ما زالت كما هي)
create or replace function public.terms_drop_old_storage_policies()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname ilike '%material%'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end;
$$;
select public.terms_drop_old_storage_policies();
drop function public.terms_drop_old_storage_policies();

drop policy if exists term_storage_materials_read on storage.objects;
create policy term_storage_materials_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'materials'
    and (
      public.term_is_super_admin()
      or exists (
        select 1 from public.materials m
        where m.file_path = storage.objects.name
          and public.term_is_visible(m.term_id)
          and coalesce(m.is_published, true) = true
      )
      or exists (
        select 1 from public.materials m
        where m.solution_image_path = storage.objects.name
          and public.term_is_visible(m.term_id)
      )
      or exists (
        select 1 from public.quizzes q
        where q.solution_image_path = storage.objects.name
          and public.term_is_visible(q.term_id)
      )
    )
  );

drop policy if exists term_storage_materials_insert on storage.objects;
create policy term_storage_materials_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'materials'
    and (public.term_is_super_admin() or public.term_can_manage(public.term_current_id()))
  );

drop policy if exists term_storage_materials_update on storage.objects;
create policy term_storage_materials_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'materials'
    and (
      public.term_is_super_admin()
      or exists (
        select 1 from public.materials m
        where m.file_path = storage.objects.name and public.term_can_manage(m.term_id)
      )
    )
  );

drop policy if exists term_storage_materials_delete on storage.objects;
create policy term_storage_materials_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'materials'
    and (
      public.term_is_super_admin()
      or exists (
        select 1 from public.materials m
        where m.file_path = storage.objects.name and public.term_can_manage(m.term_id)
      )
    )
  );

-- 11) قفل الصيانة للجداول الجديدة (لو نظام الصيانة موجود)
create or replace function public.terms_add_maintenance_gate()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'is_maintenance_active' and pronamespace = 'private'::regnamespace
  ) then
    execute 'drop policy if exists "Maintenance access gate" on public.terms';
    execute 'create policy "Maintenance access gate" on public.terms as restrictive for all to authenticated using (not private.is_maintenance_active() or public.term_is_super_admin())';
    execute 'drop policy if exists "Maintenance access gate" on public.term_members';
    execute 'create policy "Maintenance access gate" on public.term_members as restrictive for all to authenticated using (not private.is_maintenance_active() or public.term_is_super_admin())';
    execute 'drop policy if exists "Maintenance access gate" on public.term_admins';
    execute 'create policy "Maintenance access gate" on public.term_admins as restrictive for all to authenticated using (not private.is_maintenance_active() or public.term_is_super_admin())';
  end if;
end;
$$;
select public.terms_add_maintenance_gate();
drop function public.terms_add_maintenance_gate();

-- 13) RPC البحث: نفس منطق الظهور في الترم الحالي
create or replace function public.search_content(
  p_query text,
  p_limit integer default 20
)
returns table (
  result_type text,
  result_id uuid,
  title text,
  description text,
  subject_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  (
    select 'subject'::text, s.id, s.name, s.description, null::text, s.created_at
    from public.subjects s
    where s.is_published = true and public.term_is_visible(s.term_id)
      and (s.name ilike '%' || p_query || '%' or s.code ilike '%' || p_query || '%' or s.description ilike '%' || p_query || '%')
    limit p_limit
  )
  union all
  (
    select 'lecture'::text, l.id, l.title, l.description, s.name, l.created_at
    from public.lectures l
    join public.subjects s on s.id = l.subject_id
    where l.is_published = true and public.term_is_visible(l.term_id)
      and (l.title ilike '%' || p_query || '%' or l.description ilike '%' || p_query || '%')
    limit p_limit
  )
  union all
  (
    select 'material'::text, m.id, m.title, m.description, s.name, m.created_at
    from public.materials m
    left join public.subjects s on s.id = m.subject_id
    where m.is_published = true and public.term_is_visible(m.term_id)
      and (m.title ilike '%' || p_query || '%' or m.description ilike '%' || p_query || '%' or m.file_name ilike '%' || p_query || '%')
    limit p_limit
  )
  union all
  (
    select 'announcement'::text, a.id, a.title, left(a.content, 200), s.name, a.created_at
    from public.announcements a
    left join public.subjects s on s.id = a.subject_id
    where a.is_published = true and public.term_is_visible(a.term_id)
      and (a.expires_at is null or a.expires_at > now())
      and (a.title ilike '%' || p_query || '%' or a.content ilike '%' || p_query || '%')
    limit p_limit
  )
  union all
  (
    select 'quiz'::text, q.id, q.title, q.description, s.name, q.created_at
    from public.quizzes q
    left join public.subjects s on s.id = q.subject_id
    where q.is_published = true and public.term_is_visible(q.term_id)
      and (q.title ilike '%' || p_query || '%' or q.topics ilike '%' || p_query || '%')
    limit p_limit
  );
end;
$$;

revoke all on function public.search_content(text, integer) from public, anon;
grant execute on function public.search_content(text, integer) to authenticated;

-- 14) صلاحيات الجداول الجديدة
grant select, insert, update, delete on public.terms, public.term_members, public.term_admins to authenticated;
grant usage on schema public to authenticated;

