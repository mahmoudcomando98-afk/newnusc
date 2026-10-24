-- ============================================================
-- NUSC Student Hub - Row Level Security Policies
-- تنفيذ هذا الملف بعد schema.sql
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- subjects
DROP POLICY IF EXISTS "Anyone authenticated can view published subjects" ON public.subjects;
CREATE POLICY "Anyone authenticated can view published subjects" ON public.subjects FOR SELECT
  USING (is_published = true OR public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Admins can manage subjects" ON public.subjects;
CREATE POLICY "Admins can manage subjects" ON public.subjects FOR ALL
  USING (public.is_admin_or_moderator()) WITH CHECK (public.is_admin_or_moderator());

-- lectures
DROP POLICY IF EXISTS "Anyone authenticated can view published lectures" ON public.lectures;
CREATE POLICY "Anyone authenticated can view published lectures" ON public.lectures FOR SELECT
  USING (is_published = true OR public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Admins can manage lectures" ON public.lectures;
CREATE POLICY "Admins can manage lectures" ON public.lectures FOR ALL
  USING (public.is_admin_or_moderator()) WITH CHECK (public.is_admin_or_moderator());

-- materials
DROP POLICY IF EXISTS "Anyone authenticated can view published materials" ON public.materials;
CREATE POLICY "Anyone authenticated can view published materials" ON public.materials FOR SELECT
  USING (is_published = true OR public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Admins can manage materials" ON public.materials;
CREATE POLICY "Admins can manage materials" ON public.materials FOR ALL
  USING (public.is_admin_or_moderator()) WITH CHECK (public.is_admin_or_moderator());

-- quizzes
DROP POLICY IF EXISTS "Anyone authenticated can view published quizzes" ON public.quizzes;
CREATE POLICY "Anyone authenticated can view published quizzes" ON public.quizzes FOR SELECT
  USING (is_published = true OR public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Admins can manage quizzes" ON public.quizzes;
CREATE POLICY "Admins can manage quizzes" ON public.quizzes FOR ALL
  USING (public.is_admin_or_moderator()) WITH CHECK (public.is_admin_or_moderator());

-- quiz_rules
DROP POLICY IF EXISTS "Anyone authenticated can view published quiz rules" ON public.quiz_rules;
CREATE POLICY "Anyone authenticated can view published quiz rules" ON public.quiz_rules FOR SELECT
  USING (is_published = true OR public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Admins can manage quiz rules" ON public.quiz_rules;
CREATE POLICY "Admins can manage quiz rules" ON public.quiz_rules FOR ALL
  USING (public.is_admin_or_moderator()) WITH CHECK (public.is_admin_or_moderator());

-- schedules
DROP POLICY IF EXISTS "Anyone authenticated can view published schedules" ON public.schedules;
CREATE POLICY "Anyone authenticated can view published schedules" ON public.schedules FOR SELECT
  USING (is_published = true OR public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Admins can manage schedules" ON public.schedules;
CREATE POLICY "Admins can manage schedules" ON public.schedules FOR ALL
  USING (public.is_admin_or_moderator()) WITH CHECK (public.is_admin_or_moderator());

-- announcements
DROP POLICY IF EXISTS "Anyone authenticated can view published announcements" ON public.announcements;
CREATE POLICY "Anyone authenticated can view published announcements" ON public.announcements FOR SELECT
  USING ((is_published = true AND (expires_at IS NULL OR expires_at > NOW())) OR public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;
CREATE POLICY "Admins can manage announcements" ON public.announcements FOR ALL
  USING (public.is_admin_or_moderator()) WITH CHECK (public.is_admin_or_moderator());

-- notifications
DROP POLICY IF EXISTS "Users can view own and global notifications" ON public.notifications;
CREATE POLICY "Users can view own and global notifications" ON public.notifications FOR SELECT
  USING (user_id = auth.uid() OR is_global = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins can manage notifications" ON public.notifications;
CREATE POLICY "Admins can manage notifications" ON public.notifications FOR ALL
  USING (public.is_admin_or_moderator()) WITH CHECK (public.is_admin_or_moderator());

-- notification_reads
DROP POLICY IF EXISTS "Users can manage own notification reads" ON public.notification_reads;
CREATE POLICY "Users can manage own notification reads" ON public.notification_reads FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- favorites
DROP POLICY IF EXISTS "Users can manage own favorites" ON public.favorites;
CREATE POLICY "Users can manage own favorites" ON public.favorites FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- faq
DROP POLICY IF EXISTS "Anyone authenticated can view published faq" ON public.faq;
CREATE POLICY "Anyone authenticated can view published faq" ON public.faq FOR SELECT
  USING (is_published = true OR public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Admins can manage faq" ON public.faq;
CREATE POLICY "Admins can manage faq" ON public.faq FOR ALL
  USING (public.is_admin_or_moderator()) WITH CHECK (public.is_admin_or_moderator());

-- reports
DROP POLICY IF EXISTS "Users can insert own reports" ON public.reports;
CREATE POLICY "Users can insert own reports" ON public.reports FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own reports" ON public.reports;
CREATE POLICY "Users can view own reports" ON public.reports FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins can manage reports" ON public.reports;
CREATE POLICY "Admins can manage reports" ON public.reports FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- platform_settings
-- Public read is intentional: logo, site name and maintenance flag are needed
-- on unauthenticated pages (login / register / maintenance notice).
DROP POLICY IF EXISTS "Anyone authenticated can read settings" ON public.platform_settings;
DROP POLICY IF EXISTS "Public can read platform settings" ON public.platform_settings;
CREATE POLICY "Public can read platform settings" ON public.platform_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage settings" ON public.platform_settings;
CREATE POLICY "Admins can manage settings" ON public.platform_settings FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- audit_logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT
  WITH CHECK (true);
