-- =============================================================================
-- NUSC Security Hardening (complete package)
-- Run ONCE in Supabase → SQL Editor (as project owner)
-- Safe to re-run: uses IF EXISTS / OR REPLACE / DROP POLICY IF EXISTS
-- =============================================================================

-- ---------- 1) Admin helpers (SECURITY DEFINER — no RLS recursion) ----------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND COALESCE(is_active, true) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_moderator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'moderator')
      AND COALESCE(is_active, true) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND COALESCE(is_active, true) = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_or_moderator() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_moderator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;

-- ---------- 2) Ban column + privilege escalation guard ----------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

UPDATE public.profiles SET is_active = true WHERE is_active IS NULL;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'غير مسموح بتغيير الصلاحيات أو حالة الحساب.'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.role = 'admin' AND COALESCE(OLD.is_active, true)
     AND (NEW.role IS DISTINCT FROM 'admin' OR COALESCE(NEW.is_active, true) = false)
     AND public.is_admin() THEN
    IF (
      SELECT COUNT(*) FROM public.profiles
      WHERE role = 'admin' AND COALESCE(is_active, true) = true AND id IS DISTINCT FROM OLD.id
    ) < 1 THEN
      RAISE EXCEPTION 'لا يمكن تعطيل أو تخفيض آخر أدمن نشط.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileges ON public.profiles;
CREATE TRIGGER protect_profile_privileges
  BEFORE UPDATE OF role, is_active ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- ---------- 3) Profiles RLS (no recursion — uses is_admin()) ----------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- ---------- 4) Audit log ----------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON public.audit_logs (actor_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_admin_select" ON public.audit_logs;
CREATE POLICY "audit_admin_select" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_action TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL,
  p_meta JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول';
  END IF;
  IF p_action IS NULL OR length(trim(p_action)) < 2 THEN
    RAISE EXCEPTION 'action مطلوب';
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, meta)
  VALUES (
    auth.uid(),
    left(trim(p_action), 120),
    left(coalesce(p_entity_type, ''), 80),
    left(coalesce(p_entity_id, ''), 80),
    coalesce(p_meta, '{}'::jsonb)
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit_log(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_audit_log(TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

-- ---------- 5) Rate limit ----------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket TEXT NOT NULL,
  actor_id UUID NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('minute', now()),
  hit_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, actor_id, window_start)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket TEXT,
  p_max_per_minute INTEGER DEFAULT 20
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  w TIMESTAMPTZ := date_trunc('minute', now());
  c INTEGER;
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO public.rate_limits (bucket, actor_id, window_start, hit_count)
  VALUES (p_bucket, uid, w, 1)
  ON CONFLICT (bucket, actor_id, window_start)
  DO UPDATE SET hit_count = public.rate_limits.hit_count + 1
  RETURNING hit_count INTO c;
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '10 minutes';
  RETURN c <= greatest(p_max_per_minute, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER) TO authenticated;

-- ---------- 6) Enable RLS on core tables ----------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'subjects','materials','lectures','announcements','quizzes',
    'schedule_entries','online_sections','platform_settings',
    'notifications','push_subscriptions','favorites',
    'store_products','store_orders'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "subjects_select_published" ON public.subjects;
DROP POLICY IF EXISTS "subjects_admin_write" ON public.subjects;
DROP POLICY IF EXISTS "subjects_admin_all" ON public.subjects;
DROP POLICY IF EXISTS "Students can view subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins manage subjects" ON public.subjects;
CREATE POLICY "subjects_select_published" ON public.subjects
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      COALESCE(is_active, true) = true
      AND COALESCE(is_published, true) = true
      AND public.is_active_user()
    )
  );
CREATE POLICY "subjects_admin_write" ON public.subjects
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "materials_select_published" ON public.materials;
DROP POLICY IF EXISTS "materials_admin_write" ON public.materials;
CREATE POLICY "materials_select_published" ON public.materials
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_active_user()
      AND COALESCE(is_published, true) = true
      AND (publish_at IS NULL OR publish_at <= now())
    )
  );
CREATE POLICY "materials_admin_write" ON public.materials
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "announcements_select_published" ON public.announcements;
DROP POLICY IF EXISTS "announcements_admin_write" ON public.announcements;
CREATE POLICY "announcements_select_published" ON public.announcements
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_active_user()
      AND COALESCE(is_published, true) = true
      AND (publish_at IS NULL OR publish_at <= now())
      AND (expires_at IS NULL OR expires_at > now())
    )
  );
CREATE POLICY "announcements_admin_write" ON public.announcements
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "lectures_select" ON public.lectures;
DROP POLICY IF EXISTS "lectures_admin_write" ON public.lectures;
CREATE POLICY "lectures_select" ON public.lectures
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_active_user()
      AND COALESCE(is_published, true) = true
      AND COALESCE(is_active, true) = true
    )
  );
CREATE POLICY "lectures_admin_write" ON public.lectures
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "favorites_own" ON public.favorites;
CREATE POLICY "favorites_own" ON public.favorites
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_active_user())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "push_own" ON public.push_subscriptions;
CREATE POLICY "push_own" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_delete" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "notifications_admin_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "notifications_admin_delete" ON public.notifications
  FOR DELETE TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "platform_settings_select" ON public.platform_settings;
DROP POLICY IF EXISTS "platform_settings_admin" ON public.platform_settings;
CREATE POLICY "platform_settings_select" ON public.platform_settings
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "platform_settings_admin" ON public.platform_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------- 7) Storage materials not public ----------
UPDATE storage.buckets SET public = false WHERE id = 'materials';

DROP POLICY IF EXISTS "Authenticated users can read materials" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload materials" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update materials" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete materials" ON storage.objects;

CREATE POLICY "Authenticated users can read materials"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'materials' AND public.is_active_user());

CREATE POLICY "Admins can upload materials"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'materials' AND public.is_admin());

CREATE POLICY "Admins can update materials"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'materials' AND public.is_admin());

CREATE POLICY "Admins can delete materials"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'materials' AND public.is_admin());

-- ---------- 8) Admin ban/unban RPC ----------
CREATE OR REPLACE FUNCTION public.admin_set_user_active(
  p_user_id UUID,
  p_active BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'أدمن فقط' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() AND p_active = false THEN
    RAISE EXCEPTION 'لا يمكن تعطيل حسابك بنفسك';
  END IF;
  UPDATE public.profiles SET is_active = p_active WHERE id = p_user_id;
  PERFORM public.write_audit_log(
    CASE WHEN p_active THEN 'unban_user' ELSE 'ban_user' END,
    'profile',
    p_user_id::text,
    jsonb_build_object('active', p_active)
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_active(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(UUID, BOOLEAN) TO authenticated;

SELECT 'NUSC security_hardening_complete applied' AS status;
