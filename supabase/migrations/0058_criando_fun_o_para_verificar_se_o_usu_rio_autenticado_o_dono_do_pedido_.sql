CREATE OR REPLACE FUNCTION public.is_order_owner(order_id_in uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.customers c
        WHERE c.id = (SELECT o.customer_id FROM public.orders o WHERE o.id = order_id_in)
          AND c.user_id = auth.uid()
    );
$$;