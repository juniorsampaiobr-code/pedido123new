import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Order = Tables<'orders'>;

const fetchOrderDetails = async (orderId: string): Promise<Order> => {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .limit(1)
    .single();
  if (error) throw new Error(`Erro ao buscar pedido: ${error.message}`);
  if (!data) throw new Error('Pedido não encontrado.');
  return data;
};

const PaymentRedirect = () => {
  const navigate = useNavigate();
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const [statusMessage, setStatusMessage] = useState('Verificando status do pagamento...');
  const [isProcessing, setIsProcessing] = useState(true);
  const [isError, setIsError] = useState(false);

  const mpStatus = searchParams.get('status'); // approved, pending, failure
  const externalReference = searchParams.get('external_reference');
  const restaurantIdFromQuery = searchParams.get('restaurantId'); // Lendo o restaurantId da query

  // Garante que temos o ID do pedido
  const finalOrderId = orderId || externalReference;

  // Query para buscar o pedido (usado principalmente para garantir que ele existe)
  const { data: order, isLoading: isLoadingOrder } = useQuery<Order>({
    queryKey: ['paymentRedirectOrder', finalOrderId],
    queryFn: () => fetchOrderDetails(finalOrderId!),
    enabled: !!finalOrderId,
    staleTime: 0,
  });
  
  // Determina o ID do restaurante para o redirecionamento final
  const finalRestaurantId = order?.restaurant_id || restaurantIdFromQuery;
  
  // Função de redirecionamento de fallback
  const redirectToMenu = (id: string | undefined) => {
      if (id) {
          navigate(`/menu/${id}`, { replace: true });
      } else {
          navigate('/', { replace: true });
      }
  };

  useEffect(() => {
    if (!finalOrderId) {
      setStatusMessage('ID do pedido não encontrado na URL.');
      setIsError(true);
      setIsProcessing(false);
      toast.error('Erro de redirecionamento: ID do pedido ausente.');
      // Redireciona para o menu/raiz se o ID estiver faltando
      redirectToMenu(finalRestaurantId);
      return;
    }

    if (isLoadingOrder) return;

    if (!order) {
      setStatusMessage('Pedido não encontrado no banco de dados.');
      setIsError(true);
      setIsProcessing(false);
      toast.error('Erro: Pedido não existe.');
      // Redireciona para o menu/raiz se o pedido não existir
      redirectToMenu(finalRestaurantId);
      return;
    }

    const confirmPayment = async () => {
      setIsProcessing(true);
      setStatusMessage('Confirmando pagamento com Mercado Pago...');
      
      try {
        // Chama a Edge Function para confirmar o pagamento
        const { data, error } = await supabase.functions.invoke('confirm-payment', {
          body: { orderId: finalOrderId },
        });

        if (error) {
          // Se a Edge Function retornar um erro (como 404 ou 500)
          let errorMessage = error.message;
          if (errorMessage.includes("non-2xx status code")) {
              errorMessage = "Falha de comunicação com o servidor. Verifique se a função 'confirm-payment' está implantada.";
          }
          throw new Error(errorMessage);
        }
        
        const paymentResult = data as { status: string, message: string };
        
        // Constrói a URL de sucesso, incluindo o restaurantId
        const successUrl = `/order-success/${finalOrderId}?status=${paymentResult.status}${finalRestaurantId ? `&restaurantId=${finalRestaurantId}` : ''}`;
        
        if (paymentResult.status === 'approved') {
          setStatusMessage('Pagamento Aprovado! Redirecionando...');
          toast.success('Pagamento aprovado!');
          // Redireciona para a página de sucesso
          navigate(successUrl, { replace: true });
        } else if (paymentResult.status === 'pending') {
          setStatusMessage('Pagamento Pendente. Aguardando confirmação...');
          toast.warning('Pagamento pendente. Você será notificado quando for confirmado.');
          // Redireciona para a página de sucesso, que mostrará o status 'pending_payment'
          navigate(successUrl, { replace: true });
        } else {
          // status: rejected, failure, etc.
          setStatusMessage(`Pagamento Recusado. Status: ${paymentResult.status}`);
          toast.error('Pagamento recusado. Tente novamente.');
          setIsError(true);
          // Redireciona para o checkout para tentar novamente, preservando o restaurantId
          navigate(`/checkout${finalRestaurantId ? `?restaurantId=${finalRestaurantId}` : ''}`, { replace: true });
        }

      } catch (err: any) {
        console.error("Erro na confirmação de pagamento:", err);
        setStatusMessage(`Erro ao processar pagamento: ${err.message}`);
        setIsError(true);
        setIsProcessing(false);
        toast.error('Erro ao processar pagamento. Tente novamente.');
        // Redireciona para o checkout em caso de erro de comunicação
        navigate(`/checkout${finalRestaurantId ? `?restaurantId=${finalRestaurantId}` : ''}`, { replace: true });
      }
    };

    confirmPayment();

  }, [finalOrderId, isLoadingOrder, order, navigate, searchParams, finalRestaurantId]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted">
      <Card className="w-full max-w-md text-center shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
            {isProcessing ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : isError ? <AlertCircle className="h-6 w-6 text-destructive" /> : <CheckCircle className="h-6 w-6 text-green-500" />}
            {isProcessing ? 'Processando Pagamento' : isError ? 'Erro de Pagamento' : 'Redirecionando...'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-6">{statusMessage}</p>
          {isError && (
            <div className="mt-4">
              <p className="text-sm text-destructive">Você será redirecionado em breve.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentRedirect;