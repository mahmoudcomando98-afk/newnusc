-- Optional short note shown to students under a material title
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

COMMENT ON COLUMN public.materials.admin_note IS 'Short admin note visible to students, e.g. important for exam';
