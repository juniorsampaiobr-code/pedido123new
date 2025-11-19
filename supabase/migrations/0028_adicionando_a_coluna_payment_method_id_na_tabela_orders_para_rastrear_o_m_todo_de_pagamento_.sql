ALTER TABLE public.orders
ADD COLUMN payment_method_id UUID REFERENCES public.payment_methods(id);

-- Criando uma política de RLS para permitir que usuários autenticados vejam o método de pagamento
CREATE POLICY "Users can view their payment method" ON public.orders
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customers
    WHERE customers.id = orders.customer_id AND customers.user_id = auth.uid()
  )
);