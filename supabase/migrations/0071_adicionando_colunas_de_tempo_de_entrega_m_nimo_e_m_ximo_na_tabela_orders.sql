ALTER TABLE public.orders
ADD COLUMN min_delivery_time_minutes INTEGER,
ADD COLUMN max_delivery_time_minutes INTEGER;