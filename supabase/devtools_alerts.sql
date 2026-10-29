-- سجل محاولات فتح أدوات المطوّر (تنبيه للأدمن)
-- نفّذ كامل في Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS public.devtools_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT,
  full_name TEXT,
  reason TEXT,
  page_path TEXT,
  user_agent TEXT,
  attempt_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- لو الجدول اتعمل قبل كده بـ FK يسبب فشل الإدراج، شيل القيد
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'devtools_alerts'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.devtools_alerts DROP CONSTRAINT IF EXISTS devtools_alerts_user_id_fkey;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS devtools_alerts_created_idx
  ON public.devtools_alerts (created_at DESC);

ALTER TABLE public.devtools_alerts ENABLE ROW LEVEL SECURITY;

-- دالة أدمن بدون recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.role, '') IN ('admin', 'moderator')
      AND COALESCE(p.is_active, true) = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS devtools_alerts_insert_auth ON public.devtools_alerts;
DROP POLICY IF EXISTS devtools_alerts_admin_select ON public.devtools_alerts;
DROP POLICY IF EXISTS devtools_alerts_admin_delete ON public.devtools_alerts;
DROP POLICY IF EXISTS devtools_alerts_select ON public.devtools_alerts;
DROP POLICY IF EXISTS devtools_alerts_delete ON public.devtools_alerts;

CREATE POLICY devtools_alerts_insert_auth ON public.devtools_alerts
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY devtools_alerts_admin_select ON public.devtools_alerts
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY devtools_alerts_admin_delete ON public.devtools_alerts
  FOR DELETE TO authenticated
  USING (public.is_admin());

GRANT SELECT, INSERT, DELETE ON public.devtools_alerts TO authenticated;
