-- دعم الجهازين للطالب + الجهاز الواحد للأدمن
-- شغّل مرة واحدة

ALTER TABLE public.student_codes
  ADD COLUMN IF NOT EXISTS device_ids text[] NOT NULL DEFAULT '{}';

-- نقل الربط الحالي للمصفوفة
UPDATE public.student_codes
SET device_ids = CASE
  WHEN device_id IS NULL OR btrim(device_id) = '' THEN '{}'::text[]
  ELSE ARRAY[device_id]
END
WHERE device_ids = '{}';
