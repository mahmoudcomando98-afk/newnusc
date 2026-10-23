-- NUSC maintenance lockdown
-- Run once in Supabase SQL Editor after the base schema/policies are installed.
-- During maintenance, only an active admin can use app data. The public can read
-- only the small set of settings needed to display the maintenance notice.

BEGIN;

-- Define the admin checker here as well; some existing projects do not have
-- this helper installed yet. Only active profiles with role='admin' qualify.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $is_admin$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$is_admin$;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_platform_open_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $maintenance_access$
  SELECT public.is_admin()
    OR NOT EXISTS (
      SELECT 1
      FROM public.platform_settings
      WHERE key = 'site_maintenance'
        AND lower(trim(both '"' from value::text)) IN ('true', '1')
    );
$maintenance_access$;

GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_platform_open_or_admin() TO anon, authenticated;

-- A restrictive policy is combined with existing RLS policies using AND,
-- so existing "published content" policies cannot bypass the maintenance lock.
DO $maintenance_policy$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles', 'subjects', 'lectures', 'materials', 'quizzes', 'quiz_rules',
    'schedules', 'announcements', 'notifications', 'notification_reads',
    'favorites', 'faq', 'reports', 'audit_logs'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
        'Maintenance access gate', table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (private.is_platform_open_or_admin()) WITH CHECK (private.is_platform_open_or_admin())',
        'Maintenance access gate', table_name
      );
    END IF;
  END LOOP;
END
$maintenance_policy$;

-- The notice itself must remain readable during maintenance, including by
-- logged-out visitors. All other settings remain subject to the normal rules.
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.platform_settings TO anon, authenticated;

DROP POLICY IF EXISTS "Public maintenance notice settings" ON public.platform_settings;
CREATE POLICY "Public maintenance notice settings"
  ON public.platform_settings FOR SELECT TO anon
  USING (key IN ('site_maintenance', 'maintenance_message', 'site_name'));

DROP POLICY IF EXISTS "Maintenance settings read gate" ON public.platform_settings;
CREATE POLICY "Maintenance settings read gate"
  ON public.platform_settings AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (
    key IN ('site_maintenance', 'maintenance_message', 'site_name')
    OR private.is_platform_open_or_admin()
  );

DROP POLICY IF EXISTS "Maintenance settings insert gate" ON public.platform_settings;
CREATE POLICY "Maintenance settings insert gate"
  ON public.platform_settings AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (private.is_platform_open_or_admin());

DROP POLICY IF EXISTS "Maintenance settings update gate" ON public.platform_settings;
CREATE POLICY "Maintenance settings update gate"
  ON public.platform_settings AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (private.is_platform_open_or_admin())
  WITH CHECK (private.is_platform_open_or_admin());

DROP POLICY IF EXISTS "Maintenance settings delete gate" ON public.platform_settings;
CREATE POLICY "Maintenance settings delete gate"
  ON public.platform_settings AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (private.is_platform_open_or_admin());

-- Private material objects are blocked through the Storage API while maintenance
-- is on. (Supabase public-bucket URLs remain public by design.)
DO $storage_policy$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Maintenance access gate" ON storage.objects';
    EXECUTE 'CREATE POLICY "Maintenance access gate" ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated USING (private.is_platform_open_or_admin()) WITH CHECK (private.is_platform_open_or_admin())';
  END IF;
END
$storage_policy$;

-- Security-definer RPCs must enforce maintenance themselves because they may
-- run with table-owner privileges and otherwise bypass table RLS. These use
-- PL/pgSQL + dynamic SQL so a partially-installed optional table such as
-- notification_reads does not make this migration fail at CREATE FUNCTION time.

CREATE OR REPLACE FUNCTION public.get_unread_notifications_count(p_user_id UUID DEFAULT auth.uid())
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, private
AS $unread_count$
DECLARE
  unread_count INTEGER := 0;
BEGIN
  IF NOT private.is_platform_open_or_admin() THEN
    RETURN 0;
  END IF;
  IF to_regclass('public.notifications') IS NULL
     OR to_regclass('public.notification_reads') IS NULL THEN
    RETURN 0;
  END IF;

  EXECUTE $query$
    SELECT COUNT(*)::INTEGER
    FROM public.notifications n
    WHERE (
      n.user_id = $1
      OR COALESCE(to_jsonb(n)->>'is_global', 'false') = 'true'
      OR ((to_jsonb(n)->>'is_global') IS NULL AND n.user_id IS NULL)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.notification_reads nr
      WHERE nr.notification_id = n.id AND nr.user_id = $1
    )
  $query$ INTO unread_count USING p_user_id;

  RETURN COALESCE(unread_count, 0);
END;
$unread_count$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $mark_read$
BEGIN
  IF NOT private.is_platform_open_or_admin()
     OR to_regclass('public.notifications') IS NULL
     OR to_regclass('public.notification_reads') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $query$
    INSERT INTO public.notification_reads (notification_id, user_id)
    VALUES ($1, $2)
    ON CONFLICT (notification_id, user_id) DO NOTHING
  $query$ USING p_notification_id, auth.uid();
