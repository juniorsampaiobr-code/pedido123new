-- Drop existing policy if it exists to prevent conflicts
DROP POLICY IF EXISTS "Allow insert for checkout" ON public.customers;

-- Create the policy with explicit checks
CREATE POLICY "Allow insert for checkout" ON public.customers 
FOR INSERT WITH CHECK (
    -- Authenticated users can insert their own ID or NULL
    (auth.uid() IS NOT NULL AND (user_id IS NULL OR auth.uid() = user_id))
    OR
    -- Anonymous users MUST insert user_id as NULL
    (auth.uid() IS NULL AND user_id IS NULL)
);