-- ============================================================
-- COMANDO — حذف الترمات (محلي للمراجعة فقط — لم يُنفّذ)
-- يعتمد على terms_001..003. الحذف للمدير الأساسي فقط.
-- ============================================================

create or replace function public.delete_term_safe(
  p_term uuid,
  p_confirm_delete_content boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  has_content boolean := false;
begin
  if not public.term_is_super_admin() then
    raise exception 'فقط المدير الأساسي يقدر يحذف الترمات';
  end if;

  if not exists (select 1 from public.terms where id = p_term) then
    raise exception 'الترم غير موجود';
  end if;

  if exists (select 1 from public.terms where id = p_term and is_default = true) then
    raise exception 'مايتحذفش الترم الافتراضي — عيّن ترم تاني أولًا';
  end if;

  select exists (
    select 1 from public.subjects where term_id = p_term
    union all select 1 from public.materials where term_id = p_term
    union all select 1 from public.lectures where term_id = p_term
    union all select 1 from public.quizzes where term_id = p_term
    union all select 1 from public.announcements where term_id = p_term
    union all select 1 from public.notifications where term_id = p_term
    union all select 1 from public.schedule_items where term_id = p_term
    union all select 1 from public.online_sections where term_id = p_term
    union all select 1 from public.online_section_sessions where term_id = p_term
    union all select 1 from public.study_tasks where term_id = p_term
    union all select 1 from public.favorites where term_id = p_term
    union all select 1 from public.teacher_upload_links where term_id = p_term
  ) into has_content;

  if has_content and coalesce(p_confirm_delete_content, false) = false then
    raise exception 'الترم فيه محتوى — أرشفه أو أكّد حذف كل المحتوى';
  end if;

  if coalesce(p_confirm_delete_content, false) = true then
    -- حذف ملفات Storage المرتبطة بالترم
    delete from storage.objects
     where bucket_id = 'materials'
       and (
         name in (select file_path from public.materials where term_id = p_term and file_path is not null)
         or name in (select solution_image_path from public.materials where term_id = p_term and solution_image_path is not null)
         or name in (select solution_image_path from public.quizzes where term_id = p_term and solution_image_path is not null)
       );

    delete from public.quiz_attempts where quiz_id in (select id from public.quizzes where term_id = p_term);
    delete from public.quiz_questions where quiz_id in (select id from public.quizzes where term_id = p_term);
    delete from public.material_user_downloads where material_id in (select id from public.materials where term_id = p_term);
    delete from public.notification_reads where notification_id in (select id from public.notifications where term_id = p_term);
    delete from public.materials where term_id = p_term;
    delete from public.lectures where term_id = p_term;
    delete from public.quizzes where term_id = p_term;
    delete from public.quiz_rules where term_id = p_term;
    delete from public.subjects where term_id = p_term;
    delete from public.announcements where term_id = p_term;
    delete from public.notifications where term_id = p_term;
    delete from public.schedule_items where term_id = p_term;
    delete from public.schedules where term_id = p_term;
    delete from public.online_sections where term_id = p_term;
    delete from public.online_section_sessions where term_id = p_term;
    delete from public.online_schedule_meta where term_id = p_term;
    delete from public.study_tasks where term_id = p_term;
    delete from public.favorites where term_id = p_term;
    delete from public.teacher_upload_links where term_id = p_term;
  end if;

  -- إعادة الترم النشط للافتراضي لو كان محذوفًا
  update public.profiles
     set current_term_id = (select id from public.terms where is_default = true limit 1)
   where current_term_id = p_term;

  delete from public.term_members where term_id = p_term;
  delete from public.term_admins where term_id = p_term;
  delete from public.terms where id = p_term;
  return true;
end;
$$;

revoke all on function public.delete_term_safe(uuid, boolean) from public, anon;
grant execute on function public.delete_term_safe(uuid, boolean) to authenticated;
