import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook para buscar o ID do restaurante ativo (o mais recente).
 * @returns O ID do restaurante ativo ou null.
 */
const fetchActiveRestaurantId = async (): Promise<string | null> => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error("Error fetching active restaurant ID:", error);
    return null;
  }
  return data?.id || null;
};

export const useActiveRestaurantId = () => {
  return useQuery<string | null>({
    queryKey: ['activeRestaurantId'],
    queryFn: fetchActiveRestaurantId,
    staleTime: Infinity,
  });
};