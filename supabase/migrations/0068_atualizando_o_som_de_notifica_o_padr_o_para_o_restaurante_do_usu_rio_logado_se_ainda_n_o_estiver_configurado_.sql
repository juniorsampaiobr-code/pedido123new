DO $$
DECLARE
    user_rest_id UUID;
    default_sound_url TEXT := '/default-notification.mp3';
BEGIN
    -- 1. Encontrar o ID do restaurante vinculado ao usuário logado (auth.uid())
    SELECT restaurant_id INTO user_rest_id
    FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'moderator')
    LIMIT 1;

    -- 2. Se o ID do restaurante for encontrado, atualizar a URL do som se estiver nula
    IF user_rest_id IS NOT NULL THEN
        UPDATE public.restaurants
        SET notification_sound_url = default_sound_url
        WHERE id = user_rest_id
        AND notification_sound_url IS NULL;
    END IF;
END $$;