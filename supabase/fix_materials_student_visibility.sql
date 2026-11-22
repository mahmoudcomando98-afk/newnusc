-- =============================================================================
-- Fix: materials not visible to most students
-- Cause: is_active_user() was false when profile row missing → RLS blocked SELECT
-- Run once in Supabase SQL Editor
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT COALESCE(p.is_active, true)
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    ),
    true
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

UPDATE public.materials
SET is_published = true
WHERE is_published IS NULL;

UPDATE public.materials
SET is_active = true
WHERE is_active IS NULL;

DROP POLICY IF EXISTS materials_select_published ON public.materials;
DROP POLICY IF EXISTS materials_select_authenticated ON public.materials;

CREATE POLICY materials_select_published ON public.materials
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_active_user()
      AND COALESCE(is_published, true) = true
      AND (publish_at IS NULL OR publish_at <= now())
      AND COALESCE(is_active, true) = true
    )
  );

DROP POLICY IF EXISTS materials_admin_write ON public.materials;
CREATE POLICY materials_admin_write ON public.materials
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read materials" ON storage.objects;
CREATE POLICY "Authenticated users can read materials"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'materials'
    AND public.is_active_user()
  );
