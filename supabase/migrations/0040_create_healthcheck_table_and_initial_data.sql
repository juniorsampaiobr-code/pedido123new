-- Criar a tabela healthcheck
CREATE TABLE public.healthcheck (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ativar RLS (Segurança)
ALTER TABLE public.healthcheck ENABLE ROW LEVEL SECURITY;

-- Criar política para permitir leitura pública (usando a anon key)
CREATE POLICY "Allow public read access" ON public.healthcheck
FOR SELECT USING (true);

-- Inserir linha inicial
INSERT INTO public.healthcheck DEFAULT VALUES;