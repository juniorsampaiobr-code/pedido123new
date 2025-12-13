-- Drop existing policy if it exists to prevent conflicts
DROP POLICY IF EXISTS "Allow update for checkout" ON public.customers;

-- Create the policy
CREATE POLICY "Allow update for checkout" ON public.customers 
FOR UPDATE USING ((user_id IS NULL) OR (auth.uid() = user_id)) 
WITH CHECK ((user_id IS NULL) OR (auth.uid() = user_id));