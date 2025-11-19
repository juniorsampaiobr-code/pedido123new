UPDATE public.payment_methods
SET 
  name = 'Pagamento online: Pix/Cartão',
  description = 'Pagamento online via Mercado Pago (Pix, Cartão de Crédito, etc.)',
  icon = 'CreditCard'
WHERE 
  name IN ('PIX', 'Pagamento online: Pix/Cartão');