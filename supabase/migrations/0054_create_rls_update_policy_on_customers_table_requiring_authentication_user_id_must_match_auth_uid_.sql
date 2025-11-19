CREATE POLICY "Authenticated users can update their own customer data" ON public.customers 
FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);