import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

/**
 * Hook para verificar o status de autenticação do usuário.
 * @returns O objeto User do Supabase se estiver logado, ou null.
 */
export const useAuthStatus = () => {
  return useQuery<User | null>({
    queryKey: ['authStatus'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.user || null;
    },
    staleTime: Infinity,
  });
};