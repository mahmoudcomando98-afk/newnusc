-- ============================================================
-- مزامنة أعمدة الداتابيز مع اللي الكود بيختاره (إصلاح أخطاء 400)
-- كله ADD COLUMN IF NOT EXISTS — آمن للتشغيل حتى لو بعض الأعمدة موجودة
-- التشغيل: Supabase Dashboard → SQL Editor → نفّذ هذا الملف مرة واحدة
-- ============================================================

-- المواد: جدولة النشر + أنواع الواجبات + شارات
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_important BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_delivered BOOLEAN NOT NULL DEFAULT false;

-- الإعلانات: نص بديل + أولوية + جدولة نشر
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;

-- المحاضرات: حالة النشر وترتيبها في التغذية
ALTER TABLE public.lectures
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- الكويزات: حالة النشر
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- المواد الدراسية: حالة النشر
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ملء published_at للمحاضرات القديمة عشان تظهر بالتسلسل الزمني الصحيح
UPDATE public.lectures
SET published_at = created_at
WHERE published_at IS NULL;

-- الأندكس لتسريع الفلترة الشائعة
CREATE INDEX IF NOT EXISTS materials_publish_at_idx ON public.materials (publish_at);
CREATE INDEX IF NOT EXISTS announcements_publish_at_idx ON public.announcements (publish_at);
CREATE INDEX IF NOT EXISTS lectures_published_at_idx ON public.lectures (published_at);
