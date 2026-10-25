-- ============================================================
-- Fix: students cannot see rows when is_published IS NULL
-- Run this entire script in Supabase SQL Editor once.
-- ============================================================

-- Helper (no recursion)
CREATE OR REPLACE FUNCTION public.is_admin_or_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'moderator')
      AND COALESCE(p.is_active, true) = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_moderator() TO authenticated, anon;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.subjects TO authenticated;
GRANT SELECT ON public.materials TO authenticated;
GRANT SELECT ON public.announcements TO authenticated;
GRANT SELECT ON public.lectures TO authenticated;
GRANT SELECT ON public.quizzes TO authenticated;

-- Normalize NULL is_published → true (so content is visible)
UPDATE public.subjects SET is_published = true WHERE is_published IS NULL;
UPDATE public.materials SET is_published = true WHERE is_published IS NULL;
UPDATE public.announcements SET is_published = true WHERE is_published IS NULL;
UPDATE public.lectures SET is_published = true WHERE is_published IS NULL;
UPDATE public.quizzes SET is_published = true WHERE is_published IS NULL;

-- SUBJECTS
DROP POLICY IF EXISTS "Anyone authenticated can view published subjects" ON public.subjects;
CREATE POLICY "Anyone authenticated can view published subjects" ON public.subjects
  FOR SELECT TO authenticated
  USING (COALESCE(is_published, true) = true OR public.is_admin_or_moderator());

-- MATERIALS
DROP POLICY IF EXISTS "Anyone authenticated can view published materials" ON public.materials;
CREATE POLICY "Anyone authenticated can view published materials" ON public.materials
  FOR SELECT TO authenticated
  USING (COALESCE(is_published, true) = true OR public.is_admin_or_moderator());

-- ANNOUNCEMENTS
DROP POLICY IF EXISTS "Anyone authenticated can view published announcements" ON public.announcements;
CREATE POLICY "Anyone authenticated can view published announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (COALESCE(is_published, true) = true OR public.is_admin_or_moderator());

-- LECTURES (if table exists)
DO $$ BEGIN
  IF to_regclass('public.lectures') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anyone authenticated can view published lectures" ON public.lectures';
    EXECUTE $p$
      CREATE POLICY "Anyone authenticated can view published lectures" ON public.lectures
        FOR SELECT TO authenticated
        USING (COALESCE(is_published, true) = true OR public.is_admin_or_moderator())
    $p$;
  END IF;
END $$;

-- QUIZZES
DROP POLICY IF EXISTS "Anyone authenticated can view published quizzes" ON public.quizzes;
CREATE POLICY "Anyone authenticated can view published quizzes" ON public.quizzes
  FOR SELECT TO authenticated
  USING (COALESCE(is_published, true) = true OR public.is_admin_or_moderator());
