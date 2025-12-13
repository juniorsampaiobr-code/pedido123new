CREATE POLICY "Allow update for checkout" ON public.customers 
FOR UPDATE TO public 
USING (
  (user_id IS NULL) OR (auth.uid() = user_id)
);