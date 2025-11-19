SELECT 'MERCADO_PAGO_ACCESS_TOKEN' as secret_name, 
       CASE 
         WHEN 'MERCADO_PAGO_ACCESS_TOKEN' IS NOT NULL THEN 'Configurado'
         ELSE 'Não configurado'
       END as status;