-- Allow admins to ban/unban students via profiles.is_active
-- Run once in Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Students already without the column become active by default
UPDATE public.profiles SET is_active = true WHERE is_active IS NULL;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Admins can update any profile (including is_active)
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'moderator')
        AND COALESCE(p.is_active, true) = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'moderator')
        AND COALESCE(p.is_active, true) = true
    )
  );

-- Users can still read their own profile (needed to show ban page)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
