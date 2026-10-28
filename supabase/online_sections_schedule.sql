-- جدول السكاشن الأونلاين
CREATE TABLE IF NOT EXISTS public.online_section_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME,
  course_name TEXT NOT NULL,
  instructor_name TEXT,
  link_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS online_section_sessions_day_idx
  ON public.online_section_sessions (day_of_week, start_time);

CREATE TABLE IF NOT EXISTS public.online_schedule_meta (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  title TEXT NOT NULL DEFAULT 'جدول الأونلاين',
  subtitle TEXT DEFAULT 'سنة أولى',
  note TEXT DEFAULT 'كل مقرر سكشن أونلاين بلينك ومعيد مختلف.',
  footer_note TEXT DEFAULT 'الأوقات بتوقيت القاهرة',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.online_schedule_meta (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.online_section_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_schedule_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS online_sessions_read ON public.online_section_sessions;
CREATE POLICY online_sessions_read ON public.online_section_sessions
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS online_sessions_admin ON public.online_section_sessions;
CREATE POLICY online_sessions_admin ON public.online_section_sessions
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

DROP POLICY IF EXISTS online_meta_read ON public.online_schedule_meta;
CREATE POLICY online_meta_read ON public.online_schedule_meta
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS online_meta_admin ON public.online_schedule_meta;
CREATE POLICY online_meta_admin ON public.online_schedule_meta
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
