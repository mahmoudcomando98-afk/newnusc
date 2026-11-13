-- تذكير الخطة اليومية — ٧ صباحاً بتوقيت القاهرة
-- بيختار كل مستخدم عنده مهام لسة لليوم ويبعتله رسالة فيها أول٣ مهام

CREATE OR REPLACE FUNCTION public.create_study_plan_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.id AS user_id,
           array_agg(st.title ORDER BY st.due_at) AS titles,
           count(*) AS pending_count
    FROM public.study_tasks st
    JOIN public.profiles p ON p.id = st.user_id
    WHERE st.is_done = false
      AND (st.due_at AT TIME ZONE 'Africa/Cairo')::date = (now() AT TIME ZONE 'Africa/Cairo')::date
    GROUP BY p.id
  LOOP
    -- منع الإرسال المكرر لنفس اليوم: مهمة بنفس النمط لليوم
    IF NOT EXISTS (
      SELECT 1 FROM public.ai_reminders
      WHERE user_id = r.user_id
        AND (due_at AT TIME ZONE 'Africa/Cairo')::date = (now() AT TIME ZONE 'Africa/Cairo')::date
        AND message LIKE 'خطتي النهاردة%'
    ) THEN
      INSERT INTO public.ai_reminders(user_id, message, due_at)
      VALUES (
        r.user_id,
        'خطتي النهاردة ' ||
        CASE WHEN r.pending_count > 3
             THEN r.pending_count || ' مهام — ابدأ بـ: ' || array_to_string(r.titles[1:3], ' • ')
             ELSE ': ' || array_to_string(r.titles, ' • ')
        END,
        now()
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_study_plan_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_study_plan_reminders() TO service_role;

-- ٧ صباحاً بتوقيت القاهرة (٥ صباحاً UTC)
DO $$
BEGIN
  PERFORM cron.unschedule('study_plan_morning');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('study_plan_morning', '0 5 * * *', 'SELECT public.create_study_plan_reminders()');
