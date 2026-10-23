-- Safe compatibility migration for NUSC quiz loading and administration.
-- Run in Supabase SQL Editor. It does not drop or truncate any table/data.

BEGIN;

CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  topics TEXT,
  instructions TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  total_marks NUMERIC,
  passing_score NUMERIC,
  quiz_url TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS topics TEXT,
  ADD COLUMN IF NOT EXISTS instructions TEXT,
  ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS total_marks NUMERIC,
  ADD COLUMN IF NOT EXISTS passing_score NUMERIC,
  ADD COLUMN IF NOT EXISTS quiz_url TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'upcoming',
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Preserve deployments that used older rules and quiz_date field names.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quizzes' AND column_name = 'quiz_date'
  ) THEN
    EXECUTE 'UPDATE public.quizzes SET start_at = COALESCE(start_at, NULLIF(quiz_date::text, '''')::timestamptz) WHERE start_at IS NULL AND quiz_date IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quizzes' AND column_name = 'rules'
  ) THEN
    EXECUTE 'UPDATE public.quizzes SET instructions = COALESCE(NULLIF(instructions, ''''), rules) WHERE (instructions IS NULL OR instructions = '''') AND rules IS NOT NULL';
  END IF;
END $$;

UPDATE public.quizzes SET title = 'كويز' WHERE title IS NULL OR btrim(title) = '';
ALTER TABLE public.quizzes ALTER COLUMN title SET NOT NULL;

CREATE INDEX IF NOT EXISTS quizzes_subject_id_idx ON public.quizzes(subject_id);
CREATE INDEX IF NOT EXISTS quizzes_start_at_idx ON public.quizzes(start_at);

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;

DROP POLICY IF EXISTS "Anyone authenticated can view published quizzes" ON public.quizzes;
CREATE POLICY "Anyone authenticated can view published quizzes"
  ON public.quizzes FOR SELECT TO authenticated
  USING (is_published = true OR private.is_content_manager());

DROP POLICY IF EXISTS "Admins can manage quizzes" ON public.quizzes;
CREATE POLICY "Admins can manage quizzes"
  ON public.quizzes FOR ALL TO authenticated
  USING (private.is_content_manager())
  WITH CHECK (private.is_content_manager());

COMMIT;
