-- 1. Drop existing policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;

-- 2. Create a policy to allow public read access to files in the 'avatars' bucket
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');