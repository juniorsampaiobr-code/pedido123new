-- 1. Remove a política existente para evitar conflitos
DROP POLICY IF EXISTS "Allow anonymous insert for checkout" ON public.customers;

-- 2. Cria uma nova política que permite a inserção se o user_id for nulo (para checkout anônimo)
-- OU se o usuário for autenticado e estiver inserindo seu próprio user_id (embora o checkout não faça isso, é bom ter a opção)
CREATE POLICY "Allow insert for anonymous checkout" ON public.customers 
FOR INSERT TO anon, authenticated 
WITH CHECK (
  (auth.uid() IS NULL AND user_id IS NULL) OR 
  (auth.uid() IS NOT NULL AND user_id IS NULL) OR -- Permite que um admin logado crie um cliente anônimo
  (auth.uid() = user_id) -- Permite que um usuário logado crie um cliente associado a si mesmo
);