ALTER TABLE public.delivery_zones
ADD COLUMN center_latitude NUMERIC,
ADD COLUMN center_longitude NUMERIC;

-- Atualizando a política de RLS para garantir que as novas colunas sejam seguras (embora as políticas existentes já cubram todas as colunas).
-- Não é necessário alterar as políticas existentes, pois elas usam 'TO authenticated' ou 'true'.