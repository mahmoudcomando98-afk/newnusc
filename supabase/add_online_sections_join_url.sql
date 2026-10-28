-- رابط دخول السكشن الأونلاين (يظهر على الرئيسية لما السكشن يبدأ، مش في صفحة الجدول)
ALTER TABLE public.online_sections
  ADD COLUMN IF NOT EXISTS join_url TEXT;
