-- رفع حد حجم ملف materials إلى 200 ميجا (قابل للتعديل)
-- نفّذ في SQL Editor على مشروع Supabase الحالي

UPDATE storage.buckets
SET file_size_limit = 209715200  -- 200 * 1024 * 1024
WHERE id = 'materials';

-- لو الـ bucket مش موجود:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'materials',
  'materials',
  false,
  209715200,
  ARRAY[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-rar-compressed',
    'application/vnd.rar',
    'application/x-7z-compressed',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- سياسات الرفع (لو مش موجودة) — تستخدم is_admin()
DROP POLICY IF EXISTS "Admins can upload materials" ON storage.objects;
CREATE POLICY "Admins can upload materials"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'materials' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can update materials" ON storage.objects;
CREATE POLICY "Admins can update materials"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'materials' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can delete materials" ON storage.objects;
CREATE POLICY "Admins can delete materials"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'materials' AND public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read materials" ON storage.objects;
CREATE POLICY "Authenticated users can read materials"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'materials');
