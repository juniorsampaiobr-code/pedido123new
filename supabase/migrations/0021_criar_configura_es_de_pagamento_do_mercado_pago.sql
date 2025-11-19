-- Substitua 'RESTAURANT_ID_AQUI' pelo ID real do restaurante
INSERT INTO payment_settings (restaurant_id, mercado_pago_public_key)
VALUES (
  (SELECT id FROM restaurants LIMIT 1),
  'TEST-7d946054-952e-4831-b08a-7306683fb47e'
)
ON CONFLICT (restaurant_id) 
DO UPDATE SET 
  mercado_pago_public_key = 'TEST-7d946054-952e-4831-b08a-7306683fb47e';