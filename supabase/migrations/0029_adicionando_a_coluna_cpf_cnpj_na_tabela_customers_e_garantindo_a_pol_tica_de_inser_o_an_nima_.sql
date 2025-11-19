-- Adiciona a coluna cpf_cnpj (se ainda não existir)
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;

-- Adiciona a coluna payment_method_id na tabela orders (se ainda não existir)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.payment_methods(id);

-- Cria a política de RLS para permitir que usuários anônimos insiram o cpf_cnpj (se ainda não existir)
-- Nota: A política 'Allow anonymous insert for checkout' já existe, mas vamos garantir que ela cubra a nova coluna.
-- Como a política de INSERT é 'WITH CHECK (true)', ela já permite a inserção de qualquer coluna.
-- Vamos apenas garantir que a política de SELECT para orders que usa payment_method_id exista.

-- Criando uma política de RLS para permitir que usuários autenticados vejam o método de pagamento (se ainda não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE policyname = 'Users can view their payment method' AND tablename = 'orders'
    ) THEN
        CREATE POLICY "Users can view their payment method" ON public.orders
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.customers
            WHERE customers.id = orders.customer_id AND customers.user_id = auth.uid()
          )
        );
    END IF;
END
$$;