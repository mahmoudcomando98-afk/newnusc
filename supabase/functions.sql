-- ============================================================
-- NUSC Student Hub - Helper Functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_unread_notifications_count(p_user_id UUID DEFAULT auth.uid())
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.notifications n
  WHERE (n.user_id = p_user_id OR n.is_global = true)
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_reads nr
      WHERE nr.notification_id = n.id AND nr.user_id = p_user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_reads (notification_id, user_id)
  VALUES (p_notification_id, auth.uid())
  ON CONFLICT (notification_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_reads (notification_id, user_id)
  SELECT n.id, auth.uid()
  FROM public.notifications n
  WHERE (n.user_id = auth.uid() OR n.is_global = true)
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_reads nr
      WHERE nr.notification_id = n.id AND nr.user_id = auth.uid()
    )
  ON CONFLICT (notification_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_download_count(p_material_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.materials
  SET download_count = download_count + 1
  WHERE id = p_material_id AND is_published = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_view_count(p_material_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.materials
  SET view_count = view_count + 1
  WHERE id = p_material_id AND is_published = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_content(
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  result_type TEXT,
  result_id UUID,
  title TEXT,
  description TEXT,
  subject_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  (
    SELECT 'subject'::TEXT, s.id, s.name, s.description, NULL::TEXT, s.created_at
    FROM public.subjects s
    WHERE s.is_published = true
      AND (s.name ILIKE '%' || p_query || '%' OR s.code ILIKE '%' || p_query || '%' OR s.description ILIKE '%' || p_query || '%')
    LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'lecture'::TEXT, l.id, l.title, l.description, s.name, l.created_at
    FROM public.lectures l
    JOIN public.subjects s ON s.id = l.subject_id
    WHERE l.is_published = true AND s.is_published = true
      AND (l.title ILIKE '%' || p_query || '%' OR l.description ILIKE '%' || p_query || '%')
    LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'material'::TEXT, m.id, m.title, m.description, s.name, m.created_at
    FROM public.materials m
    LEFT JOIN public.subjects s ON s.id = m.subject_id
    WHERE m.is_published = true
      AND (m.title ILIKE '%' || p_query || '%' OR m.description ILIKE '%' || p_query || '%' OR m.file_name ILIKE '%' || p_query || '%')
    LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'announcement'::TEXT, a.id, a.title, LEFT(a.content, 200), s.name, a.created_at
    FROM public.announcements a
    LEFT JOIN public.subjects s ON s.id = a.subject_id
    WHERE a.is_published = true AND (a.expires_at IS NULL OR a.expires_at > NOW())
      AND (a.title ILIKE '%' || p_query || '%' OR a.content ILIKE '%' || p_query || '%')
    LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'quiz'::TEXT, q.id, q.title, q.description, s.name, q.created_at
    FROM public.quizzes q
    LEFT JOIN public.subjects s ON s.id = q.subject_id
    WHERE q.is_published = true
      AND (q.title ILIKE '%' || p_query || '%' OR q.topics ILIKE '%' || p_query || '%')
    LIMIT p_limit
  );
END;
$$;
