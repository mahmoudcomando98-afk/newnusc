-- Interactive in-platform quizzes (MCQ)
-- Run once in Supabase → SQL Editor. Additive only — does not break existing quizzes/quiz_url.

BEGIN;

-- Optional flag on quizzes
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS has_questions BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_retake BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_option INTEGER NOT NULL DEFAULT 0 CHECK (correct_option >= 0),
  points NUMERIC NOT NULL DEFAULT 1 CHECK (points > 0),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quiz_questions_quiz_id_idx ON public.quiz_questions(quiz_id);

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
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, user_id, status)
);

-- Allow multiple submitted attempts if retake; only one in_progress
DROP INDEX IF EXISTS quiz_attempts_one_open;
CREATE UNIQUE INDEX IF NOT EXISTS quiz_attempts_one_open
  ON public.quiz_attempts (quiz_id, user_id)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS quiz_attempts_user_idx ON public.quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS quiz_attempts_quiz_idx ON public.quiz_attempts(quiz_id);

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quiz_attempts TO authenticated;

-- Admin full access to questions
DROP POLICY IF EXISTS qq_admin_all ON public.quiz_questions;
CREATE POLICY qq_admin_all ON public.quiz_questions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Students must NOT read correct_option via direct table select
-- Block direct student SELECT on quiz_questions (use RPC instead)
DROP POLICY IF EXISTS qq_student_none ON public.quiz_questions;
-- no student select policy = only admin can read rows via table API

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

-- Keep has_questions in sync
CREATE OR REPLACE FUNCTION public.sync_quiz_has_questions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.quizzes
    SET has_questions = EXISTS (SELECT 1 FROM public.quiz_questions WHERE quiz_id = OLD.quiz_id)
    WHERE id = OLD.quiz_id;
    RETURN OLD;
  END IF;
  UPDATE public.quizzes
  SET has_questions = true
  WHERE id = NEW.quiz_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_quiz_has_questions ON public.quiz_questions;
CREATE TRIGGER trg_sync_quiz_has_questions
AFTER INSERT OR DELETE ON public.quiz_questions
FOR EACH ROW EXECUTE FUNCTION public.sync_quiz_has_questions();

-- Start attempt + return shuffled questions (no correct answers)
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
      'prompt', qq.prompt,
      'options', qq.options,
      'points', qq.points
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

  IF att.ends_at IS NOT NULL AND now() > att.ends_at + interval '30 seconds' THEN
    -- still score late answers but mark expired if way past; allow short grace
    NULL;
  END IF;

  FOR qq IN SELECT * FROM public.quiz_questions WHERE quiz_id = att.quiz_id LOOP
    max_score := max_score + COALESCE(qq.points, 1);
    chosen := NULL;
    BEGIN
      chosen := (ans ->> qq.id::text)::int;
    EXCEPTION WHEN others THEN
      chosen := NULL;
    END;
    IF chosen IS NOT NULL AND chosen = qq.correct_option THEN
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
