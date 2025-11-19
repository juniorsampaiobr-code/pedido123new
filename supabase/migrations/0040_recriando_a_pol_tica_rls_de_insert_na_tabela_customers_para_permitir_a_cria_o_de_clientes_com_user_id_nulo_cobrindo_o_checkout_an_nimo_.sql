CREATE POLICY "Allow insert for anonymous checkout" ON public.customers 
FOR INSERT TO public 
WITH CHECK (user_id IS NULL);