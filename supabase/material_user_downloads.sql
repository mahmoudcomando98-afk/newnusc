-- تتبع تنزيلات الطالب لكل ملف (للتذكير الودي عند إعادة التنزيل)
-- نفّذ في Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS public.material_user_downloads (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  download_count INTEGER NOT NULL DEFAULT 1 CHECK (download_count >= 1),
  first_downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, material_id)
);

CREATE INDEX IF NOT EXISTS material_user_downloads_material_idx
  ON public.material_user_downloads (material_id);

ALTER TABLE public.material_user_downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mud_select_own ON public.material_user_downloads;
CREATE POLICY mud_select_own ON public.material_user_downloads
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS mud_insert_own ON public.material_user_downloads;
CREATE POLICY mud_insert_own ON public.material_user_downloads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS mud_update_own ON public.material_user_downloads;
CREATE POLICY mud_update_own ON public.material_user_downloads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.material_user_downloads TO authenticated;

CREATE OR REPLACE FUNCTION public.record_material_download(p_material_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  prev_count INTEGER := 0;
  new_count INTEGER := 1;
BEGIN
  IF uid IS NULL OR p_material_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'prior', false, 'count', 0);
  END IF;

  SELECT download_count INTO prev_count
  FROM public.material_user_downloads
  WHERE user_id = uid AND material_id = p_material_id;

  IF prev_count IS NULL THEN
    INSERT INTO public.material_user_downloads (user_id, material_id, download_count)
    VALUES (uid, p_material_id, 1)
    ON CONFLICT (user_id, material_id) DO UPDATE
      SET download_count = public.material_user_downloads.download_count + 1,
          last_downloaded_at = now()
    RETURNING download_count INTO new_count;
    prev_count := 0;
  ELSE
    UPDATE public.material_user_downloads
    SET download_count = download_count + 1,
        last_downloaded_at = now()
    WHERE user_id = uid AND material_id = p_material_id
    RETURNING download_count INTO new_count;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'prior', COALESCE(prev_count, 0) > 0,
    'count', COALESCE(new_count, 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_material_download(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_material_download(UUID) TO authenticated;
