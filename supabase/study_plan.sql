-- خطتي — جدول مهام المذاكرة الشخصي لكل طالب
CREATE TABLE IF NOT EXISTS public.study_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  task_type text NOT NULL DEFAULT 'study' CHECK (task_type IN ('study','solve','review','exam','other')),
  due_at timestamptz NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_tasks_user_due_idx
  ON public.study_tasks (user_id, due_at)
  WHERE NOT is_done;

CREATE INDEX IF NOT EXISTS study_tasks_user_done_idx
  ON public.study_tasks (user_id, done_at)
  WHERE is_done;

ALTER TABLE public.study_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_study_tasks_all" ON public.study_tasks;
CREATE POLICY "own_study_tasks_all"
  ON public.study_tasks FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_tasks TO authenticated;
GRANT ALL ON public.study_tasks TO service_role;
