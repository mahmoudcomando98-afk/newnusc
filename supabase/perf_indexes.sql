-- Optional performance indexes for NUSC (safe to run multiple times)
-- Run in Supabase SQL Editor

CREATE INDEX IF NOT EXISTS idx_subjects_name ON public.subjects (name);
CREATE INDEX IF NOT EXISTS idx_materials_created_at ON public.materials (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_materials_subject_id ON public.materials (subject_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quizzes_start_at ON public.quizzes (start_at);

-- Partial indexes only if is_published exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'is_published'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_materials_published_created ON public.materials (created_at DESC) WHERE is_published IS DISTINCT FROM false';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'is_published'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_announcements_published_created ON public.announcements (created_at DESC) WHERE is_published IS DISTINCT FROM false';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'is_published'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_subjects_published_name ON public.subjects (name) WHERE is_published IS DISTINCT FROM false';
  END IF;
END $$;
