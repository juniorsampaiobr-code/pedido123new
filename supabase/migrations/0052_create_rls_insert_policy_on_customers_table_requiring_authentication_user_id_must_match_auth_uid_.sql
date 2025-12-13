CREATE POLICY "Authenticated users can insert their own customer data" ON public.customers 
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);