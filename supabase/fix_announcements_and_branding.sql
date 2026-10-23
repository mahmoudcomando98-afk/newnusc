-- NUSC: repair subject announcements persistence and add platform-logo storage/settings.
-- Run this focused migration once in Supabase SQL Editor.
BEGIN;

-- Bring older announcements tables up to the columns used by the app.
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS importance TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS link_url TEXT,
  ADD COLUMN IF NOT EXISTS link_label TEXT DEFAULT 'دخول السيكشن أونلاين',
  ADD COLUMN IF NOT EXISTS link_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

UPDATE public.announcements SET importance = 'normal' WHERE importance IS NULL;
UPDATE public.announcements SET is_pinned = false WHERE is_pinned IS NULL;
UPDATE public.announcements SET is_published = true WHERE is_published IS NULL;
UPDATE public.announcements SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.announcements SET updated_at = NOW() WHERE updated_at IS NULL;

ALTER TABLE public.announcements ALTER COLUMN importance SET DEFAULT 'normal';
ALTER TABLE public.announcements ALTER COLUMN importance SET NOT NULL;
ALTER TABLE public.announcements ALTER COLUMN is_pinned SET DEFAULT false;
ALTER TABLE public.announcements ALTER COLUMN is_pinned SET NOT NULL;
ALTER TABLE public.announcements ALTER COLUMN is_published SET DEFAULT true;
ALTER TABLE public.announcements ALTER COLUMN is_published SET NOT NULL;
ALTER TABLE public.announcements ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.announcements ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS announcements_subject_published_created_idx
  ON public.announcements (subject_id, is_published, created_at DESC);

-- Ensure the policy helper recognizes the same admin/moderator roles as the UI.
-- SECURITY DEFINER avoids an RLS recursion when checking the signed-in profile.
CREATE OR REPLACE FUNCTION private.is_content_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $content_manager$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'moderator')
      AND COALESCE(is_active, true) = true
  );
$content_manager$;

-- Ensure content-management checks work from the browser for authorized admins.
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_content_manager() TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone authenticated can view published announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "NUSC users read published announcements" ON public.announcements;
DROP POLICY IF EXISTS "NUSC content managers manage announcements" ON public.announcements;

CREATE POLICY "NUSC users read published announcements"
  ON public.announcements FOR SELECT TO authenticated
  USING (is_published = true OR private.is_content_manager());

CREATE POLICY "NUSC content managers manage announcements"
  ON public.announcements FOR ALL TO authenticated
  USING (private.is_content_manager())
  WITH CHECK (private.is_content_manager());

-- Ensure platform_settings exists even on older installations that never ran schema.sql.
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'null'::jsonb,
  description TEXT
);

INSERT INTO public.platform_settings (key, value, description)
VALUES ('site_name', '"NUSC Student Hub"'::jsonb, 'اسم المنصة')
ON CONFLICT (key) DO NOTHING;

-- Save the public logo URL in platform_settings.
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;

DROP POLICY IF EXISTS "Public can read platform branding settings" ON public.platform_settings;
CREATE POLICY "Public can read platform branding settings"
  ON public.platform_settings FOR SELECT TO anon, authenticated
  USING (key IN ('platform_logo_url', 'site_name'));

DROP POLICY IF EXISTS "NUSC content managers manage platform branding settings" ON public.platform_settings;
CREATE POLICY "NUSC content managers manage platform branding settings"
  ON public.platform_settings FOR ALL TO authenticated
  USING (private.is_content_manager())
  WITH CHECK (private.is_content_manager());

-- A dedicated public bucket containing only platform brand images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('platform-assets', 'platform-assets', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public can read platform assets" ON storage.objects;
CREATE POLICY "Public can read platform assets"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'platform-assets');

DROP POLICY IF EXISTS "NUSC content managers upload platform assets" ON storage.objects;
CREATE POLICY "NUSC content managers upload platform assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'platform-assets' AND private.is_content_manager());

DROP POLICY IF EXISTS "NUSC content managers update platform assets" ON storage.objects;
CREATE POLICY "NUSC content managers update platform assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'platform-assets' AND private.is_content_manager())
  WITH CHECK (bucket_id = 'platform-assets' AND private.is_content_manager());

DROP POLICY IF EXISTS "NUSC content managers delete platform assets" ON storage.objects;
CREATE POLICY "NUSC content managers delete platform assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'platform-assets' AND private.is_content_manager());

COMMIT;
