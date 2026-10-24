-- ============================================================
-- NUSC: fix missing helpers + schedule/quizzes student read access
-- Run entire file in Supabase → SQL Editor (one shot)
-- ============================================================

-- 1) Helper functions (were missing on this project)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND COALESCE(is_active, true) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_moderator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'moderator')
      AND COALESCE(is_active, true) = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_moderator() TO authenticated, anon;

-- 2) schedule_items (live table name)
DO $$ BEGIN
  IF to_regclass('public.schedule_items') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.schedule_items TO authenticated';
    EXECUTE 'ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY';

    -- Drop old policies if present
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "Students can view schedule items" ON public.schedule_items';
      EXECUTE 'DROP POLICY IF EXISTS "Admins manage schedule items" ON public.schedule_items';
      EXECUTE 'DROP POLICY IF EXISTS "Anyone authenticated can view schedule items" ON public.schedule_items';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Students: read all rows they are allowed (keep simple — authenticated can read)
    EXECUTE $p$
      CREATE POLICY "Students can view schedule items" ON public.schedule_items
        FOR SELECT TO authenticated
        USING (true)
    $p$;

    EXECUTE $p$
      CREATE POLICY "Admins manage schedule items" ON public.schedule_items
        FOR ALL TO authenticated
        USING (public.is_admin_or_moderator())
        WITH CHECK (public.is_admin_or_moderator())
    $p$;
  END IF;
END $$;

-- 3) schedules (optional — only if table exists)
DO $$ BEGIN
  IF to_regclass('public.schedules') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.schedules TO authenticated';
    EXECUTE 'ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY';
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "Anyone authenticated can view published schedules" ON public.schedules';
      EXECUTE 'DROP POLICY IF EXISTS "Admins can manage schedules" ON public.schedules';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    EXECUTE $p$
      CREATE POLICY "Anyone authenticated can view published schedules" ON public.schedules
        FOR SELECT TO authenticated
        USING (COALESCE(is_published, true) = true OR public.is_admin_or_moderator())
    $p$;
    EXECUTE $p$
      CREATE POLICY "Admins can manage schedules" ON public.schedules
        FOR ALL TO authenticated
        USING (public.is_admin_or_moderator())
        WITH CHECK (public.is_admin_or_moderator())
    $p$;
  END IF;
END $$;

-- 4) quizzes
DO $$ BEGIN
  IF to_regclass('public.quizzes') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.quizzes TO authenticated';
    EXECUTE 'ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY';
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "Anyone authenticated can view published quizzes" ON public.quizzes';
      EXECUTE 'DROP POLICY IF EXISTS "Admins can manage quizzes" ON public.quizzes';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    EXECUTE $p$
      CREATE POLICY "Anyone authenticated can view published quizzes" ON public.quizzes
        FOR SELECT TO authenticated
        USING (COALESCE(is_published, true) = true OR public.is_admin_or_moderator())
    $p$;
    EXECUTE $p$
      CREATE POLICY "Admins can manage quizzes" ON public.quizzes
        FOR ALL TO authenticated
        USING (public.is_admin_or_moderator())
        WITH CHECK (public.is_admin_or_moderator())
    $p$;
  END IF;
END $$;
