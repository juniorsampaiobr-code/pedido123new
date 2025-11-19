-- 1. Garante que o bucket 'settings' exista
INSERT INTO storage.buckets (id, name, public)
VALUES ('settings', 'settings', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Remove políticas antigas de leitura para evitar conflitos
DROP POLICY IF EXISTS "Allow authenticated users to read settings" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to settings" ON storage.objects;

-- 3. Cria política para permitir leitura pública (necessário para o áudio ser reproduzido no frontend)
CREATE POLICY "Allow public read access to settings"
ON storage.objects FOR SELECT
USING (bucket_id = 'settings');

-- 4. Cria política para permitir upload/update/delete por usuários autenticados (necessário para o Settings.tsx)
DROP POLICY IF EXISTS "Allow authenticated users to manage settings" ON storage.objects;
CREATE POLICY "Allow authenticated users to manage settings"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'settings');