-- 1. Cria o bucket 'settings' se ele não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('settings', 'settings', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Permite que usuários autenticados façam upload (INSERT) no bucket 'settings'
CREATE POLICY "Allow authenticated users to upload notification sounds"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'settings');

-- 3. Permite que usuários autenticados leiam (SELECT) do bucket 'settings'
CREATE POLICY "Allow authenticated users to read notification sounds"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'settings');

-- 4. Permite que usuários autenticados atualizem (UPDATE) no bucket 'settings' (para upsert)
CREATE POLICY "Allow authenticated users to update notification sounds"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'settings');