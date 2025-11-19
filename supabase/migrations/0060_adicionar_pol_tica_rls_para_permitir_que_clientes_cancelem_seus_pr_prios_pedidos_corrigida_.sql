CREATE POLICY "Authenticated users can cancel their own orders" ON public.orders
FOR UPDATE TO authenticated
USING (
    -- Verifica se o usuário autenticado é o dono do pedido
    public.is_order_owner(id)
)
WITH CHECK (
    -- Permite a atualização APENAS se o novo status for 'cancelled'
    (status = 'cancelled'::public.order_status)
);