END;
$mark_read$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $mark_all_read$
BEGIN
  IF NOT private.is_platform_open_or_admin()
     OR to_regclass('public.notifications') IS NULL
     OR to_regclass('public.notification_reads') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $query$
    INSERT INTO public.notification_reads (notification_id, user_id)
    SELECT n.id, $1
    FROM public.notifications n
    WHERE (n.user_id = $1
      OR COALESCE(to_jsonb(n)->>'is_global', 'false') = 'true'
      OR ((to_jsonb(n)->>'is_global') IS NULL AND n.user_id IS NULL))
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_reads nr
        WHERE nr.notification_id = n.id AND nr.user_id = $1
      )
    ON CONFLICT (notification_id, user_id) DO NOTHING
  $query$ USING auth.uid();
END;
$mark_all_read$;

CREATE OR REPLACE FUNCTION public.increment_download_count(p_material_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $download_count$
BEGIN
  IF NOT private.is_platform_open_or_admin()
     OR to_regclass('public.materials') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'UPDATE public.materials SET download_count = download_count + 1 WHERE id = $1 AND is_published = true'
    USING p_material_id;
END;
$download_count$;

CREATE OR REPLACE FUNCTION public.increment_view_count(p_material_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $view_count$
BEGIN
  IF NOT private.is_platform_open_or_admin()
     OR to_regclass('public.materials') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'UPDATE public.materials SET view_count = view_count + 1 WHERE id = $1 AND is_published = true'
    USING p_material_id;
END;
$view_count$;

CREATE OR REPLACE FUNCTION public.search_content(
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  result_type TEXT,
  result_id UUID,
  title TEXT,
  description TEXT,
  subject_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, private
AS $search_content$
BEGIN
  IF NOT private.is_platform_open_or_admin() THEN
    RETURN;
  END IF;

  IF to_regclass('public.subjects') IS NULL
     OR to_regclass('public.lectures') IS NULL
     OR to_regclass('public.materials') IS NULL
     OR to_regclass('public.announcements') IS NULL
     OR to_regclass('public.quizzes') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE $query$
    (
      SELECT 'subject'::TEXT, s.id, s.name, s.description, NULL::TEXT, s.created_at
      FROM public.subjects s
      WHERE s.is_published = true
        AND (s.name ILIKE '%' || $1 || '%' OR s.code ILIKE '%' || $1 || '%' OR s.description ILIKE '%' || $1 || '%')
      LIMIT $2
    )
    UNION ALL
    (
      SELECT 'lecture'::TEXT, l.id, l.title, l.description, s.name, l.created_at
      FROM public.lectures l
      JOIN public.subjects s ON s.id = l.subject_id
      WHERE l.is_published = true AND s.is_published = true
        AND (l.title ILIKE '%' || $1 || '%' OR l.description ILIKE '%' || $1 || '%')
      LIMIT $2
    )
    UNION ALL
    (
      SELECT 'material'::TEXT, m.id, m.title, m.description, s.name, m.created_at
      FROM public.materials m
      LEFT JOIN public.subjects s ON s.id = m.subject_id
      WHERE m.is_published = true
        AND (m.title ILIKE '%' || $1 || '%' OR m.description ILIKE '%' || $1 || '%' OR m.file_name ILIKE '%' || $1 || '%')
      LIMIT $2
    )
    UNION ALL
    (
      SELECT 'announcement'::TEXT, a.id, a.title, LEFT(a.content, 200), s.name, a.created_at
      FROM public.announcements a
      LEFT JOIN public.subjects s ON s.id = a.subject_id
      WHERE a.is_published = true AND (a.expires_at IS NULL OR a.expires_at > NOW())
        AND (a.title ILIKE '%' || $1 || '%' OR a.content ILIKE '%' || $1 || '%')
      LIMIT $2
    )
    UNION ALL
    (
      SELECT 'quiz'::TEXT, q.id, q.title, q.description, s.name, q.created_at
      FROM public.quizzes q
      LEFT JOIN public.subjects s ON s.id = q.subject_id
      WHERE q.is_published = true
        AND (q.title ILIKE '%' || $1 || '%' OR q.topics ILIKE '%' || $1 || '%')
      LIMIT $2
    )
  $query$ USING p_query, LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
END;
$search_content$;


-- Reliable maintenance toggle: update settings through a narrowly-scoped
-- SECURITY DEFINER RPC so RLS policies cannot accidentally block the admin.
CREATE OR REPLACE FUNCTION public.set_maintenance_mode(
  p_enabled BOOLEAN,
  p_message TEXT DEFAULT 'المنصة تحت الصيانة حاليًا. هنرجع قريبًا.'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $set_maintenance$
DECLARE
  actor UUID := auth.uid();
  clean_message TEXT := COALESCE(NULLIF(trim(p_message), ''), 'المنصة تحت الصيانة حاليًا. هنرجع قريبًا.');
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = actor AND role = 'admin' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Only an active administrator can change maintenance mode'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.platform_settings (key, value, description)
  VALUES
    ('site_maintenance', to_jsonb(COALESCE(p_enabled, false)), 'تشغيل وضع الصيانة'),
    ('maintenance_message', to_jsonb(clean_message), 'رسالة وضع الصيانة')
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        description = EXCLUDED.description;

  RETURN jsonb_build_object(
    'enabled', COALESCE(p_enabled, false),
    'message', clean_message
  );
END;
$set_maintenance$;

REVOKE ALL ON FUNCTION public.set_maintenance_mode(BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_maintenance_mode(BOOLEAN, TEXT) TO authenticated;

COMMIT;
