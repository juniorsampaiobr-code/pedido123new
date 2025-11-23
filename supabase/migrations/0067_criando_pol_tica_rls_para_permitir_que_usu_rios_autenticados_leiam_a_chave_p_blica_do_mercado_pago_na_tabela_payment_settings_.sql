-- Remove a política existente para evitar conflitos
DROP POLICY IF EXISTS "Authenticated users can view their payment settings" ON public.payment_settings;

-- Permite que usuários autenticados leiam as configurações de pagamento
-- (Necessário para o frontend obter a chave pública do Mercado Pago)
CREATE POLICY "Allow authenticated read of payment settings" ON public.payment_settings 
FOR SELECT TO authenticated 
USING (
    EXISTS (
        SELECT 1 
        FROM public.restaurants 
        WHERE restaurants.id = payment_settings.restaurant_id
    )
);