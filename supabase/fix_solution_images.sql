-- ============================================================
-- NUSC Student Hub - Solution images for assignments & quizzes
-- Run this once in Supabase SQL Editor (safe, additive only).
-- ============================================================

BEGIN;

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS solution_image_path TEXT;

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS solution_image_path TEXT;

COMMENT ON COLUMN public.materials.solution_image_path IS 'Storage path of assignment solution image (optional)';
COMMENT ON COLUMN public.quizzes.solution_image_path IS 'Storage path of quiz solution image (optional)';

COMMIT;
