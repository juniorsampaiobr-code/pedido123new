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

const PreCheckout = () => {
  const navigate = useNavigate();
  const { data: user, isLoading } = useAuthStatus();
  const { totalItems } = useCart();

  // Centralize toda a lógica de navegação no useEffect
  useEffect(() => {
    if (totalItems === 0) {
      // Carrinho vazio, volta para o menu
      navigate('/menu', { replace: true });
      return;
    }
    
    if (!isLoading) {
      if (user) {
        // Usuário logado, prossegue para o checkout
        navigate('/checkout', { replace: true });
      } else {
        // Usuário não logado, redireciona para autenticação
        navigate('/auth', { replace: true });
      }
    }
  }, [totalItems, user, isLoading, navigate]);

  // Renderização de fallback enquanto a navegação está pendente
  // Retorna um spinner se estiver carregando ou se o carrinho estiver vazio (aguardando o useEffect)
  if (isLoading || totalItems === 0) {
    return <LoadingSpinner />;
  }

  // Se chegarmos aqui, significa que !isLoading e !user, e estamos aguardando o useEffect redirecionar para /auth.
  // Retornamos o spinner para evitar piscar o conteúdo, pois o redirecionamento é iminente.
  return <LoadingSpinner />;
};

export default PreCheckout;