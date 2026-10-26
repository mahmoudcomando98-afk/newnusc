-- موعد تسليم الواجب على جدول materials
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

COMMENT ON COLUMN public.materials.due_at IS 'Assignment due datetime shown to students';
