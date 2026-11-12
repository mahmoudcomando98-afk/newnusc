-- ============================================================
-- COMANDO — إعداد القاعدة الجديدة (nusc-v2) دفعة واحدة
-- نفّذ الملف كامل مرة واحدة في: Supabase → SQL Editor → Run
-- آمن للتكرار (IF NOT EXISTS / OR REPLACE)
-- بعد التنفيذ:
--   1) npx supabase functions deploy code-login --no-verify-jwt
--   2) INSERT أدمن في student_codes (انظر آخر الملف)
-- ============================================================

BEGIN;

-- ---------- مساعدات ----------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'moderator')
      AND COALESCE(p.is_active, true) = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- حد معدّل بسيط لبحث الأسماء (code-login lookup)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  hit_count INT NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key TEXT, p_max_per_minute INT DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec RECORD;
BEGIN
  SELECT * INTO rec FROM public.rate_limits WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.rate_limits (key, window_start, hit_count)
    VALUES (p_key, now(), 1);
    RETURN true;
  END IF;
  IF rec.window_start < now() - interval '1 minute' THEN
    UPDATE public.rate_limits
    SET window_start = now(), hit_count = 1
    WHERE key = p_key;
    RETURN true;
  END IF;
  IF rec.hit_count >= p_max_per_minute THEN
    RETURN false;
  END IF;
  UPDATE public.rate_limits SET hit_count = hit_count + 1 WHERE key = p_key;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT) TO service_role;

-- ---------- profiles: إصلاح name / full_name ----------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student';
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_id TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS college TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS academic_year TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

    -- لو name مطلوب بدون default كان بيكسر createUser
    BEGIN
      ALTER TABLE public.profiles ALTER COLUMN name DROP NOT NULL;
    EXCEPTION WHEN others THEN NULL;
    END;
    BEGIN
      ALTER TABLE public.profiles ALTER COLUMN full_name DROP NOT NULL;
    EXCEPTION WHEN others THEN NULL;
    END;

    UPDATE public.profiles
    SET full_name = COALESCE(NULLIF(btrim(full_name), ''), NULLIF(btrim(name), ''), 'طالب')
    WHERE full_name IS NULL OR btrim(full_name) = '';

    UPDATE public.profiles
    SET name = COALESCE(NULLIF(btrim(name), ''), NULLIF(btrim(full_name), ''), 'طالب')
    WHERE name IS NULL OR btrim(name) = '';
  END IF;
END $$;

-- ---------- أكواد الطلاب ----------
CREATE TABLE IF NOT EXISTS public.student_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin', 'moderator')),
  linked_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.student_codes ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE public.student_codes ADD COLUMN IF NOT EXISTS linked_user_id UUID;
ALTER TABLE public.student_codes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.student_codes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- code_norm عمود مولّد (لو مش موجود)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_codes' AND column_name = 'code_norm'
  ) THEN
    ALTER TABLE public.student_codes
      ADD COLUMN code_norm TEXT GENERATED ALWAYS AS (
        upper(btrim(regexp_replace(code, '\s+', ' ', 'g')))
      ) STORED;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS student_codes_norm_unique ON public.student_codes (code_norm);
CREATE INDEX IF NOT EXISTS student_codes_user_idx ON public.student_codes (linked_user_id);
CREATE INDEX IF NOT EXISTS student_codes_name_idx ON public.student_codes (full_name);

