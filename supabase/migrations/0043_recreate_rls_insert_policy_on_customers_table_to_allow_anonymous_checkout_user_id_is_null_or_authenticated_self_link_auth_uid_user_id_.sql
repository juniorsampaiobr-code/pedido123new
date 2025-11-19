CREATE POLICY "Allow insert for checkout" ON public.customers 
FOR INSERT TO public 
WITH CHECK (
  (user_id IS NULL) OR (auth.uid() = user_id)
);