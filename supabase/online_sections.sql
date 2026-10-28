-- جدول السكاشن الأونلاين
CREATE TABLE IF NOT EXISTS public.online_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME,
  course_name TEXT NOT NULL,
  instructor TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS online_sections_day_idx
  ON public.online_sections (day_of_week, start_time);

ALTER TABLE public.online_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS online_sections_public_read ON public.online_sections;
CREATE POLICY online_sections_public_read ON public.online_sections
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS online_sections_admin_all ON public.online_sections;
CREATE POLICY online_sections_admin_all ON public.online_sections
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  );
