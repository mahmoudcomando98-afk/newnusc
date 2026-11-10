-- ============================================================
-- حذف متجر القوالب بالكامل من قاعدة بيانات Supabase
-- شغّل هذا الملف مرة واحدة من: Supabase Dashboard → SQL Editor
-- ⚠️ لا يمكن التراجع عنه — تأكد من أخذ Backup أولًا إن احتجت البيانات
-- ============================================================

-- 1) الدوال الخاصة بالمتجر
DROP FUNCTION IF EXISTS public.get_approved_store_file(uuid);
DROP FUNCTION IF EXISTS public.store_orders_guard_status() CASCADE;

-- 2) الجداول (الترتيب: التابع أولًا)
DROP TABLE IF EXISTS public.store_product_files CASCADE;
DROP TABLE IF EXISTS public.store_orders CASCADE;
DROP TABLE IF EXISTS public.store_products CASCADE;
DROP TABLE IF EXISTS public.store_settings CASCADE;

-- 3) ملفات التخزين (Storage) — نحذف الملفات ثم الـ bucket
DELETE FROM storage.objects WHERE bucket_id = 'store';
DELETE FROM storage.buckets WHERE id = 'store';

-- 4) سياسات التخزين المتبقية على bucket المتجر (إن وُجدت)
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual ILIKE '%store%' OR with_check ILIKE '%store%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;
