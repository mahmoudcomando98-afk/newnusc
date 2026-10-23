-- Repair/initialize the Quiz Rules feature.
-- Safe to run more than once in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.quiz_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_general BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure the expected columns exist if quiz_rules was created earlier by hand.
ALTER TABLE public.quiz_rules
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS is_general BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill rows from an older/manual table before enforcing required text fields.
UPDATE public.quiz_rules
SET title = COALESCE(NULLIF(title, ''), 'قاعدة عامة'),
    content = COALESCE(content, '')
WHERE title IS NULL OR title = '' OR content IS NULL;

ALTER TABLE public.quiz_rules
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN content SET NOT NULL;

ALTER TABLE public.quiz_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.quiz_rules TO authenticated;

DROP POLICY IF EXISTS "Anyone authenticated can view published quiz rules" ON public.quiz_rules;
CREATE POLICY "Anyone authenticated can view published quiz rules"
  ON public.quiz_rules FOR SELECT TO authenticated
  USING (is_published = true OR public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Admins can manage quiz rules" ON public.quiz_rules;
CREATE POLICY "Admins can manage quiz rules"
  ON public.quiz_rules FOR ALL TO authenticated
  USING (public.is_admin_or_moderator())
  WITH CHECK (public.is_admin_or_moderator());
