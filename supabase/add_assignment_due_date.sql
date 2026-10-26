-- NUSC: add an optional assignment deadline to existing materials.
-- Safe to run more than once. Existing records remain unchanged.
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

COMMENT ON COLUMN public.materials.due_at IS
  'Optional deadline for materials of type assignment';
