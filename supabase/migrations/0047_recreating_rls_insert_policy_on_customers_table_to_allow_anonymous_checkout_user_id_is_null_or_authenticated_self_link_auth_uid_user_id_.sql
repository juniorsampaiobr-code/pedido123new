-- Drop existing policy if it exists to prevent conflicts
DROP POLICY IF EXISTS "Allow insert for checkout" ON public.customers;

-- Create the policy
CREATE POLICY "Allow insert for checkout" ON public.customers 
FOR INSERT WITH CHECK ((user_id IS NULL) OR (auth.uid() = user_id));