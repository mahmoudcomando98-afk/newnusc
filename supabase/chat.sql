-- دردشة الدفعة — رسائل مشفرة، أحدث ٣٠ تفضل وبس

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_created_at_desc
  ON public.chat_messages (created_at DESC);

-- الحد الأقصى ٣٠ رسالة في الشات — الأقدم بيتمسح تلقائي
CREATE OR REPLACE FUNCTION public.cap_chat_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.chat_messages
  WHERE id NOT IN (
    SELECT id FROM public.chat_messages ORDER BY created_at DESC LIMIT 30
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_cap_chat_messages ON public.chat_messages;
CREATE TRIGGER trg_cap_chat_messages
  AFTER INSERT ON public.chat_messages
  FOR EACH STATEMENT EXECUTE FUNCTION public.cap_chat_messages();

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- في التحكم المسموح: نفذ، لكن القاعدة الفعلية عن طريق service role لقراءة المتشفر + فك التشفير على السيرفر فقط
DROP POLICY IF EXISTS "Auth can read chat" ON public.chat_messages;
CREATE POLICY "Auth can read chat"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.chat_messages FROM anon;
GRANT SELECT ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
