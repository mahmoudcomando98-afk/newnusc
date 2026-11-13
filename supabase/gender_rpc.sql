-- RPC للأدمن: تعديل جنس الطالب من صفحة الأكواد مع مزامنة البروفايل فورًا

CREATE OR REPLACE FUNCTION public.admin_set_code_gender(p_code_id uuid, p_gender text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked uuid;
BEGIN
  IF NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'مفيش صلاحية' USING ERRCODE = '42501';
  END IF;
  IF p_gender IS NOT NULL AND p_gender NOT IN ('male', 'female') THEN
    RAISE EXCEPTION 'قيمة الجنس غلط' USING ERRCODE = '22023';
  END IF;

  UPDATE public.student_codes
  SET gender = p_gender, updated_at = now()
  WHERE id = p_code_id
  RETURNING linked_user_id INTO v_linked;

  IF v_linked IS NOT NULL THEN
    UPDATE public.profiles SET gender = p_gender WHERE id = v_linked;
  END IF;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_code_gender(uuid, text) TO authenticated;
