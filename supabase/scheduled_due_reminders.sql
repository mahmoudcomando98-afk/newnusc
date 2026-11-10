-- ============================================================
-- تذكيرات تلقائية على السيرفر عبر pg_cron (خطوة اختيارية، مرة واحدة)
-- تُنشئ إشعارات عامة داخل التطبيق (تظهر في صفحة /notifications) تلقائيًا
-- قبل 24 ساعة و3 ساعات من موعد تسليم الواجب — بدون الحاجة لفتح أي طالب للمنصة.
--
-- التشغيل: Supabase Dashboard → SQL Editor → نفّذ هذا الملف مرة واحدة.
-- يتطلب تفعيل pg_cron من: Database → Extensions.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- أعمدة التذكير موجودة بالفعل من publish_schedule_and_reminders.sql؛ نضمنها هنا أيضًا
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS reminder_sent_24h BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_sent_3h BOOLEAN DEFAULT false;

CREATE OR REPLACE FUNCTION public.due_assignment_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
BEGIN
  -- تذكير 24 ساعة (مهام يبدأ موعدها خلال الـ 25 ساعة القادمة)
  FOR r IN
    SELECT m.id, m.title, m.subject_id, s.name AS subject_name, m.due_at
    FROM public.materials m
    LEFT JOIN public.subjects s ON s.id = m.subject_id
    WHERE m.material_type = 'assignment'
      AND m.due_at IS NOT NULL
      AND COALESCE(m.is_published, true) = true
      AND COALESCE(m.is_delivered, false) = false
      AND COALESCE(m.reminder_sent_24h, false) = false
      AND m.due_at BETWEEN now() AND now() + interval '25 hours'
  LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link, is_global)
    VALUES (
      NULL,
      COALESCE(r.subject_name, 'مادة'),
      'تذكير: باقي حوالي يوم على تسليم «' || COALESCE(r.title, 'الواجب') || '»',
      'warning',
      CASE WHEN r.subject_id IS NOT NULL
           THEN '/subject-details.html?id=' || r.subject_id::text
           ELSE '/subjects.html' END,
      true
    );
    UPDATE public.materials SET reminder_sent_24h = true WHERE id = r.id;
  END LOOP;

  -- تذكير 3 ساعات (مهام موعدها خلال الـ 3 ساعات ونصف القادمة)
  FOR r IN
    SELECT m.id, m.title, m.subject_id, s.name AS subject_name, m.due_at
    FROM public.materials m
    LEFT JOIN public.subjects s ON s.id = m.subject_id
    WHERE m.material_type = 'assignment'
      AND m.due_at IS NOT NULL
      AND COALESCE(m.is_published, true) = true
      AND COALESCE(m.is_delivered, false) = false
      AND COALESCE(m.reminder_sent_3h, false) = false
      AND m.due_at BETWEEN now() AND now() + interval '3.5 hours'
  LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link, is_global)
    VALUES (
      NULL,
      COALESCE(r.subject_name, 'مادة'),
      'تذكير: باقي حوالي 3 ساعات على تسليم «' || COALESCE(r.title, 'الواجب') || '»',
      'warning',
      CASE WHEN r.subject_id IS NOT NULL
           THEN '/subject-details.html?id=' || r.subject_id::text
           ELSE '/subjects.html' END,
      true
    );
    UPDATE public.materials SET reminder_sent_3h = true WHERE id = r.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.due_assignment_reminders() FROM PUBLIC, anon, authenticated;

-- جدولة كل ساعة (حذف أي جدولة قديمة بنفس الاسم أولًا)
DO $$
BEGIN
  PERFORM cron.unschedule('due-assignment-reminders') FROM cron.job WHERE jobname = 'due-assignment-reminders';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'due-assignment-reminders',
  '0 * * * *',
  $$SELECT public.due_assignment_reminders()$$
);
