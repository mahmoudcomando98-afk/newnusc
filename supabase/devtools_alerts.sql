-- سجل محاولات فتح أدوات المطوّر (تنبيه للأدمن)
-- نفّذ في Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS public.devtools_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email TEXT,
  full_name TEXT,
  reason TEXT,
  page_path TEXT,
  user_agent TEXT,
  attempt_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS devtools_alerts_created_idx
  ON public.devtools_alerts (created_at DESC);

ALTER TABLE public.devtools_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS devtools_alerts_insert_auth ON public.devtools_alerts;
CREATE POLICY devtools_alerts_insert_auth ON public.devtools_alerts
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS devtools_alerts_admin_select ON public.devtools_alerts;
CREATE POLICY devtools_alerts_admin_select ON public.devtools_alerts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.role, '') IN ('admin', 'moderator')
        AND COALESCE(p.is_active, true) = true
    )
  );

DROP POLICY IF EXISTS devtools_alerts_admin_delete ON public.devtools_alerts;
CREATE POLICY devtools_alerts_admin_delete ON public.devtools_alerts
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.role, '') IN ('admin', 'moderator')
        AND COALESCE(p.is_active, true) = true
    )
  );

GRANT SELECT, INSERT, DELETE ON public.devtools_alerts TO authenticated;
