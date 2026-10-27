-- Fix: materials_material_type_check must allow past_exam
-- Run in Supabase SQL Editor

ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_material_type_check;

ALTER TABLE public.materials
  ADD CONSTRAINT materials_material_type_check
  CHECK (
    material_type IS NULL
    OR material_type IN (
      'lecture',
      'section',
      'assignment',
      'past_exam',
      'notes',
      'exam',
      'other',
      'pdf',
      'slides'
    )
  );
