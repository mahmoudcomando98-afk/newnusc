-- حالة تم التسليم للواجبات
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS is_delivered BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.materials.is_delivered IS 'Assignment marked as submitted/closed by admin';
