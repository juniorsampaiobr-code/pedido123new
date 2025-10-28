ALTER TABLE public.delivery_zones
ADD COLUMN price_per_km NUMERIC DEFAULT 0;

ALTER TABLE public.delivery_zones
DROP COLUMN min_delivery_time_minutes,
DROP COLUMN max_delivery_time_minutes,
DROP COLUMN name;