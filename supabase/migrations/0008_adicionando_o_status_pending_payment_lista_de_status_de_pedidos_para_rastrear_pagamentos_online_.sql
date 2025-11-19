DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending_payment' AND enumtypid = 'public.order_status'::regtype) THEN
        ALTER TYPE public.order_status ADD VALUE 'pending_payment';
    END IF;
END$$;