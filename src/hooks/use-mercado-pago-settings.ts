import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type PaymentSettings = Tables<'payment_settings'>;

const fetchMercadoPagoPublicKey = async (): Promise<string | null> => {
  const { data: restaurantData, error: restaurantError } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
    .single();

  if (restaurantError) throw new Error(`Erro ao buscar restaurante: ${restaurantError.message}`);
  if (!restaurantData) throw new Error('Nenhum restaurante ativo encontrado.');

  const { data: settings, error: settingsError } = await supabase
    .from('payment_settings')
    .select('mercado_pago_public_key')
    .eq('restaurant_id', restaurantData.id)
    .limit(1)
    .single();

  if (settingsError && settingsError.code !== 'PGRST116') throw new Error(settingsError.message);
  
  return settings?.mercado_pago_public_key || null;
};

export const useMercadoPagoPublicKey = () => {
  return useQuery<string | null>({
    queryKey: ['mercadoPagoPublicKey'],
    queryFn: fetchMercadoPagoPublicKey,
    staleTime: Infinity,
  });
};