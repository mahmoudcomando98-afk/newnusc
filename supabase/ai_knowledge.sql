-- مساعد COMANDO — معرفة الأدمن (قابلة للتوسيع)
-- الأدمن يضيف معلومات حرّة للبوت (مادة + شرحها، تفاصيل امتحان، خصومة علامات، إلخ)
-- شغّل مرة واحدة على القاعدة الجديدة

CREATE TABLE IF NOT EXISTS public.ai_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_knowledge_active_idx
  ON public.ai_knowledge (is_active)
  WHERE is_active = true;

ALTER TABLE public.ai_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read active ai_knowledge" ON public.ai_knowledge;
CREATE POLICY "Authenticated can read active ai_knowledge"
  ON public.ai_knowledge FOR SELECT TO authenticated
  USING (is_active = true OR private.is_content_manager());

DROP POLICY IF EXISTS "Admins manage ai_knowledge" ON public.ai_knowledge;
CREATE POLICY "Admins manage ai_knowledge"
  ON public.ai_knowledge FOR ALL TO authenticated
  USING (private.is_content_manager())
  WITH CHECK (private.is_content_manager());

GRANT SELECT ON public.ai_knowledge TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_knowledge TO authenticated;
