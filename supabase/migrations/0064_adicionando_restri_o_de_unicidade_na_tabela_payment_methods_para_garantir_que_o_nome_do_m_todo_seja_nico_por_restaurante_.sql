ALTER TABLE public.payment_methods
ADD CONSTRAINT unique_restaurant_method UNIQUE (restaurant_id, name);