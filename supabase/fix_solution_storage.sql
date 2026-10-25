-- Fix: students can view solution images in materials bucket
-- Run in Supabase SQL Editor

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS solution_image_path TEXT;

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS solution_image_path TEXT;

-- Storage: authenticated users can read materials (includes solution images)
DROP POLICY IF EXISTS "Authenticated users can read materials" ON storage.objects;
CREATE POLICY "Authenticated users can read materials"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'materials');

-- Keep admin upload policies (recreate if missing)
DROP POLICY IF EXISTS "Admins can upload materials" ON storage.objects;
CREATE POLICY "Admins can upload materials"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'materials'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'moderator')
        AND COALESCE(p.is_active, true) = true
    )
  );

DROP POLICY IF EXISTS "Admins can update materials" ON storage.objects;
CREATE POLICY "Admins can update materials"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'materials'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'moderator')
        AND COALESCE(p.is_active, true) = true
    )
  );
