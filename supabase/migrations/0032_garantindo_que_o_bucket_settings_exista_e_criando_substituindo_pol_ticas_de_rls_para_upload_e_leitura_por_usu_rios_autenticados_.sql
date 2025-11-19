-- 1. Garante que o bucket 'settings' exista
INSERT INTO storage.buckets (id, name, public)
VALUES ('settings', 'settings', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Cria política para permitir que usuários autenticados façam upload (INSERT)
DROP POLICY IF EXISTS "Allow authenticated users to upload to settings" ON storage.objects;
CREATE POLICY "Allow authenticated users to upload to settings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'settings' AND auth.uid() IS NOT NULL);

-- 3. Cria política para permitir que usuários autenticados atualizem (UPDATE/UPSERT)
DROP POLICY IF EXISTS "Allow authenticated users to update settings" ON storage.objects;
CREATE POLICY "Allow authenticated users to update settings"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'settings' AND auth.uid() IS NOT NULL);

-- 4. Cria política para permitir que usuários autenticados leiam (SELECT)
DROP POLICY IF EXISTS "Allow authenticated users to read settings" ON storage.objects;
CREATE POLICY "Allow authenticated users to read settings"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'settings' AND auth.uid() IS NOT NULL);