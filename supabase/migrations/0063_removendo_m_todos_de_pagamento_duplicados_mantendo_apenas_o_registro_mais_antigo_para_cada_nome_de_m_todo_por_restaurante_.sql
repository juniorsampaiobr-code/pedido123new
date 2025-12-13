DELETE FROM public.payment_methods
WHERE id IN (
    SELECT id
    FROM (
        SELECT
            id,
            ROW_NUMBER() OVER (PARTITION BY restaurant_id, name ORDER BY created_at) as rn
        FROM
            public.payment_methods
    ) AS sub
    WHERE sub.rn > 1
);