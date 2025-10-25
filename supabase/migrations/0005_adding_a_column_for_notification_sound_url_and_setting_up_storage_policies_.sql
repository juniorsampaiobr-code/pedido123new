-- Adiciona a coluna para armazenar a URL do som na tabela de restaurantes
ALTER TABLE public.restaurants ADD COLUMN notification_sound_url TEXT;

-- Cria uma política para permitir que qualquer pessoa leia os arquivos do bucket 'settings' (necessário para tocar o som)
CREATE POLICY "Public read access for settings" ON storage.objects
FOR SELECT USING (bucket_id = 'settings');

-- Cria políticas para permitir que usuários autenticados enviem e atualizem arquivos no bucket 'settings'
CREATE POLICY "Allow authenticated users to upload to settings" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'settings');

CREATE POLICY "Allow authenticated users to update their settings" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'settings');