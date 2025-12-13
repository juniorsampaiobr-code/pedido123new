-- Atualiza a função handle_new_user para NÃO atribuir role automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Apenas insere o perfil básico do usuário
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone'
  );
  
  -- NÃO insere role automaticamente - isso será feito pela Edge Function ensure-admin-access
  
  RETURN NEW;
END;
$function$;