-- معاد تسليم الواجب على جدول materials
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

COMMENT ON COLUMN public.materials.due_at IS 'Assignment deadline shown to students';

CREATE INDEX IF NOT EXISTS idx_materials_due_at ON public.materials (due_at)
  WHERE due_at IS NOT NULL;
