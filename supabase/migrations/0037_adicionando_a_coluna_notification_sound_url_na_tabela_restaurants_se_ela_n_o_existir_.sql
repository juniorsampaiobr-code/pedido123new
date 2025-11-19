DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'restaurants'
        AND column_name = 'notification_sound_url'
    ) THEN
        ALTER TABLE public.restaurants ADD COLUMN notification_sound_url TEXT;
    END IF;
END
$$;