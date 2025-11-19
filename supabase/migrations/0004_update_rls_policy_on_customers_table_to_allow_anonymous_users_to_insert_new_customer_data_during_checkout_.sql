-- Drop the existing policy that might be implicitly restricting anonymous inserts
DROP POLICY IF EXISTS "Users can create their customer profile" ON public.customers;

-- Create a new policy allowing anyone to insert customer data (since this is a public checkout flow)
CREATE POLICY "Allow anonymous insert for checkout" ON public.customers 
FOR INSERT WITH CHECK (true);