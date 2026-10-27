-- روابط رفع المدرّس (بدون تسجيل دخول) لمادة يحددها الأدمن

CREATE TABLE IF NOT EXISTS public.teacher_upload_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  label TEXT,
  allowed_types TEXT[] NOT NULL DEFAULT ARRAY['lecture','section','assignment','past_exam'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teacher_upload_links_token_idx ON public.teacher_upload_links (token);
CREATE INDEX IF NOT EXISTS teacher_upload_links_subject_idx ON public.teacher_upload_links (subject_id);

ALTER TABLE public.teacher_upload_links ENABLE ROW LEVEL SECURITY;

-- الأدمن فقط يدير الروابط من الواجهة
DROP POLICY IF EXISTS teacher_upload_links_admin_all ON public.teacher_upload_links;
CREATE POLICY teacher_upload_links_admin_all ON public.teacher_upload_links
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.role, '') IN ('admin', 'moderator')
    )
  );

-- سياق الرابط للمدرس (بدون جلسة)
CREATE OR REPLACE FUNCTION public.get_teacher_upload_context(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link public.teacher_upload_links%ROWTYPE;
  sub RECORD;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN json_build_object('ok', false, 'error', 'invalid');
  END IF;

  SELECT * INTO link
  FROM public.teacher_upload_links
  WHERE token = trim(p_token)
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR use_count < max_uses)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'invalid');
  END IF;

  SELECT id, name, code INTO sub
  FROM public.subjects
  WHERE id = link.subject_id
  LIMIT 1;

  IF sub.id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'subject');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'subject_id', sub.id,
    'subject_name', sub.name,
    'subject_code', COALESCE(sub.code, ''),
    'label', COALESCE(link.label, ''),
    'allowed_types', COALESCE(link.allowed_types, ARRAY['lecture'])
  );
END;
$$;

-- حفظ ملف بعد الرفع عبر الرابط
CREATE OR REPLACE FUNCTION public.submit_teacher_material(
  p_token TEXT,
  p_title TEXT,
  p_description TEXT,
  p_material_type TEXT,
  p_file_path TEXT,
  p_file_name TEXT,
  p_file_type TEXT,
  p_file_size BIGINT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link public.teacher_upload_links%ROWTYPE;
  v_type TEXT;
  new_id UUID;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_token');
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) < 2 THEN
    RETURN json_build_object('ok', false, 'error', 'title');
  END IF;
  IF p_file_path IS NULL OR position('teacher-uploads/' in p_file_path) <> 1 THEN
    RETURN json_build_object('ok', false, 'error', 'path');
  END IF;

  SELECT * INTO link
  FROM public.teacher_upload_links
  WHERE token = trim(p_token)
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR use_count < max_uses)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  v_type := COALESCE(NULLIF(trim(p_material_type), ''), 'lecture');
  IF link.allowed_types IS NOT NULL AND array_length(link.allowed_types, 1) > 0 THEN
    IF NOT (v_type = ANY (link.allowed_types)) THEN
      v_type := link.allowed_types[1];
    END IF;
  END IF;

  INSERT INTO public.materials (
    title,
    description,
    subject_id,
    material_type,
    file_path,
    file_name,
    file_type,
    file_size,
    is_published
  ) VALUES (
    trim(p_title),
    NULLIF(trim(COALESCE(p_description, '')), ''),
    link.subject_id,
    v_type,
    p_file_path,
    NULLIF(trim(COALESCE(p_file_name, '')), ''),
    NULLIF(trim(COALESCE(p_file_type, '')), ''),
    p_file_size,
    true
  )
  RETURNING id INTO new_id;

  UPDATE public.teacher_upload_links
  SET use_count = use_count + 1
  WHERE id = link.id;

  RETURN json_build_object('ok', true, 'id', new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_teacher_upload_context(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_teacher_material(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT) TO anon, authenticated;

-- تخزين: السماح للزائر برفع ملفات فقط داخل teacher-uploads/
-- نفّذ على Storage policies لباكت materials (أو عدّل اسم الباكت):
-- INSERT: bucket_id = 'materials' AND (storage.foldername(name))[1] = 'teacher-uploads'
-- SELECT: حسب سياساتكم الحالية للطلاب
