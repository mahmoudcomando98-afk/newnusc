-- جدول امتحانات الميد تيرم
CREATE TABLE IF NOT EXISTS public.midterm_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  subject_name TEXT NOT NULL,
  location TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS midterm_exams_date_idx
  ON public.midterm_exams (exam_date, start_time);

CREATE TABLE IF NOT EXISTS public.midterm_schedule_meta (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  title TEXT NOT NULL DEFAULT 'جدول الميد تيرم',
  subtitle TEXT DEFAULT 'مواعيد امتحانات منتصف الترم',
  note TEXT,
  footer_note TEXT DEFAULT 'الأوقات بتوقيت القاهرة',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.midterm_schedule_meta (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.midterm_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_schedule_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS midterm_exams_read ON public.midterm_exams;
CREATE POLICY midterm_exams_read ON public.midterm_exams
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS midterm_exams_admin ON public.midterm_exams;
CREATE POLICY midterm_exams_admin ON public.midterm_exams
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

DROP POLICY IF EXISTS midterm_meta_read ON public.midterm_schedule_meta;
CREATE POLICY midterm_meta_read ON public.midterm_schedule_meta
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS midterm_meta_admin ON public.midterm_schedule_meta;
CREATE POLICY midterm_meta_admin ON public.midterm_schedule_meta
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

GRANT SELECT ON public.midterm_exams TO authenticated;
GRANT ALL ON public.midterm_exams TO authenticated;
GRANT SELECT ON public.midterm_schedule_meta TO authenticated;
GRANT ALL ON public.midterm_schedule_meta TO authenticated;
