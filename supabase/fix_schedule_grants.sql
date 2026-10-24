-- Fix schedule + quizzes read access for authenticated students
-- Run this in Supabase → SQL Editor

-- If you only have schedule_items (current production):
GRANT SELECT ON public.schedule_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_items TO authenticated;

ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view schedule items" ON public.schedule_items;
CREATE POLICY "Students can view schedule items" ON public.schedule_items
  FOR SELECT TO authenticated
  USING (COALESCE(is_active, true) = true OR COALESCE(is_published, true) = true);

DROP POLICY IF EXISTS "Admins manage schedule items" ON public.schedule_items;
CREATE POLICY "Admins manage schedule items" ON public.schedule_items
  FOR ALL TO authenticated
  USING (public.is_admin_or_moderator())
  WITH CHECK (public.is_admin_or_moderator());

-- Quizzes: ensure authenticated can SELECT published rows
GRANT SELECT ON public.quizzes TO authenticated;

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view published quizzes" ON public.quizzes;
CREATE POLICY "Anyone authenticated can view published quizzes" ON public.quizzes
  FOR SELECT TO authenticated
  USING (is_published = true OR public.is_admin_or_moderator());

-- Optional: create schedules table if you prefer the schema.sql name
-- (skip if you use schedule_items only)
