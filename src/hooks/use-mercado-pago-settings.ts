import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type PaymentSettings = Tables<'payment_settings'>;

const fetchMercadoPagoPublicKey = async (restaurantId: string): Promise<string | null> => {
  // 1. Get payment settings for the specific restaurant ID
  const { data: settings, error: settingsError } = await supabase
    .from('payment_settings')
    .select('mercado_pago_public_key')
    .eq('restaurant_id', restaurantId)
    .limit(1)
    .single();

  if (settingsError && settingsError.code !== 'PGRST116') { // PGRST116 = No rows found
    throw new Error(`Error fetching payment settings: ${settingsError.message}`);
  }

  return settings?.mercado_pago_public_key || null;
};

export const useMercadoPagoPublicKey = (restaurantId: string | undefined) => {
  return useQuery<string | null>({
    queryKey: ['mercadoPagoPublicKey', restaurantId],
    queryFn: () => fetchMercadoPagoPublicKey(restaurantId!),
    enabled: !!restaurantId, // Só executa se o ID do restaurante estiver disponível
    staleTime: 1000 * 60 * 60 * 24, // Otimização: 24 horas (Chave só muda manualmente)
  });
};