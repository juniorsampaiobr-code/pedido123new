ALTER TABLE public.payment_settings
ADD CONSTRAINT payment_settings_restaurant_id_key UNIQUE (restaurant_id);