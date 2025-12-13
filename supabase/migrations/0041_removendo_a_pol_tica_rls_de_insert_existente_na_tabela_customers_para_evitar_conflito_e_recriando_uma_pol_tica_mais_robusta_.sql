-- Remove a política de checkout anônimo
DROP POLICY IF EXISTS "Allow insert for anonymous checkout" ON public.customers;

-- Remove a política antiga de insert anônimo (se ainda existir)
DROP POLICY IF EXISTS "Allow anonymous insert for checkout" ON public.customers;

-- Cria uma política que permite a inserção se:
-- 1. O user_id for nulo (checkout anônimo)
-- 2. OU o user_id for o ID do usuário logado (se o app for atualizado para isso)
CREATE POLICY "Allow insert for all customer types" ON public.customers 
FOR INSERT TO public 
WITH CHECK (
  (user_id IS NULL) OR 
  (auth.uid() = user_id)
);