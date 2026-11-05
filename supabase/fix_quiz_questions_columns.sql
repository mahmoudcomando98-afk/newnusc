-- إصلاح جدول quiz_questions لو اتعمل قبل كده بأسماء أعمدة مختلفة
-- نفّذه في Supabase → SQL Editor (آمن، مش بيمسح بيانات)

BEGIN;

-- تأكد الجدول موجود
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- الأعمدة المطلوبة
ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS prompt TEXT,
  ADD COLUMN IF NOT EXISTS question_text TEXT,
  ADD COLUMN IF NOT EXISTS question TEXT,
  ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS choices JSONB,
  ADD COLUMN IF NOT EXISTS correct_option INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_index INTEGER,
  ADD COLUMN IF NOT EXISTS answer_index INTEGER,
  ADD COLUMN IF NOT EXISTS points NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- نسخ النص من أسماء بديلة إلى prompt
UPDATE public.quiz_questions
SET prompt = COALESCE(
  NULLIF(btrim(prompt), ''),
  NULLIF(btrim(question_text), ''),
  NULLIF(btrim(question), ''),
  'سؤال'
)
WHERE prompt IS NULL OR btrim(prompt) = '';

-- نسخ الاختيارات
UPDATE public.quiz_questions
SET options = COALESCE(options, choices, '[]'::jsonb)
WHERE options IS NULL OR options = '[]'::jsonb;

-- نسخ رقم الإجابة الصح
UPDATE public.quiz_questions
SET correct_option = COALESCE(correct_option, correct_index, answer_index, 0)
WHERE correct_option IS NULL;

UPDATE public.quiz_questions
SET points = COALESCE(points, 1)
WHERE points IS NULL OR points <= 0;

UPDATE public.quiz_questions
SET position = COALESCE(position, sort_order, 0)
WHERE position IS NULL;

-- خلّي prompt مطلوب بعد الملء
ALTER TABLE public.quiz_questions ALTER COLUMN prompt SET DEFAULT '';
UPDATE public.quiz_questions SET prompt = 'سؤال' WHERE prompt IS NULL;
ALTER TABLE public.quiz_questions ALTER COLUMN prompt SET NOT NULL;

ALTER TABLE public.quiz_questions ALTER COLUMN options SET DEFAULT '[]'::jsonb;
UPDATE public.quiz_questions SET options = '[]'::jsonb WHERE options IS NULL;
ALTER TABLE public.quiz_questions ALTER COLUMN options SET NOT NULL;

ALTER TABLE public.quiz_questions ALTER COLUMN correct_option SET DEFAULT 0;
UPDATE public.quiz_questions SET correct_option = 0 WHERE correct_option IS NULL;
ALTER TABLE public.quiz_questions ALTER COLUMN correct_option SET NOT NULL;

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS has_questions BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_retake BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;

UPDATE public.quizzes q
SET has_questions = EXISTS (SELECT 1 FROM public.quiz_questions qq WHERE qq.quiz_id = q.id);

CREATE INDEX IF NOT EXISTS quiz_questions_quiz_id_idx ON public.quiz_questions(quiz_id);

-- محاولات الطلاب
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  score NUMERIC,
  max_score NUMERIC,
  answers JSONB DEFAULT '{}'::jsonb,
  question_order UUID[] DEFAULT ARRAY[]::UUID[],
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS score NUMERIC,
  ADD COLUMN IF NOT EXISTS max_score NUMERIC,
  ADD COLUMN IF NOT EXISTS answers JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS question_order UUID[] DEFAULT ARRAY[]::UUID[],
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- شيل UNIQUE القديم اللي بيمنع أكثر من محاولة مسلّمة
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'quiz_attempts' AND c.contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.quiz_attempts DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS quiz_attempts_one_open;
CREATE UNIQUE INDEX IF NOT EXISTS quiz_attempts_one_open
  ON public.quiz_attempts (quiz_id, user_id)
  WHERE status = 'in_progress';

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quiz_attempts TO authenticated;

