-- Safe migration for categorized subject files.
-- Run once in Supabase SQL Editor. Existing files and paths are preserved.
BEGIN;

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS material_type TEXT DEFAULT 'lecture',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

UPDATE public.materials
SET material_type = 'lecture'
WHERE material_type IS NULL
   OR material_type NOT IN ('lecture', 'section', 'notes', 'assignment', 'exam', 'other', 'pdf', 'slides');
ALTER TABLE public.materials ALTER COLUMN material_type SET DEFAULT 'lecture';

-- Remove only check constraints that constrain material_type, so older constraints
-- do not block the new "section" category.
DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'materials'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%material_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.materials DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE public.materials
  ADD CONSTRAINT materials_material_type_check
  CHECK (material_type IN ('lecture', 'section', 'notes', 'assignment', 'exam', 'other', 'pdf', 'slides'));

CREATE INDEX IF NOT EXISTS materials_subject_type_published_created_idx
  ON public.materials (subject_id, material_type, is_published, created_at DESC);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;

DROP POLICY IF EXISTS "NUSC users read published materials" ON public.materials;
CREATE POLICY "NUSC users read published materials"
  ON public.materials FOR SELECT TO authenticated
  USING (is_published = true OR private.is_content_manager());

DROP POLICY IF EXISTS "NUSC content managers manage materials" ON public.materials;
CREATE POLICY "NUSC content managers manage materials"
  ON public.materials FOR ALL TO authenticated
  USING (private.is_content_manager())
  WITH CHECK (private.is_content_manager());

-- Upload/delete in the materials bucket is restricted to content managers.
DROP POLICY IF EXISTS "NUSC content managers upload subject files" ON storage.objects;
CREATE POLICY "NUSC content managers upload subject files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'materials' AND private.is_content_manager());

DROP POLICY IF EXISTS "NUSC content managers update subject files" ON storage.objects;
CREATE POLICY "NUSC content managers update subject files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'materials' AND private.is_content_manager())
  WITH CHECK (bucket_id = 'materials' AND private.is_content_manager());

DROP POLICY IF EXISTS "NUSC content managers delete subject files" ON storage.objects;
CREATE POLICY "NUSC content managers delete subject files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'materials' AND private.is_content_manager());

COMMIT;
