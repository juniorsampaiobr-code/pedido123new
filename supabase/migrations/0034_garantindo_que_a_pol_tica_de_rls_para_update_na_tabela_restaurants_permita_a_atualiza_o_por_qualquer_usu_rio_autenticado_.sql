-- Remove a política anterior para evitar conflitos
DROP POLICY IF EXISTS "Allow authenticated users to update restaurants" ON public.restaurants;

-- Cria uma política que permite a atualização por qualquer usuário autenticado (necessário para o painel de configurações)
CREATE POLICY "Allow authenticated users to update restaurants"
ON public.restaurants FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL);