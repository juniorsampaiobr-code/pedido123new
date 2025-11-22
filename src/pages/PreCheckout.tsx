import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useCart } from '@/hooks/use-cart';

// Hook para verificar o status de autenticação
const useAuthStatus = () => {
  return useQuery({
    queryKey: ['authStatus'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.user || null;
    },
    staleTime: Infinity,
  });
};

// Novo hook para buscar o ID do restaurante ativo (o mais recente)
const useActiveRestaurantId = () => {
  return useQuery<string | null>({
    queryKey: ['activeRestaurantId'],
    queryFn: async () => {
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
    },
    staleTime: Infinity,
  });
};

const PreCheckout = () => {
  const navigate = useNavigate();
  const { data: user, isLoading: isLoadingAuth } = useAuthStatus();
  const { data: restaurantId, isLoading: isLoadingRestaurantId } = useActiveRestaurantId();
  const { totalItems } = useCart();

  // Centralize toda a lógica de navegação no useEffect
  useEffect(() => {
    if (totalItems === 0) {
      // Carrinho vazio, volta para o menu (usando o ID encontrado)
      if (restaurantId) {
        navigate(`/menu/${restaurantId}`, { replace: true });
      } else if (!isLoadingRestaurantId) {
        // Se não encontrar ID, volta para a raiz
        navigate('/', { replace: true });
      }
      return;
    }
    
    if (!isLoadingAuth && !isLoadingRestaurantId) {
      if (user) {
        // Usuário logado, prossegue para o checkout
        navigate('/checkout', { replace: true });
      } else {
        // Usuário não logado, redireciona para autenticação, passando o estado de onde veio
        navigate('/auth', { state: { from: '/checkout' }, replace: true });
      }
    }
  }, [totalItems, user, isLoadingAuth, isLoadingRestaurantId, navigate, restaurantId]);

  // Renderização de fallback enquanto a navegação está pendente
  if (isLoadingAuth || isLoadingRestaurantId || totalItems === 0) {
    return <LoadingSpinner />;
  }

  // Se chegarmos aqui, significa que !isLoading e !user, e estamos aguardando o useEffect redirecionar para /auth.
  return <LoadingSpinner />;
};

export default PreCheckout;