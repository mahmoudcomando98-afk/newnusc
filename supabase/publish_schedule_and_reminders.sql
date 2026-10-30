-- NUSC: مسودة / جدولة النشر + تذكير مواعيد التسليم + إحصائيات التحميل
-- نفّذ الملف ده مرة واحدة من Supabase SQL Editor

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS reminder_sent_24h BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_sent_3h BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS materials_publish_at_idx
  ON public.materials (publish_at)
  WHERE publish_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS announcements_publish_at_idx
  ON public.announcements (publish_at)
  WHERE publish_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS materials_due_reminder_idx
  ON public.materials (due_at)
  WHERE material_type = 'assignment' AND due_at IS NOT NULL;

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.increment_material_download(p_material_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.materials
  SET download_count = COALESCE(download_count, 0) + 1
  WHERE id = p_material_id
    AND COALESCE(is_published, true) = true;
END;
$$;

-- Alias used by subject-details.js
CREATE OR REPLACE FUNCTION public.increment_download_count(p_material_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.increment_material_download(p_material_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_material_download(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_download_count(UUID) TO authenticated;

COMMENT ON COLUMN public.materials.publish_at IS 'Scheduled visibility for students when is_published=true';
COMMENT ON COLUMN public.announcements.publish_at IS 'Scheduled visibility for announcements';
