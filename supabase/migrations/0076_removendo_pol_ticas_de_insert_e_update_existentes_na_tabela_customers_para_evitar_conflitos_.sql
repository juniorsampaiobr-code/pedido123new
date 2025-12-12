-- Remove políticas de INSERT e UPDATE existentes
DROP POLICY IF EXISTS "Authenticated users can insert their own customer data" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can update their own customer data" ON public.customers;
DROP POLICY IF EXISTS "Allow insert for anonymous or self-authenticated" ON public.customers;
DROP POLICY IF EXISTS "Allow update for anonymous or self-authenticated" ON public.customers;