-- رابط تسليم الواجب (Google Form / Drive / أي رابط)
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS submission_url TEXT;

COMMENT ON COLUMN public.materials.submission_url IS 'Optional external submission link for assignments';
