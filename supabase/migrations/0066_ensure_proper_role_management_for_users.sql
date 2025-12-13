-- Create a function to check if a user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$function$;

-- Create a function to check if the order belongs to the authenticated user
CREATE OR REPLACE FUNCTION public.is_order_owner(order_id_in uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.customers c
        WHERE c.id = (SELECT o.customer_id FROM public.orders o WHERE o.id = order_id_in)
          AND c.user_id = auth.uid()
    );
$function$;