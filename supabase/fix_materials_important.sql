-- Optional: mark materials as important
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS is_important BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.materials.is_important IS 'Show مهم badge to students';
