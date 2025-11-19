-- 1. Enable RLS on the 'avatars' bucket (if not already enabled)
-- NOTE: This step might require elevated permissions (owner/service_role).
-- If it fails, proceed to step 2 and 3.
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;

-- 3. Create a policy to allow public read access to files in the 'avatars' bucket
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');