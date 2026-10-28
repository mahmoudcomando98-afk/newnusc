-- أرقام واتساب اختيارية للطلاب (موافقة صريحة)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.whatsapp_phone IS 'E.164 like 2010xxxxxxxx without +';
COMMENT ON COLUMN public.profiles.whatsapp_opt_in IS 'Student consented to WhatsApp notifications';

-- الطلاب يعدّلوا رقمهم وموافقتهم فقط
-- (يعتمد على سياسات profiles الحالية لـ UPDATE صفّه)
