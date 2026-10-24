-- ============================================================
-- NUSC Student Hub - Post-lockdown security hardening
-- Run AFTER maintenance_lockdown.sql.
-- ============================================================

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
