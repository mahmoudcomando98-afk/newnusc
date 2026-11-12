-- مساعد COMANDO — التعرف الذكي على الجنس
-- عمود gender اختياري على profiles (null = معروف/محايد)
-- الاسم الأول يُستنتج تلقائيًا من أسماء شائعة، ولو الطالب عايز يظبطه يظبطه من صفحته
-- شغّل مرة واحدة على المشروع الجديد

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT
  CHECK (gender IN ('male', 'female'));

-- استنتاج الجنس من الاسم الأول (كلمات مصرية شائعة)
CREATE OR REPLACE FUNCTION private.infer_gender_from_name(name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  first text;
  trimmed text;
BEGIN
  IF name IS NULL THEN RETURN NULL; END IF;
  trimmed := btrim(name);
  IF trimmed = '' THEN RETURN NULL; END IF;
  -- الاسم المركب "نور الدين" = ذكر
  IF trimmed ~ '^نور\s+الدين' THEN RETURN 'male'; END IF;
  first := split_part(trimmed, ' ', 1);
  -- أحيانًا الاسم الأول يكون بالإنجليزية
  first := lower(first);

  IF first IN (
    'يوسف','عمر','احمد','أحمد','محمود','محمد','مروان','فارس','موسي','موسى','عبدالله','عبد الله','كريم','هشام',
    'حسن','حسين','حسين','اسامة','أسامة','عمار','عادل','زياد','علي','مصطفى','ابراهيم','إسماعيل','اسماعيل',
    'طارق','حسام','وائل','اسلام','إسلام','ايمن','أيمن','رامز','حمدي','صلاح','جمال','سعيد','ثروت','شريف',
    'عاصم','خالد','مدحت','اشرف','أشرف','هيثم','امين','أمين','صبحي','سامي','سامر','رامي','باسل',
    'جوزيف','مرقس','شنودة','بولس','بيشوى','ماريو','انطون','أنطون','امير','أمير','حنا','ريان','حمزه','حمزة',
    'adam','يوسفين','yosef','omar','ahmed','ahmad','mahmoud','mohamed','mohammed','marawan','kareem'
  ) THEN
    RETURN 'male';
  END IF;

  IF first IN (
    'ساره','سارة','سلمى','حنين','عائشه','عائشة','حبيبة','يارا','منار','منة','منه','نور',
    'مريم','هبة','هبه','هاجر','رانيا','ياسمين','رنا','دينا','ندى','شيماء','اسماء','أسماء',
    'ريم','جنى','جنان','سجى','اية','آية','روان','صبا','صفاء','دعاء','ملك','تقى','فريدة',
    'كارما','لارا','مايا','سمر','سما','نوران','رؤى','سلمى','سارة','هيام','جنى','رنا','شهد',
    'manar','sara','salma','hanin','habiba','yara','aya','mariam','noor','noura','dina','rana',
    'yasmin','hana','hanaa','رشا','رغد','وجدان','جنى'
  ) THEN
    RETURN 'female';
  END IF;

  RETURN NULL;
END;
$$;

-- ملء الموجودين دلوقتي
UPDATE public.profiles
SET gender = private.infer_gender_from_name(full_name)
WHERE gender IS NULL;

-- تريجر: أي طالب يسجل مستقبلاً يتكتب عليه النوع تلقائيًا لو اسمه معروف
CREATE OR REPLACE FUNCTION private.set_profile_gender()
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

DROP TRIGGER IF EXISTS trg_profiles_set_gender ON public.profiles;
CREATE TRIGGER trg_profiles_set_gender
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.set_profile_gender();

DROP TRIGGER IF EXISTS trg_profiles_update_gender ON public.profiles;
CREATE TRIGGER trg_profiles_update_gender
  BEFORE UPDATE OF full_name ON public.profiles
  FOR EACH ROW
  WHEN (OLD.gender IS NULL AND NEW.full_name IS DISTINCT FROM OLD.full_name)
  EXECUTE FUNCTION private.set_profile_gender();
