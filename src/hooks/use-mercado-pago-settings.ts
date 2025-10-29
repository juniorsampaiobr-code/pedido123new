import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type PaymentSettings = Tables<'payment_settings'>;

const fetchMercadoPagoPublicKey = async (): Promise<string | null> => {
  try {
    const { data: restaurantData, error: restaurantError } = await supabase
      .from('restaurants')
      .select('id')
      .limit(1)
      .single();

    if (restaurantError) {
      console.error('Erro ao buscar restaurante:', restaurantError);
      throw new Error(`Erro ao buscar restaurante: ${restaurantError.message}`);
    }
    
    if (!restaurantData) {
      console.error('Nenhum restaurante ativo encontrado');
      throw new Error('Nenhum restaurante ativo encontrado.');
    }

    const restaurantId = restaurantData.id;

    const { data: settings, error: settingsError } = await supabase
      .from('payment_settings')
      .select('mercado_pago_public_key')
      .eq('restaurant_id', restaurantId)
      .limit(1)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('Erro ao buscar configurações de pagamento:', settingsError);
      throw new Error(`Erro ao buscar configurações de pagamento: ${settingsError.message}`);
    }
    
    const publicKey = settings?.mercado_pago_public_key || null;
    console.log('Public Key encontrada:', publicKey ? 'Sim' : 'Não');
    
    return publicKey;
  } catch (error) {
    console.error('Erro em fetchMercadoPagoPublicKey:', error);
    throw error;
  }
};

export const useMercadoPagoPublicKey = () => {
  return useQuery<string | null>({
    queryKey: ['mercadoPagoPublicKey'],
    queryFn: fetchMercadoPagoPublicKey,
    staleTime: 1000 * 60 * 5, // 5 minutos
    retry: 2,
  });
};