-- ============================================================
-- NUSC: restore student data access (GRANT + basic RLS)
-- Run ENTIRE file in Supabase → SQL Editor once.
-- Fixes: empty subjects/quizzes/schedule/profile when logged in.
-- ============================================================

-- Table privileges (RLS alone is not enough without GRANT)
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Students need to update their own profile row sometimes
GRANT UPDATE ON public.profiles TO authenticated;

-- Anon: only what is required for the login page (minimal)
GRANT SELECT ON public.platform_settings TO anon, authenticated;

-- Ensure RLS is on for main tables
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: own row
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Subjects / lectures / materials / quizzes / announcements: published rows
DROP POLICY IF EXISTS "Anyone authenticated can view published subjects" ON public.subjects;
CREATE POLICY "Anyone authenticated can view published subjects" ON public.subjects
  FOR SELECT TO authenticated
  USING (COALESCE(is_published, true) = true);

DROP POLICY IF EXISTS "Authenticated read lectures" ON public.lectures;
DROP POLICY IF EXISTS "Anyone authenticated can view published lectures" ON public.lectures;
CREATE POLICY "Anyone authenticated can view published lectures" ON public.lectures
  FOR SELECT TO authenticated
  USING (COALESCE(is_published, true) = true);

DROP POLICY IF EXISTS "Authenticated read materials" ON public.materials;
DROP POLICY IF EXISTS "Anyone authenticated can view published materials" ON public.materials;
CREATE POLICY "Anyone authenticated can view published materials" ON public.materials
  FOR SELECT TO authenticated
  USING (COALESCE(is_published, true) = true);

DROP POLICY IF EXISTS "Anyone authenticated can view published quizzes" ON public.quizzes;
CREATE POLICY "Anyone authenticated can view published quizzes" ON public.quizzes
  FOR SELECT TO authenticated
  USING (COALESCE(is_published, true) = true);

DROP POLICY IF EXISTS "Anyone authenticated can view published announcements" ON public.announcements;
CREATE POLICY "Anyone authenticated can view published announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (COALESCE(is_published, true) = true);

-- Schedule (production table name)
DO $$ BEGIN
  IF to_regclass('public.schedule_items') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.schedule_items TO authenticated';
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "Authenticated read schedule_items" ON public.schedule_items';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    EXECUTE $p$
      CREATE POLICY "Authenticated read schedule_items" ON public.schedule_items
        FOR SELECT TO authenticated
        USING (true)
    $p$;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.schedules') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.schedules TO authenticated';
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "Authenticated read schedules" ON public.schedules';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    EXECUTE $p$
      CREATE POLICY "Authenticated read schedules" ON public.schedules
        FOR SELECT TO authenticated
        USING (COALESCE(is_published, true) = true)
    $p$;
  END IF;
END $$;

-- Default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO authenticated;
