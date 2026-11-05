-- اختياري: توحيد عمود النص في quiz_questions
-- لو عندك عمود text مطلوب (NOT NULL) نفّذ ده بعد ما تكون الأسئلة بتتحفظ

BEGIN;

ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS text TEXT,
  ADD COLUMN IF NOT EXISTS prompt TEXT;

-- انسخ من أي عمود متاح للتاني
UPDATE public.quiz_questions
SET text = COALESCE(NULLIF(btrim(text), ''), NULLIF(btrim(prompt), ''), NULLIF(btrim(question_text), ''), NULLIF(btrim(question), ''), 'سؤال')
WHERE text IS NULL OR btrim(text) = '';

UPDATE public.quiz_questions
SET prompt = COALESCE(NULLIF(btrim(prompt), ''), NULLIF(btrim(text), ''), NULLIF(btrim(question_text), ''), NULLIF(btrim(question), ''), 'سؤال')
WHERE prompt IS NULL OR btrim(prompt) = '';

COMMIT;
