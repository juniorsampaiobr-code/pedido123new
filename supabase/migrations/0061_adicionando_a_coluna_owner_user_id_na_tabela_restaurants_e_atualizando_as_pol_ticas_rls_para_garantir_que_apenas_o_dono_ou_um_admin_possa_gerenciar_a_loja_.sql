-- 1. Adicionar a coluna owner_user_id
ALTER TABLE public.restaurants ADD COLUMN owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Atualizar a política de UPDATE para garantir que apenas o dono ou um admin possa atualizar
DROP POLICY IF EXISTS "Allow authenticated users to update restaurants" ON public.restaurants;

CREATE POLICY "Owners and Admins can update restaurants" ON public.restaurants 
FOR UPDATE TO authenticated USING (
  (auth.uid() = owner_user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- 3. Atualizar a política de SELECT para incluir o owner_user_id na verificação de admin
DROP POLICY IF EXISTS "Anyone can view active restaurants" ON public.restaurants;

CREATE POLICY "Public view active or owner/admin view all" ON public.restaurants 
FOR SELECT USING (
  (is_active = true) OR (auth.uid() = owner_user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- 4. Adicionar políticas de INSERT/DELETE para garantir que apenas admins possam criar/deletar, ou o owner possa deletar sua própria loja
DROP POLICY IF EXISTS "Admins can insert restaurants" ON public.restaurants; -- Dropping if it exists from previous context

CREATE POLICY "Admins can insert restaurants" ON public.restaurants 
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Owners and Admins can delete restaurants" ON public.restaurants 
FOR DELETE TO authenticated USING (
  (auth.uid() = owner_user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)
);