-- ============================================================
-- NUSC Store hardening: no paid file without approved order
-- Run once in Supabase → SQL Editor (after store.sql)
-- ============================================================

-- 1) Bucket must stay private
UPDATE storage.buckets SET public = false WHERE id = 'store';

-- 2) Block students from changing order status (cannot self-approve)
CREATE OR REPLACE FUNCTION public.store_orders_guard_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_staff boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.role, '') IN ('admin', 'moderator')
  ) INTO is_staff;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT is_staff THEN
      RAISE EXCEPTION 'غير مسموح بتغيير حالة الطلب';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status IS DISTINCT FROM 'pending' AND NOT is_staff THEN
    RAISE EXCEPTION 'الطلب لازم يبدأ قيد المراجعة';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_orders_guard_status ON public.store_orders;
CREATE TRIGGER trg_store_orders_guard_status
  BEFORE INSERT OR UPDATE ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.store_orders_guard_status();

-- 3) Secure RPC: returns file path only if buyer approved (or admin)
CREATE OR REPLACE FUNCTION public.get_approved_store_file(p_product_id uuid)
RETURNS TABLE(file_path text, file_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_staff boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = uid AND COALESCE(p.role, '') IN ('admin', 'moderator')
  ) INTO is_staff;

  IF NOT is_staff THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.store_orders o
      WHERE o.user_id = uid
        AND o.product_id = p_product_id
        AND o.status = 'approved'
    ) THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT f.file_path, f.file_name
  FROM public.store_product_files f
  WHERE f.product_id = p_product_id
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_approved_store_file(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_approved_store_file(uuid) TO authenticated;

-- 4) Tighten table RLS on product files (no direct SELECT for students)
DROP POLICY IF EXISTS store_files_select ON public.store_product_files;
CREATE POLICY store_files_select ON public.store_product_files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  );

-- Students use get_approved_store_file() only (SECURITY DEFINER)

-- 5) Storage: private files only for approved buyers; previews + own proofs OK
DROP POLICY IF EXISTS store_storage_admin ON storage.objects;
CREATE POLICY store_storage_admin ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'store'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    bucket_id = 'store'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS store_storage_proof_upload ON storage.objects;
CREATE POLICY store_storage_proof_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store'
    AND (storage.foldername(name))[1] = 'proofs'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS store_storage_proof_read ON storage.objects;
DROP POLICY IF EXISTS store_storage_read ON storage.objects;
CREATE POLICY store_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'store'
    AND (
      -- admin
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
      )
      -- own payment proof
      OR (
        (storage.foldername(name))[1] = 'proofs'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      -- preview images only (not the paid template)
      OR (storage.foldername(name))[1] = 'previews'
      -- paid template file: only with approved order matching this path
      OR (
        (storage.foldername(name))[1] = 'files'
        AND EXISTS (
          SELECT 1
          FROM public.store_product_files f
          JOIN public.store_orders o ON o.product_id = f.product_id
          WHERE f.file_path = name
            AND o.user_id = auth.uid()
            AND o.status = 'approved'
        )
      )
    )
  );

-- 6) Student cannot UPDATE status column via broad policy — keep pending-only updates
DROP POLICY IF EXISTS store_orders_update_own_pending ON public.store_orders;
CREATE POLICY store_orders_update_own_pending ON public.store_orders
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- Done
SELECT 'NUSC store_harden applied' AS status;
