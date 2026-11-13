-- تذكيرات الذكاء الاصطناعي: الطالب يقول "فكرني بعد 5 دقايق" ← البوت يخزنها ← cron كل دقيقة يبعتله push
-- شغّل مرة واحدة على المشروع الجديد

CREATE TABLE IF NOT EXISTS public.ai_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_reminders_due_idx
  ON public.ai_reminders (due_at)
  WHERE status = 'pending';

ALTER TABLE public.ai_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_ai_reminders_all" ON public.ai_reminders;
CREATE POLICY "own_ai_reminders_all"
  ON public.ai_reminders FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_reminders TO authenticated;
GRANT ALL ON public.ai_reminders TO service_role;

-- مفتاح داخلي للكرون (لا يصله anon/authenticated — الخدمة فقط تتجاوزه)
CREATE TABLE IF NOT EXISTS public.ai_cron_config (
  key text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE public.ai_cron_config ENABLE ROW LEVEL SECURITY;
-- لا توجد سياسات = لا وصول للعامة، والخدمة (service_role) تتجاوزه

INSERT INTO public.ai_cron_config(key, value)
VALUES ('reminder_cron_key', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- امتدادات الجدولة والنداءات HTTP
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- دالة التنفيذ كل دقيقة: تبحث عن التذكيرات المستحقة وتستدعي send-reminder
CREATE OR REPLACE FUNCTION public.dispatch_due_ai_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  key text;
  base text := 'https://bmqqacvgtevogcuqfryq.supabase.co';
BEGIN
  SELECT value INTO key FROM public.ai_cron_config WHERE key = 'reminder_cron_key';
  IF key IS NULL THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT id
    FROM public.ai_reminders
    WHERE status = 'pending' AND due_at <= now()
    ORDER BY due_at ASC
    LIMIT 50
  LOOP
    PERFORM net.http_post(
      url := base || '/functions/v1/send-reminder',
      body := jsonb_build_object('reminder_id', r.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-CRON-KEY', key)
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_due_ai_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_due_ai_reminders() TO service_role;

-- جدولة كل دقيقة (احذف المهمة إن وجدت أولًا)
DO $$
BEGIN
  PERFORM cron.unschedule('ai_reminders_dispatch');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('ai_reminders_dispatch', '* * * * *', 'SELECT public.dispatch_due_ai_reminders()');
