-- Pin materials so they stay at the top of subject lists
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS materials_subject_pinned_idx
  ON public.materials (subject_id, is_pinned DESC, created_at DESC);