DROP POLICY IF EXISTS qq_admin_all ON public.quiz_questions;
CREATE POLICY qq_admin_all ON public.quiz_questions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS qa_select_own ON public.quiz_attempts;
CREATE POLICY qa_select_own ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS qa_insert_own ON public.quiz_attempts;
CREATE POLICY qa_insert_own ON public.quiz_attempts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS qa_update_own ON public.quiz_attempts;
CREATE POLICY qa_update_own ON public.quiz_attempts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- RPCs محدّثة تستخدم prompt بأمان
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(p_quiz_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  q RECORD;
  attempt_id UUID;
  ends TIMESTAMPTZ;
  existing UUID;
  qrows JSONB;
  ord UUID[];
  prev_submitted INT;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'يجب تسجيل الدخول');
  END IF;

  SELECT * INTO q FROM public.quizzes WHERE id = p_quiz_id;
  IF NOT FOUND OR q.is_published IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'الكويز غير متاح');
  END IF;

  IF q.start_at IS NOT NULL AND now() < q.start_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'الكويز لسه ما فتحش');
  END IF;

  IF q.end_at IS NOT NULL AND now() > q.end_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'انتهى وقت الكويز');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.quiz_questions WHERE quiz_id = p_quiz_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'مفيش أسئلة على الكويز ده');
  END IF;

  SELECT id INTO existing
  FROM public.quiz_attempts
  WHERE quiz_id = p_quiz_id AND user_id = uid AND status = 'in_progress'
  LIMIT 1;

  IF existing IS NOT NULL THEN
    attempt_id := existing;
    SELECT ends_at, question_order INTO ends, ord FROM public.quiz_attempts WHERE id = existing;
  ELSE
    SELECT COUNT(*) INTO prev_submitted
    FROM public.quiz_attempts
    WHERE quiz_id = p_quiz_id AND user_id = uid AND status = 'submitted';

    IF prev_submitted > 0 AND COALESCE(q.allow_retake, false) IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'error', 'خلصت الكويز قبل كده');
    END IF;

    SELECT array_agg(id ORDER BY random()) INTO ord
    FROM public.quiz_questions WHERE quiz_id = p_quiz_id;

    ends := CASE
      WHEN q.duration_minutes IS NOT NULL AND q.duration_minutes > 0
        THEN least(
          now() + (q.duration_minutes || ' minutes')::interval,
          COALESCE(q.end_at, now() + interval '24 hours')
        )
      WHEN q.end_at IS NOT NULL THEN q.end_at
      ELSE now() + interval '2 hours'
    END;

    INSERT INTO public.quiz_attempts (quiz_id, user_id, ends_at, question_order, status)
    VALUES (p_quiz_id, uid, ends, ord, 'in_progress')
    RETURNING id INTO attempt_id;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', qq.id,
      'prompt', COALESCE(NULLIF(btrim(qq.prompt), ''), NULLIF(btrim(qq.question_text), ''), NULLIF(btrim(qq.question), ''), 'سؤال'),
      'options', COALESCE(qq.options, qq.choices, '[]'::jsonb),
      'points', COALESCE(qq.points, 1)
    ) ORDER BY array_position(ord, qq.id)
  ), '[]'::jsonb)
  INTO qrows
  FROM public.quiz_questions qq
  WHERE qq.quiz_id = p_quiz_id AND qq.id = ANY(ord);

  RETURN jsonb_build_object(
    'ok', true,
    'attempt_id', attempt_id,
    'ends_at', ends,
    'title', q.title,
    'duration_minutes', q.duration_minutes,
    'questions', qrows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(p_attempt_id UUID, p_answers JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  att RECORD;
  qq RECORD;
  score NUMERIC := 0;
  max_score NUMERIC := 0;
  chosen INT;
  ans JSONB := COALESCE(p_answers, '{}'::jsonb);
  correct INT;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'يجب تسجيل الدخول');
  END IF;

  SELECT * INTO att FROM public.quiz_attempts WHERE id = p_attempt_id AND user_id = uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'المحاولة غير موجودة');
  END IF;

  IF att.status = 'submitted' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'score', att.score,
      'max_score', att.max_score
    );
  END IF;

  FOR qq IN SELECT * FROM public.quiz_questions WHERE quiz_id = att.quiz_id LOOP
    max_score := max_score + COALESCE(qq.points, 1);
    chosen := NULL;
    BEGIN
      chosen := (ans ->> qq.id::text)::int;
    EXCEPTION WHEN others THEN
      chosen := NULL;
    END;
    correct := COALESCE(qq.correct_option, qq.correct_index, qq.answer_index, 0);
    IF chosen IS NOT NULL AND chosen = correct THEN
      score := score + COALESCE(qq.points, 1);
    END IF;
  END LOOP;

  UPDATE public.quiz_attempts
  SET
    submitted_at = now(),
    score = score,
    max_score = max_score,
    answers = ans,
    status = 'submitted'
  WHERE id = p_attempt_id;

  RETURN jsonb_build_object(
    'ok', true,
    'score', score,
    'max_score', max_score,
    'percent', CASE WHEN max_score > 0 THEN round((score / max_score) * 100) ELSE 0 END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_quiz_result(p_quiz_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  att RECORD;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT * INTO att
  FROM public.quiz_attempts
  WHERE quiz_id = p_quiz_id AND user_id = uid AND status = 'submitted'
  ORDER BY submitted_at DESC NULLS LAST
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'has_result', false);
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'has_result', true,
    'score', att.score,
    'max_score', att.max_score,
    'submitted_at', att.submitted_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_quiz_attempt(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_quiz_attempt(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_quiz_result(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_quiz_attempt(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_quiz_result(UUID) TO authenticated;

COMMIT;
