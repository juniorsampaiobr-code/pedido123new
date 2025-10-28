ALTER TABLE public.delivery_zones
ADD COLUMN min_delivery_time_minutes INTEGER DEFAULT 0,
ADD COLUMN max_delivery_time_minutes INTEGER DEFAULT 0;