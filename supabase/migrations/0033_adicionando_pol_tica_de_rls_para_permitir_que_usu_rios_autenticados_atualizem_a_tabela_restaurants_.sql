-- Permite que usuários autenticados atualizem a tabela restaurants
DROP POLICY IF EXISTS "Allow authenticated users to update restaurants" ON public.restaurants;
CREATE POLICY "Allow authenticated users to update restaurants"
ON public.restaurants FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL);