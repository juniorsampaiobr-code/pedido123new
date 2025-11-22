import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { useQueryClient } from '@tanstack/react-query';

type BusinessHour = Tables<'business_hours'>;

/**
 * Hook para obter e manter os horários de funcionamento em tempo real.
 * @param restaurantId O ID do restaurante para monitorar.
 * @returns A lista de BusinessHour.
 */
export const useBusinessHoursRealtime = (restaurantId: string | undefined) => {
  const queryClient = useQueryClient();
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  // 1. Função para buscar os dados iniciais (fallback)
  const fetchInitialHours = async (id: string) => {
    const { data, error } = await supabase
      .from('business_hours')
      .select('*')
      .eq('restaurant_id', id)
      .order('day_of_week', { ascending: true });

    if (error) {
      console.error("Error fetching initial business hours:", error);
      setIsError(true);
      return [];
    }
    return data;
  };

  // 2. Efeito para gerenciar a subscrição Realtime
  useEffect(() => {
    if (!restaurantId) {
      setIsLoading(false);
      return;
    }
    
    let isMounted = true;
    
    // Busca inicial
    fetchInitialHours(restaurantId).then(initialHours => {
      if (isMounted) {
        setHours(initialHours);
        setIsLoading(false);
      }
    });

    // Configura a subscrição Realtime
    const channel = supabase.channel(`business_hours_changes_${restaurantId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'business_hours',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        (payload) => {
          console.log('[Realtime] Business Hours change detected:', payload.eventType);
          
          // Invalida a query de cache do TanStack Query (usada no Dashboard)
          queryClient.invalidateQueries({ queryKey: ['businessHours', restaurantId] });
          
          // Força o re-fetch dos dados para garantir a consistência após a mudança
          fetchInitialHours(restaurantId).then(updatedHours => {
            if (isMounted) {
              setHours(updatedHours);
            }
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscribed to business_hours for ${restaurantId}`);
        }
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [restaurantId, queryClient]);

  return { hours, isLoading, isError };
};