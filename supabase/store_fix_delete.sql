-- إصلاح حذف قوالب المتجر لما يكون عليها طلبات
-- نفّذ في Supabase → SQL Editor

-- امسح القيد القديم (RESTRICT) وحوّله لـ CASCADE
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT tc.constraint_name INTO con_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'store_orders'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'product_id'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.store_orders DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.store_orders
  ADD CONSTRAINT store_orders_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES public.store_products(id)
  ON DELETE CASCADE;

-- تأكيد صلاحية الحذف للأدمن
GRANT DELETE ON public.store_products TO authenticated;
GRANT DELETE ON public.store_product_files TO authenticated;
GRANT DELETE ON public.store_orders TO authenticated;
