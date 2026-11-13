-- الأكواد + الجنس: التخزين على student_codes عشان الأدمن يقدر يحدده قبل دخول الطالب
-- شغّل مرة واحدة على المشروع الجديد

ALTER TABLE public.student_codes ADD COLUMN IF NOT EXISTS gender TEXT
  CHECK (gender IN ('male', 'female'));

-- تريجر: أي كود جديد (استيراد/إضافة يدوية) ياخد نوعه من الاسم لو ما اتحددش يدويًا
CREATE OR REPLACE FUNCTION private.set_code_gender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.gender IS NULL THEN
    NEW.gender := private.infer_gender_from_name(NEW.full_name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_codes_gender_insert ON public.student_codes;
CREATE TRIGGER trg_codes_gender_insert
  BEFORE INSERT ON public.student_codes
  FOR EACH ROW EXECUTE FUNCTION private.set_code_gender();

DROP TRIGGER IF EXISTS trg_codes_gender_update ON public.student_codes;
CREATE TRIGGER trg_codes_gender_update
  BEFORE UPDATE OF full_name ON public.student_codes
  FOR EACH ROW
  WHEN (OLD.gender IS NULL AND NEW.full_name IS DISTINCT FROM OLD.full_name)
  EXECUTE FUNCTION private.set_code_gender();

-- ملء الأكواد الموجودين
UPDATE public.student_codes
SET gender = private.infer_gender_from_name(full_name)
WHERE gender IS NULL;

-- البروفايل يفضل بياخد النوع من الكود لو موجود (لما الطالب يدخل أول مرة)
CREATE OR REPLACE FUNCTION private.set_profile_gender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.gender IS NULL THEN
    NEW.gender := COALESCE(
      (SELECT sc.gender FROM public.student_codes sc
        WHERE sc.linked_user_id = NEW.id AND sc.gender IS NOT NULL
        LIMIT 1),
      (SELECT sc.gender FROM public.student_codes sc
        WHERE regexp_replace(btrim(lower(sc.full_name)), '\s+', ' ', 'g')
            = regexp_replace(btrim(lower(NEW.full_name)), '\s+', ' ', 'g')
          AND sc.gender IS NOT NULL
        ORDER BY sc.created_at DESC
        LIMIT 1),
      private.infer_gender_from_name(NEW.full_name)
    );
  END IF;
  RETURN NEW;
END;
$$;
