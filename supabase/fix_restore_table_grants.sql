-- إصلاح: البيانات مش بتظهر لأن الصلاحيات اتشالت عن الجداول
-- نفّذ الملف ده كامل في Supabase → SQL Editor → Run

-- 1) صلاحيات القراءة الأساسية
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON TABLE public.subjects TO anon, authenticated;
GRANT SELECT ON TABLE public.materials TO anon, authenticated;
GRANT SELECT ON TABLE public.announcements TO anon, authenticated;
GRANT SELECT ON TABLE public.quizzes TO anon, authenticated;
GRANT SELECT ON TABLE public.lectures TO anon, authenticated;
GRANT SELECT ON TABLE public.schedule_items TO anon, authenticated;
GRANT SELECT ON TABLE public.schedules TO anon, authenticated;
GRANT SELECT ON TABLE public.notifications TO anon, authenticated;
GRANT SELECT ON TABLE public.faq TO anon, authenticated;
GRANT SELECT ON TABLE public.online_sections TO anon, authenticated;

-- profiles: المستخدم يقرأ صفّه (والأدمن عبر سياساتكم)
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;

-- 2) تأكد إن RLS مفعّل مع سياسة قراءة للمنشور
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;

-- subjects
DROP POLICY IF EXISTS subjects_public_read ON public.subjects;
CREATE POLICY subjects_public_read ON public.subjects
  FOR SELECT TO anon, authenticated
  USING (COALESCE(is_published, true) = true AND COALESCE(is_active, true) = true);

-- materials
DROP POLICY IF EXISTS materials_public_read ON public.materials;
CREATE POLICY materials_public_read ON public.materials
  FOR SELECT TO anon, authenticated
  USING (COALESCE(is_published, true) = true);

-- announcements
DROP POLICY IF EXISTS announcements_public_read ON public.announcements;
CREATE POLICY announcements_public_read ON public.announcements
  FOR SELECT TO anon, authenticated
  USING (COALESCE(is_published, true) = true);

-- quizzes
DROP POLICY IF EXISTS quizzes_public_read ON public.quizzes;
CREATE POLICY quizzes_public_read ON public.quizzes
  FOR SELECT TO anon, authenticated
  USING (COALESCE(is_published, true) = true);

-- lectures (لو الجدول موجود)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='lectures') THEN
    EXECUTE 'DROP POLICY IF EXISTS lectures_public_read ON public.lectures';
    EXECUTE $p$CREATE POLICY lectures_public_read ON public.lectures
      FOR SELECT TO anon, authenticated
      USING (COALESCE(is_published, true) = true AND COALESCE(is_active, true) = true)$p$;
  END IF;
END $$;

-- schedule_items
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='schedule_items') THEN
    EXECUTE 'GRANT SELECT ON TABLE public.schedule_items TO anon, authenticated';
    EXECUTE 'ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS schedule_items_public_read ON public.schedule_items';
    EXECUTE $p$CREATE POLICY schedule_items_public_read ON public.schedule_items
      FOR SELECT TO anon, authenticated USING (true)$p$;
  END IF;
END $$;

-- notifications: للطالب المسجّل
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications') THEN
    EXECUTE 'GRANT SELECT ON TABLE public.notifications TO authenticated';
  END IF;
END $$;

-- 3) لو أعمدة النشر NULL خليهّا true عشان الفلترة في الفرونت متخفيهاش
UPDATE public.subjects SET is_published = true WHERE is_published IS NULL;
UPDATE public.subjects SET is_active = true WHERE is_active IS NULL;
UPDATE public.materials SET is_published = true WHERE is_published IS NULL;
UPDATE public.announcements SET is_published = true WHERE is_published IS NULL;
UPDATE public.quizzes SET is_published = true WHERE is_published IS NULL;
