ALTER TABLE public.user_roles
ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE SET NULL;