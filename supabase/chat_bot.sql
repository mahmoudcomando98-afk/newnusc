-- دردشة الدفعة — البوت + تعديل/مسح + حظر الشتايم

-- ١) تعديل الرسايل: وقت آخر تعديل
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- ٢) عدد المخالفات لكل مستخدم + نهاية الحظر
CREATE TABLE IF NOT EXISTS public.chat_strikes (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  strikes int NOT NULL DEFAULT 0,
  banned_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_strikes ENABLE ROW LEVEL SECURITY; -- مفيش سياسات: service role بس

-- ٣) "حذف لي فقط" — إخفاء رسالة عند مستخدم معيّن
CREATE TABLE IF NOT EXISTS public.chat_message_hides (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
ALTER TABLE public.chat_message_hides ENABLE ROW LEVEL SECURITY;

-- ٤) حساب البوت (مستخدم وهمي — مفيش لوجين، رسالته بتتكتب من سيرفر الشات بس)
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at
)
VALUES (
  '00000000-0000-4000-8000-00000000000b',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'bot@comando.local',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"بوت COMANDO"}'::jsonb,
  false, now(), now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, email, role, is_active)
VALUES ('00000000-0000-4000-8000-00000000000b', 'بوت COMANDO', 'bot@comando.local', 'student', true)
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name, is_active = true;
