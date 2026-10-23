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

-- Normalize legacy RLS policies for subjects, lectures, and files.
-- Some older deployments reference public.is_admin_or_moderator(), which may not exist.
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects, public.lectures, public.materials TO authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_content_manager() TO authenticated;

-- Remove only content policies that reference legacy admin helper names.
DO $$
DECLARE
  policy_row RECORD;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('subjects', 'lectures', 'materials')
      AND concat_ws(' ', qual, with_check) ILIKE '%is_admin%'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Anyone authenticated can view published subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins can manage subjects" ON public.subjects;
DROP POLICY IF EXISTS "NUSC users read available subjects" ON public.subjects;
DROP POLICY IF EXISTS "NUSC content managers manage subjects" ON public.subjects;

DROP POLICY IF EXISTS "Anyone authenticated can view published lectures" ON public.lectures;
DROP POLICY IF EXISTS "Admins can manage lectures" ON public.lectures;
DROP POLICY IF EXISTS "NUSC users read published lectures" ON public.lectures;
DROP POLICY IF EXISTS "NUSC content managers manage lectures" ON public.lectures;

DROP POLICY IF EXISTS "Anyone authenticated can view published materials" ON public.materials;
DROP POLICY IF EXISTS "Admins can manage materials" ON public.materials;
DROP POLICY IF EXISTS "NUSC users read published materials" ON public.materials;
DROP POLICY IF EXISTS "NUSC content managers manage materials" ON public.materials;

CREATE POLICY "NUSC users read available subjects"
  ON public.subjects FOR SELECT TO authenticated
  USING (
    COALESCE(to_jsonb(subjects)->>'is_published',
             to_jsonb(subjects)->>'is_active', 'true') <> 'false'
    OR private.is_content_manager()
  );

CREATE POLICY "NUSC content managers manage subjects"
  ON public.subjects FOR ALL TO authenticated
  USING (private.is_content_manager())
  WITH CHECK (private.is_content_manager());

CREATE POLICY "NUSC users read published lectures"
  ON public.lectures FOR SELECT TO authenticated
  USING (
    COALESCE(to_jsonb(lectures)->>'is_published',
             to_jsonb(lectures)->>'is_active', 'true') <> 'false'
    OR private.is_content_manager()
  );

CREATE POLICY "NUSC content managers manage lectures"
  ON public.lectures FOR ALL TO authenticated
  USING (private.is_content_manager())
  WITH CHECK (private.is_content_manager());

CREATE POLICY "NUSC users read published materials"
  ON public.materials FOR SELECT TO authenticated
  USING (
    COALESCE(to_jsonb(materials)->>'is_published', 'true') <> 'false'
    OR private.is_content_manager()
  );

CREATE POLICY "NUSC content managers manage materials"
  ON public.materials FOR ALL TO authenticated
  USING (private.is_content_manager())
  WITH CHECK (private.is_content_manager());

-- Authenticated students may create signed download links only for published materials.
DROP POLICY IF EXISTS "NUSC users read published subject files" ON storage.objects;
CREATE POLICY "NUSC users read published subject files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'materials'
    AND (
      private.is_content_manager()
      OR EXISTS (
        SELECT 1
        FROM public.materials m
        WHERE m.file_path = name
          AND COALESCE(to_jsonb(m)->>'is_published', 'true') <> 'false'
      )
    )
  );

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
