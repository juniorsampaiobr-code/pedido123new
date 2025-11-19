-- 1. Remove todas as políticas de UPDATE existentes na tabela restaurants
DROP POLICY IF EXISTS "Admins can manage restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "Allow authenticated users to update restaurants" ON public.restaurants;

-- 2. Cria uma política que permite a atualização por qualquer usuário autenticado (necessário para o painel de configurações)
CREATE POLICY "Allow authenticated users to update restaurants"
ON public.restaurants FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL);