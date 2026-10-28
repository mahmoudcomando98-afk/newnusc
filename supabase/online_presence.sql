-- عدّاد المتواجدين على المنصة (لا يؤثر على تسجيل الدخول)
CREATE TABLE IF NOT EXISTS public.online_presence (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  path TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS online_presence_last_seen_idx
  ON public.online_presence (last_seen_at DESC);

ALTER TABLE public.online_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users upsert own presence" ON public.online_presence;
CREATE POLICY "Users upsert own presence"
  ON public.online_presence
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read presence" ON public.online_presence;
CREATE POLICY "Admins read presence"
  ON public.online_presence
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'moderator')
        AND COALESCE(p.is_active, true) = true
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.online_presence TO authenticated;