ALTER TABLE public.student_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_codes_admin_all ON public.student_codes;
CREATE POLICY student_codes_admin_all ON public.student_codes
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS student_codes_select_own ON public.student_codes;
CREATE POLICY student_codes_select_own ON public.student_codes
  FOR SELECT TO authenticated
  USING (linked_user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_codes TO authenticated;

-- ---------- أعمدة التطبيق الشائعة ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='materials') THEN
    ALTER TABLE public.materials
      ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_important BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_delivered BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS submission_url TEXT,
      ADD COLUMN IF NOT EXISTS solution_image_path TEXT,
      ADD COLUMN IF NOT EXISTS admin_note TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='announcements') THEN
    ALTER TABLE public.announcements
      ADD COLUMN IF NOT EXISTS body TEXT,
      ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal',
      ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='lectures') THEN
    ALTER TABLE public.lectures
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
    UPDATE public.lectures SET published_at = created_at WHERE published_at IS NULL AND created_at IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='subjects') THEN
    ALTER TABLE public.subjects
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='quizzes') THEN
    ALTER TABLE public.quizzes
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS has_questions BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS allow_retake BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS duration_minutes INT,
      ADD COLUMN IF NOT EXISTS quiz_url TEXT,
      ADD COLUMN IF NOT EXISTS solution_image_path TEXT,
      ADD COLUMN IF NOT EXISTS instructions TEXT,
      ADD COLUMN IF NOT EXISTS total_marks NUMERIC,
      ADD COLUMN IF NOT EXISTS passing_score NUMERIC;
  END IF;
END $$;

-- ---------- أسئلة ومحاولات الكويز ----------
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  text TEXT,
  prompt TEXT,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_option INTEGER NOT NULL DEFAULT 0,
  points NUMERIC NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS text TEXT,
  ADD COLUMN IF NOT EXISTS prompt TEXT,
  ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS correct_option INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quiz_questions' AND column_name='correct_answer_id'
  ) THEN
    BEGIN
      ALTER TABLE public.quiz_questions ALTER COLUMN correct_answer_id DROP NOT NULL;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

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
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_progress';

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

