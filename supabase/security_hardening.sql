-- ============================================================
-- NUSC Student Hub - Post-lockdown security hardening
-- Run AFTER maintenance_lockdown.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $mark_read$
DECLARE
  caller_id UUID := auth.uid();
  can_read_notification BOOLEAN := false;
BEGIN
  IF caller_id IS NULL OR NOT private.is_platform_open_or_admin() THEN
    RETURN;
  END IF;

  IF to_regclass('public.notifications') IS NULL
     OR to_regclass('public.notification_reads') IS NULL THEN
    RETURN;
  END IF;

  -- Non-admin users may only mark their own or global notifications as read.
  IF NOT public.is_admin() THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.id = $1
          AND (
            n.user_id = $2
            OR COALESCE(to_jsonb(n)->>'is_global', 'false') = 'true'
            OR ((to_jsonb(n)->>'is_global') IS NULL AND n.user_id IS NULL)
          )
      )
    $query$ INTO can_read_notification USING p_notification_id, caller_id;

    IF NOT can_read_notification THEN
      RETURN;
    END IF;
  END IF;

  EXECUTE $query$
    INSERT INTO public.notification_reads (notification_id, user_id)
    VALUES ($1, $2)
    ON CONFLICT (notification_id, user_id) DO NOTHING
  $query$ USING p_notification_id, caller_id;
END;
$mark_read$;

CREATE OR REPLACE FUNCTION public.get_unread_notifications_count(p_user_id UUID DEFAULT auth.uid())
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, private
AS $unread_count$
DECLARE
  effective_user_id UUID;
  unread_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_platform_open_or_admin() THEN
    RETURN 0;
  END IF;

  effective_user_id := CASE
    WHEN public.is_admin() THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;

  SELECT COUNT(*)::INTEGER
  INTO unread_count
  FROM public.notifications n
  WHERE (
    n.user_id = effective_user_id
    OR COALESCE(to_jsonb(n)->>'is_global', 'false') = 'true'
    OR ((to_jsonb(n)->>'is_global') IS NULL AND n.user_id IS NULL)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.notification_reads nr
    WHERE nr.notification_id = n.id
      AND nr.user_id = effective_user_id
  );

  RETURN COALESCE(unread_count, 0);
END;
$unread_count$;

-- Admin helper functions return only the current caller's authorization state.
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_or_moderator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_moderator() TO authenticated, service_role;

-- Allow the public login/register pages to load only non-sensitive branding.
-- The restrictive maintenance policy still hides the logo while maintenance is on.
GRANT SELECT ON public.platform_settings TO anon, authenticated;
DROP POLICY IF EXISTS "Public branding settings" ON public.platform_settings;
CREATE POLICY "Public branding settings"
  ON public.platform_settings FOR SELECT TO anon
  USING (key IN ('site_name', 'platform_logo_url'));

-- SECURITY DEFINER RPCs must not be callable by anonymous/public clients.
REVOKE ALL ON FUNCTION public.get_unread_notifications_count(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_notification_read(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_download_count(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_view_count(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_content(TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_maintenance_mode(BOOLEAN, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_unread_notifications_count(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_download_count(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_view_count(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_content(TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_maintenance_mode(BOOLEAN, TEXT) TO authenticated;
