-- ============================================================
-- الكود الجامعي هو وسيلة الدخول الوحيدة (بدل البريد + كلمة المرور)
-- كل طالب عنده كود واحد؛ يظهر الاسم تلقائيًا عند تسجيل الدخول.
-- التشغيل: Supabase Dashboard → SQL Editor → نفّذ هذا الملف مرة واحدة.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.student_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin', 'moderator')),
  linked_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- عمود مُولَّد للتوحيد: قصّ الفراغات + حالة أحرف علوية للحروف اللاتينية
  code_norm TEXT GENERATED ALWAYS AS (
    upper(btrim(regexp_replace(code, '\s+', ' ', 'g')))
  ) STORED
);

-- توحيد المفاتيح: فريد بغض النظر عن حالة الأحرف والفراغات الزائدة
CREATE UNIQUE INDEX IF NOT EXISTS student_codes_norm_unique
  ON public.student_codes (code_norm);
CREATE INDEX IF NOT EXISTS student_codes_user_idx ON public.student_codes (linked_user_id);
CREATE INDEX IF NOT EXISTS student_codes_name_idx ON public.student_codes (full_name);
CREATE INDEX IF NOT EXISTS student_codes_linked_idx ON public.student_codes (linked_user_id) WHERE linked_user_id IS NOT NULL;

-- للترقيات من إصدارات سابقة بدون عمود الجهاز (آمن التكرار):
ALTER TABLE public.student_codes ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE public.student_codes ENABLE ROW LEVEL SECURITY;

-- فقط الأدمن/الموديريتور يتحكمون في الجدول كاملًا
DROP POLICY IF EXISTS student_codes_admin_all ON public.student_codes;
CREATE POLICY student_codes_admin_all ON public.student_codes
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

-- الطالب يقدر يشوف سطره فقط (يعرض كوده في حسابه)
DROP POLICY IF EXISTS student_codes_select_own ON public.student_codes;
CREATE POLICY student_codes_select_own ON public.student_codes
  FOR SELECT TO authenticated
  USING (linked_user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_codes TO authenticated;

-- ============================================================
-- خطوة الزرع لأول أدمن (إلزامية بعد التنفيذ):
-- اختر كود محدد لنفسك واستبدل الاسم. ثم ادخل بـ /login.html واكتب الكود.
-- INSERT INTO public.student_codes (code, full_name, role)
-- VALUES ('20260001', 'اسمك هنا', 'admin');
-- ============================================================
