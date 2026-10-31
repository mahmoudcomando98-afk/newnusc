-- متجر قوالب البرزنتيشن — دفع يدوي + موافقة أدمن
-- نفّذ الملف كاملًا في Supabase → SQL Editor

-- إعدادات التحويل (رقم واحد + تعليمات)
CREATE TABLE IF NOT EXISTS public.store_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payment_phone TEXT,
  payment_name TEXT,
  payment_instructions TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.store_settings (id, payment_phone, payment_name, payment_instructions)
VALUES (
  1,
  '',
  '',
  'حوّل المبلغ على الرقم الظاهر، ثم ارفع صورة إثبات التحويل من صفحة القالب. بعد مراجعة الأدمن هيظهر لك التحميل.'
)
ON CONFLICT (id) DO NOTHING;

-- المنتجات (من غير مسار الملف السري)
CREATE TABLE IF NOT EXISTS public.store_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'EGP',
  preview_image_path TEXT,
  preview_video_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_products_active_idx
  ON public.store_products (is_active, sort_order, created_at DESC);

-- ملف القالب السري — يظهر فقط للأدمن أو بعد موافقة الطلب
CREATE TABLE IF NOT EXISTS public.store_product_files (
  product_id UUID PRIMARY KEY REFERENCES public.store_products(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- طلبات الشراء
CREATE TABLE IF NOT EXISTS public.store_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.store_products(id) ON DELETE RESTRICT,
  price_at_purchase NUMERIC(12, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  proof_path TEXT,
  student_note TEXT,
  admin_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_orders_user_idx ON public.store_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS store_orders_status_idx ON public.store_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS store_orders_product_idx ON public.store_orders (product_id);

-- منع تكرار طلب pending/approved لنفس المنتج من نفس المستخدم
CREATE UNIQUE INDEX IF NOT EXISTS store_orders_unique_open
  ON public.store_orders (user_id, product_id)
  WHERE status IN ('pending', 'approved');

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_product_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;

-- settings: الكل يقرأ، الأدمن يعدّل
DROP POLICY IF EXISTS store_settings_read ON public.store_settings;
CREATE POLICY store_settings_read ON public.store_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS store_settings_admin ON public.store_settings;
CREATE POLICY store_settings_admin ON public.store_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  );

-- products: الطلاب يشوفوا النشط فقط، الأدمن الكل
DROP POLICY IF EXISTS store_products_read ON public.store_products;
CREATE POLICY store_products_read ON public.store_products
  FOR SELECT TO authenticated
  USING (
    is_active = true
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS store_products_admin ON public.store_products;
CREATE POLICY store_products_admin ON public.store_products
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  );

-- product files: أدمن أو صاحب طلب موافق عليه
DROP POLICY IF EXISTS store_files_select ON public.store_product_files;
CREATE POLICY store_files_select ON public.store_product_files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
    OR EXISTS (
      SELECT 1 FROM public.store_orders o
      WHERE o.product_id = store_product_files.product_id
        AND o.user_id = auth.uid()
        AND o.status = 'approved'
    )
  );

DROP POLICY IF EXISTS store_files_admin ON public.store_product_files;
CREATE POLICY store_files_admin ON public.store_product_files
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  );

-- orders
DROP POLICY IF EXISTS store_orders_select ON public.store_orders;
CREATE POLICY store_orders_select ON public.store_orders
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS store_orders_insert ON public.store_orders;
CREATE POLICY store_orders_insert ON public.store_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
  );

-- الطالب يقدر يحدّث ملاحظته فقط وهو pending (التحديث الكامل للأدمن)
DROP POLICY IF EXISTS store_orders_update_own_pending ON public.store_orders;
CREATE POLICY store_orders_update_own_pending ON public.store_orders
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS store_orders_admin ON public.store_orders;
CREATE POLICY store_orders_admin ON public.store_orders
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  );

GRANT SELECT ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO authenticated;
GRANT SELECT ON public.store_products TO authenticated;
GRANT ALL ON public.store_products TO authenticated;
GRANT SELECT ON public.store_product_files TO authenticated;
GRANT ALL ON public.store_product_files TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.store_orders TO authenticated;
GRANT ALL ON public.store_orders TO authenticated;

-- Storage bucket: store (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('store', 'store', false, 52428800)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Storage policies
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

-- الطالب يرفع إثبات في proofs/{user_id}/...
DROP POLICY IF EXISTS store_storage_proof_upload ON storage.objects;
CREATE POLICY store_storage_proof_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store'
    AND (storage.foldername(name))[1] = 'proofs'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS store_storage_proof_read ON storage.objects;
CREATE POLICY store_storage_proof_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'store'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND COALESCE(p.role, '') IN ('admin', 'moderator')
      )
      OR (
        (storage.foldername(name))[1] = 'proofs'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      OR (
        (storage.foldername(name))[1] = 'previews'
      )
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
