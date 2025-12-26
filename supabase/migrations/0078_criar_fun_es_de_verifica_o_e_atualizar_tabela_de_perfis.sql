-- 1. Adicionar coluna cpf_cnpj na tabela profiles se não existir
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;

-- 2. Atualizar a função handle_new_user para salvar o cpf_cnpj vindo dos metadados
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, cpf_cnpj)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'cpf_cnpj'
  );
  RETURN NEW;
END;
$$;

-- 3. Criar função segura (RPC) para verificar duplicidade no frontend
CREATE OR REPLACE FUNCTION public.check_registration_data(phone_in text, cpf_cnpj_in text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  phone_exists boolean;
  cpf_exists boolean;
BEGIN
  -- Verifica se o telefone existe em qualquer perfil
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE phone = phone_in) INTO phone_exists;
  
  -- Verifica se o CPF/CNPJ existe (apenas se for fornecido)
  IF cpf_cnpj_in IS NOT NULL AND length(cpf_cnpj_in) > 0 THEN
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE cpf_cnpj = cpf_cnpj_in) INTO cpf_exists;
  ELSE
    cpf_exists := false;
  END IF;
  
  RETURN json_build_object(
    'phone_exists', phone_exists,
    'cpf_exists', cpf_exists
  );
END;
$$;

-- Permitir que usuários anônimos e logados chamem esta função
GRANT EXECUTE ON FUNCTION public.check_registration_data(text, text) TO anon, authenticated;