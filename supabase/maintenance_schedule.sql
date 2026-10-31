-- صيانة مجدولة + الأدمن يفضل فاتح المنصة
-- نفّذ في Supabase → SQL Editor

BEGIN;

INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('maintenance_start_at', 'null'::jsonb, 'بداية نافذة الصيانة (ISO UTC)'),
  ('maintenance_end_at', 'null'::jsonb, 'نهاية نافذة الصيانة (ISO UTC)')
ON CONFLICT (key) DO NOTHING;

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

-- هل نافذة الصيانة شغّالة دلوقتي؟
CREATE OR REPLACE FUNCTION private.is_maintenance_active()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $maint_active$
DECLARE
  flag_raw TEXT;
  start_raw TEXT;
  end_raw TEXT;
  start_ts TIMESTAMPTZ;
  end_ts TIMESTAMPTZ;
BEGIN
  SELECT lower(trim(both '"' from coalesce(value::text, 'false')))
    INTO flag_raw
  FROM public.platform_settings
  WHERE key = 'site_maintenance';

  IF flag_raw IN ('true', '1') THEN
    RETURN true;
  END IF;

  SELECT trim(both '"' from coalesce(value::text, ''))
    INTO start_raw
  FROM public.platform_settings
  WHERE key = 'maintenance_start_at';

  SELECT trim(both '"' from coalesce(value::text, ''))
    INTO end_raw
  FROM public.platform_settings
  WHERE key = 'maintenance_end_at';

  IF start_raw IS NULL OR start_raw = '' OR start_raw = 'null' THEN
    start_ts := NULL;
  ELSE
    BEGIN
      start_ts := start_raw::timestamptz;
    EXCEPTION WHEN others THEN
      start_ts := NULL;
    END;
  END IF;

  IF end_raw IS NULL OR end_raw = '' OR end_raw = 'null' THEN
    end_ts := NULL;
  ELSE
    BEGIN
      end_ts := end_raw::timestamptz;
    EXCEPTION WHEN others THEN
      end_ts := NULL;
    END;
  END IF;

  -- مفيش جدول → مش صيانة
  IF start_ts IS NULL AND end_ts IS NULL THEN
    RETURN false;
  END IF;

  -- من وقت البداية لحد النهاية
  IF start_ts IS NOT NULL AND end_ts IS NOT NULL THEN
    RETURN now() >= start_ts AND now() <= end_ts;
  END IF;

  IF start_ts IS NOT NULL THEN
    RETURN now() >= start_ts;
  END IF;

  -- نهاية فقط
  RETURN now() <= end_ts;
END;
$maint_active$;

CREATE OR REPLACE FUNCTION private.is_platform_open_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $open_or_admin$
  SELECT public.is_admin() OR NOT private.is_maintenance_active();
$open_or_admin$;

GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_maintenance_active() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_platform_open_or_admin() TO anon, authenticated;

-- السماح بقراءة مفاتيح الجدولة للجميع (صفحة الصيانة + الفرونت)
DROP POLICY IF EXISTS "Public maintenance notice settings" ON public.platform_settings;
CREATE POLICY "Public maintenance notice settings"
  ON public.platform_settings FOR SELECT TO anon
  USING (
    key IN (
      'site_maintenance',
      'maintenance_message',
      'site_name',
      'maintenance_start_at',
      'maintenance_end_at'
    )
  );

DROP POLICY IF EXISTS "Maintenance settings read gate" ON public.platform_settings;
CREATE POLICY "Maintenance settings read gate"
  ON public.platform_settings AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (
    key IN (
      'site_maintenance',
      'maintenance_message',
      'site_name',
      'maintenance_start_at',
      'maintenance_end_at'
    )
    OR private.is_platform_open_or_admin()
  );

-- RPC محدّث: فوري + جدول
CREATE OR REPLACE FUNCTION public.set_maintenance_mode(
  p_enabled BOOLEAN,
  p_message TEXT DEFAULT 'المنصة تحت الصيانة حاليًا. هنرجع قريبًا.',
  p_start_at TIMESTAMPTZ DEFAULT NULL,
  p_end_at TIMESTAMPTZ DEFAULT NULL
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

  IF p_start_at IS NOT NULL AND p_end_at IS NOT NULL AND p_end_at < p_start_at THEN
    RAISE EXCEPTION 'maintenance_end_at must be after maintenance_start_at'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.platform_settings (key, value, description)
  VALUES
    ('site_maintenance', to_jsonb(COALESCE(p_enabled, false)), 'تشغيل وضع الصيانة الفوري'),
    ('maintenance_message', to_jsonb(clean_message), 'رسالة وضع الصيانة'),
    (
      'maintenance_start_at',
      CASE WHEN p_start_at IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_start_at) END,
      'بداية نافذة الصيانة'
    ),
    (
      'maintenance_end_at',
      CASE WHEN p_end_at IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_end_at) END,
      'نهاية نافذة الصيانة'
    )
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        description = EXCLUDED.description;

  RETURN jsonb_build_object(
    'enabled', COALESCE(p_enabled, false),
    'message', clean_message,
    'start_at', p_start_at,
    'end_at', p_end_at,
    'active_now', private.is_maintenance_active()
  );
END;
$set_maintenance$;

-- دعم التوقيع القديم (بدون جدول) لو اتنده من كود قديم
CREATE OR REPLACE FUNCTION public.set_maintenance_mode(
  p_enabled BOOLEAN,
  p_message TEXT DEFAULT 'المنصة تحت الصيانة حاليًا. هنرجع قريبًا.'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $set_maintenance_legacy$
BEGIN
  RETURN public.set_maintenance_mode(p_enabled, p_message, NULL::timestamptz, NULL::timestamptz);
END;
$set_maintenance_legacy$;

REVOKE ALL ON FUNCTION public.set_maintenance_mode(BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_maintenance_mode(BOOLEAN, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_maintenance_mode(BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_maintenance_mode(BOOLEAN, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

COMMIT;
