-- ============================================================
-- NUSC Student Hub - Storage Buckets & Policies
-- تنفيذ هذا الملف بعد policies.sql
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'materials',
  'materials',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-rar-compressed',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-rar-compressed',
    'image/jpeg',
    'image/png',
    'image/webp'
  ];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152;

DROP POLICY IF EXISTS "Authenticated users can read materials" ON storage.objects;
CREATE POLICY "Authenticated users can read materials"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'materials' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can upload materials" ON storage.objects;
CREATE POLICY "Admins can upload materials"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'materials' AND public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Admins can update materials" ON storage.objects;
CREATE POLICY "Admins can update materials"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'materials' AND public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Admins can delete materials" ON storage.objects;
CREATE POLICY "Admins can delete materials"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'materials' AND public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
