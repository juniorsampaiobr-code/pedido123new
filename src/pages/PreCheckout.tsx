import React, { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useCart } from '@/hooks/use-cart';
import { useActiveRestaurantId } from '@/hooks/use-active-restaurant-id'; // Importando o novo hook
import { useAuthStatus } from '@/hooks/use-auth-status'; // Importando o hook centralizado

const PreCheckout = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentRestaurantId = searchParams.get('restaurantId'); // Lê o ID do restaurante da URL
  
  const { data: user, isLoading: isLoadingAuth } = useAuthStatus(); // Usando o hook centralizado
  const { data: defaultRestaurantId, isLoading: isLoadingRestaurantId } = useActiveRestaurantId();
  const { totalItems } = useCart();

  // O ID do restaurante para redirecionamento é o que veio da URL do menu, ou o padrão se não houver
  const finalRestaurantId = currentRestaurantId || defaultRestaurantId;

  // Centralize toda a lógica de navegação no useEffect
  useEffect(() => {
    if (totalItems === 0) {
      // Carrinho vazio, volta para o menu (usando o ID encontrado)
      if (finalRestaurantId) {
        navigate(`/menu/${finalRestaurantId}`, { replace: true });
      } else if (!isLoadingRestaurantId) {
        // Se não encontrar ID, volta para a raiz
        navigate('/', { replace: true });
      }
      return;
    }
    
    if (!isLoadingAuth && !isLoadingRestaurantId) {
      if (user) {
        // Usuário logado, prossegue para o checkout
        // NOVO: Passa o restaurantId no state para que Checkout.tsx possa usá-lo
        navigate('/checkout', { 
          state: { 
            restaurantId: currentRestaurantId 
          }, 
          replace: true 
        });
      } else {
        // Usuário não logado, redireciona para autenticação, passando o estado de onde veio
        // Incluímos o restaurantId no estado para que Auth.tsx saiba para onde voltar
        navigate('/auth', { 
          state: { 
            from: '/checkout', 
            restaurantId: currentRestaurantId 
          }, 
          replace: true 
        });
      }
    }
  }, [totalItems, user, isLoadingAuth, isLoadingRestaurantId, navigate, finalRestaurantId, currentRestaurantId]);

  // Renderização de fallback enquanto a navegação está pendente
  if (isLoadingAuth || isLoadingRestaurantId || totalItems === 0) {
    return <LoadingSpinner />;
  }

  // Se chegarmos aqui, significa que !isLoading e !user, e estamos aguardando o useEffect redirecionar para /auth.
  return <LoadingSpinner />;
};

export default PreCheckout;