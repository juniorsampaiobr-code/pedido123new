import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type PaymentSettings = Tables<'payment_settings'>;

const fetchMercadoPagoPublicKey = async (): Promise<string | null> => {
  // 1. Get restaurant ID
  const { data: restaurantData, error: restaurantError } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
    .single();

  if (restaurantError || !restaurantData) {
    console.error("Failed to fetch restaurant ID for payment settings.");
    return null;
  }

  const restaurantId = restaurantData.id;

  // 2. Get payment settings
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

export const useMercadoPagoPublicKey = () => {
  return useQuery<string | null>({
    queryKey: ['mercadoPagoPublicKey'],
    queryFn: fetchMercadoPagoPublicKey,
    staleTime: Infinity, // Key should only change manually via settings
  });
};