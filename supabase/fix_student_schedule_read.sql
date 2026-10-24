-- Allow every logged-in student to READ the same schedule rows as admin.
-- Run in Supabase → SQL Editor

CREATE OR REPLACE FUNCTION public.is_admin_or_moderator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'moderator')
      AND COALESCE(is_active, true) = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_moderator() TO authenticated, anon;

GRANT SELECT ON public.schedule_items TO authenticated;

ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;

-- Remove policies that might block students
DROP POLICY IF EXISTS "Students can view schedule items" ON public.schedule_items;
DROP POLICY IF EXISTS "Anyone authenticated can view schedule items" ON public.schedule_items;
DROP POLICY IF EXISTS "Authenticated read schedule_items" ON public.schedule_items;

-- Simple: any logged-in user can read ALL schedule rows (same as admin list)
CREATE POLICY "Authenticated read schedule_items"
  ON public.schedule_items
  FOR SELECT
  TO authenticated
  USING (true);

-- Keep admin write access
DROP POLICY IF EXISTS "Admins manage schedule items" ON public.schedule_items;
CREATE POLICY "Admins manage schedule items"
  ON public.schedule_items
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_moderator())
  WITH CHECK (public.is_admin_or_moderator());
