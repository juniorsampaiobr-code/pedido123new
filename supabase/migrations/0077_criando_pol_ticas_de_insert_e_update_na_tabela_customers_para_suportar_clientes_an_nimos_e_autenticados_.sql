-- Política de INSERT: Permite inserir se for anônimo (user_id IS NULL) OU se for autenticado e o user_id for o seu próprio (auth.uid() = user_id)
CREATE POLICY "Allow insert for anonymous or self-authenticated" ON public.customers
FOR INSERT TO public
WITH CHECK (
  (auth.uid() IS NULL AND user_id IS NULL) OR (auth.uid() = user_id)
);

-- Política de UPDATE: Permite atualizar se for anônimo (user_id IS NULL) OU se for autenticado e o user_id for o seu próprio (auth.uid() = user_id)
CREATE POLICY "Allow update for anonymous or self-authenticated" ON public.customers
FOR UPDATE TO public
USING (
  (auth.uid() IS NULL AND user_id IS NULL) OR (auth.uid() = user_id)
)
WITH CHECK (
  (auth.uid() IS NULL AND user_id IS NULL) OR (auth.uid() = user_id)
);