-- ---------- RPCs الكويز ----------
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
  IF NOT FOUND OR COALESCE(q.is_published, true) IS NOT TRUE THEN
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
      'prompt', COALESCE(NULLIF(btrim(qq.prompt), ''), NULLIF(btrim(qq.text), ''), 'سؤال'),
      'options', COALESCE(qq.options, '[]'::jsonb),
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
    'quiz_end_at', q.end_at,
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
  v_score NUMERIC := 0;
  v_max NUMERIC := 0;
  chosen INT;
  ans JSONB := COALESCE(p_answers, '{}'::jsonb);
  correct INT;
  q_end TIMESTAMPTZ;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'يجب تسجيل الدخول');
  END IF;

  SELECT * INTO att FROM public.quiz_attempts WHERE id = p_attempt_id AND user_id = uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'المحاولة غير موجودة');
  END IF;

  IF att.status = 'submitted' THEN
    SELECT end_at INTO q_end FROM public.quizzes WHERE id = att.quiz_id;
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'score', att.score,
      'max_score', att.max_score,
      'percent', CASE WHEN COALESCE(att.max_score,0) > 0 THEN round((att.score / att.max_score) * 100) ELSE 0 END,
      'quiz_end_at', q_end,
      'can_reveal', (q_end IS NULL OR now() >= q_end)
    );
  END IF;

  FOR qq IN SELECT * FROM public.quiz_questions WHERE quiz_id = att.quiz_id LOOP
    v_max := v_max + COALESCE(qq.points, 1);
    chosen := NULL;
    BEGIN
      chosen := (ans ->> qq.id::text)::int;
    EXCEPTION WHEN others THEN
      chosen := NULL;
    END;
    correct := COALESCE(qq.correct_option, 0);
    IF chosen IS NOT NULL AND chosen = correct THEN
      v_score := v_score + COALESCE(qq.points, 1);
    END IF;
  END LOOP;

  UPDATE public.quiz_attempts qa
  SET
    submitted_at = now(),
    score = v_score,
    max_score = v_max,
    answers = ans,
    status = 'submitted'
  WHERE qa.id = p_attempt_id;

  SELECT end_at INTO q_end FROM public.quizzes WHERE id = att.quiz_id;

  RETURN jsonb_build_object(
    'ok', true,
    'score', v_score,
    'max_score', v_max,
    'percent', CASE WHEN v_max > 0 THEN round((v_score / v_max) * 100) ELSE 0 END,
    'quiz_end_at', q_end,
    'can_reveal', (q_end IS NULL OR now() >= q_end)
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
  q_end TIMESTAMPTZ;
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
  SELECT end_at INTO q_end FROM public.quizzes WHERE id = p_quiz_id;
  RETURN jsonb_build_object(
    'ok', true,
    'has_result', true,
    'score', att.score,
    'max_score', att.max_score,
    'submitted_at', att.submitted_at,
    'quiz_end_at', q_end,
    'can_reveal', (q_end IS NULL OR now() >= q_end)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_quiz_review(p_quiz_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  att RECORD;
  q RECORD;
  details JSONB;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'يجب تسجيل الدخول');
  END IF;

  SELECT * INTO q FROM public.quizzes WHERE id = p_quiz_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'الكويز غير موجود');
  END IF;

  IF q.end_at IS NOT NULL AND now() < q.end_at AND NOT public.is_admin() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'التفاصيل هتظهر بعد ما يخلص وقت الكويز',
      'quiz_end_at', q.end_at,
      'can_reveal', false
    );
  END IF;

  SELECT * INTO att
  FROM public.quiz_attempts
  WHERE quiz_id = p_quiz_id AND user_id = uid AND status = 'submitted'
  ORDER BY submitted_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'مفيش محاولة مسلّمة');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', qq.id,
      'prompt', COALESCE(NULLIF(btrim(qq.prompt), ''), NULLIF(btrim(qq.text), ''), 'سؤال'),
      'options', COALESCE(qq.options, '[]'::jsonb),
      'correct_option', COALESCE(qq.correct_option, 0),
      'chosen', CASE
        WHEN att.answers ? qq.id::text THEN (att.answers ->> qq.id::text)::int
        ELSE NULL
      END,
      'is_correct', CASE
        WHEN att.answers ? qq.id::text
          THEN ((att.answers ->> qq.id::text)::int = COALESCE(qq.correct_option, 0))
        ELSE false
      END,
      'points', COALESCE(qq.points, 1)
    ) ORDER BY COALESCE(qq.position, 0)
  ), '[]'::jsonb)
  INTO details
  FROM public.quiz_questions qq
  WHERE qq.quiz_id = p_quiz_id;

  RETURN jsonb_build_object(
    'ok', true,
    'can_reveal', true,
    'score', att.score,
    'max_score', att.max_score,
    'title', q.title,
    'questions', details
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_quiz_results(p_quiz_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result_rows JSONB;
  cnt INT;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'غير مصرح');
  END IF;

  SELECT COUNT(*) INTO cnt
  FROM public.quiz_attempts
  WHERE quiz_id = p_quiz_id AND status = 'submitted';

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'attempt_id', a.id,
      'user_id', a.user_id,
      'full_name', COALESCE(p.full_name, p.name, ''),
      'email', COALESCE(p.email, ''),
      'score', a.score,
      'max_score', a.max_score,
      'percent', CASE WHEN COALESCE(a.max_score,0) > 0 THEN round((a.score / a.max_score) * 100) ELSE 0 END,
      'submitted_at', a.submitted_at,
      'started_at', a.started_at
    ) ORDER BY a.submitted_at DESC NULLS LAST
  ), '[]'::jsonb)
  INTO result_rows
  FROM public.quiz_attempts a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.quiz_id = p_quiz_id AND a.status = 'submitted';

  RETURN jsonb_build_object('ok', true, 'count', cnt, 'rows', result_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_quiz_attempt(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_quiz_result(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quiz_review(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_quiz_results(UUID) TO authenticated;

COMMIT;

-- ============================================================
-- بعد التنفيذ — أدمن أول مرة (عدّل الاسم والكود):
-- INSERT INTO public.student_codes (code, full_name, role)
-- VALUES ('20260001', 'محمود', 'admin')
-- ON CONFLICT DO NOTHING;
-- (لو فشل ON CONFLICT بسبب عدم وجود قيد على code استخدم INSERT عادي)
-- ثم:
--   npx supabase link --project-ref YOUR_REF
--   npx supabase functions deploy code-login --no-verify-jwt
-- ============================================================
