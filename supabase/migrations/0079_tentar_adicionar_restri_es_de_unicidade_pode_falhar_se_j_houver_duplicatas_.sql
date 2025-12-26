DO $$
BEGIN
    BEGIN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_key UNIQUE (phone);
    EXCEPTION 
        WHEN duplicate_object THEN NULL; -- Constraint já existe
        WHEN unique_violation THEN NULL; -- Dados duplicados impedem a constraint
        WHEN OTHERS THEN NULL; -- Ignora outros erros para não travar
    END;
    
    BEGIN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_cpf_cnpj_key UNIQUE (cpf_cnpj);
    EXCEPTION 
        WHEN duplicate_object THEN NULL; -- Constraint já existe
        WHEN unique_violation THEN NULL; -- Dados duplicados impedem a constraint
        WHEN OTHERS THEN NULL; -- Ignora outros erros para não travar
    END;
END $$;