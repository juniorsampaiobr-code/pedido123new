import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrderStatusTracker } from '@/components/OrderStatusTracker';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useCart } from '@/hooks/use-cart';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tables, Enums } from '@/integrations/supabase/types';

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
  return data as Order;
};

const OrderSuccess = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { clearCart } = useCart();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [cartCleared, setCartCleared] = useState(false);

  // Status retornado pelo Mercado Pago após redirecionamento (approved, pending, failure)
  const paymentStatus = searchParams.get('status');

  const { data: order, isLoading: isLoadingOrder, isError, refetch } = useQuery<Order>({
    queryKey: ['customerOrderStatus', orderId],
    queryFn: () => fetchOrderDetails(orderId!),
    enabled: !!orderId,
    // Garantir que os dados sejam sempre frescos
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const isCancellable = useMemo(() => {
    if (!order) return false;
    const status = order.status;
    // Cancellable statuses: pending_payment (aguardando pagamento), pending (pendentes), preparing (em preparação), ready (prontos)
    return status === 'pending_payment' || status === 'pending' || status === 'preparing' || status === 'ready';
  }, [order]);

  const confirmPaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      // Esta função verifica o status do pagamento no MP usando o orderId como external_reference
      const { data, error } = await supabase.functions.invoke('confirm-payment', {
        body: { orderId: id },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      // A Edge Function confirm-payment já atualiza o status do pedido para 'pending' se aprovado.
      if (data?.status === 'approved') {
        console.log("LOG: Pagamento confirmado com sucesso!");
      } else if (data?.status === 'pending') {
        console.log("LOG: Pagamento ainda pendente de confirmação. Aguardando a compensação do Pix/Boleto.");
      } else {
        console.log("LOG: Status de pagamento não aprovado. Se você já pagou, aguarde alguns minutos ou entre em contato com o restaurante.");
      }
      // Invalida ambas as queries para garantir a atualização
      queryClient.invalidateQueries({ queryKey: ['orderStatus', orderId] });
      queryClient.invalidateQueries({ queryKey: ['customerOrderStatus', orderId] });
    },
    onError: (err) => {
      console.error(`LOG: Falha na confirmação do pagamento: ${err.message}`);
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      console.log("LOG: Iniciando cancelamento do pedido:", id);
      
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled' as Enums<'order_status'> })
        .eq('id', id)
        .select('*');

      if (error) throw new Error(error.message);
      
      // Retorna um valor simples para o onSuccess
      return true;
    },
    onSuccess: async () => {
      console.log("LOG: Pedido cancelado com sucesso. Invalidando queries e forçando refetch.");
      
      // 1. Invalidar todas as queries relacionadas ao pedido
      await queryClient.invalidateQueries({ queryKey: ['customerOrderStatus', orderId] });
      await queryClient.invalidateQueries({ queryKey: ['orderStatus', orderId] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      
      // 2. Forçar refetch imediato e aguardar a conclusão
      // O refetch() aqui é crucial para atualizar o 'order' e, consequentemente, 'isCancellable'
      await refetch(); 
      
      console.log("LOG: Refetch concluído. O status do pedido deve estar atualizado.");
      
      // 3. Fechar o diálogo de confirmação
      setIsDialogOpen(false); 
    },
    onError: (err) => {
      console.error(`LOG: Erro ao cancelar pedido: ${err.message}`);
      alert(`Erro ao cancelar pedido: ${err.message}`);
    },
  });

  const handleCancel = () => {
    console.log("LOG: Tentativa de cancelamento iniciada para OrderID:", orderId);
    if (orderId) {
      cancelOrderMutation.mutate(orderId);
    } else {
      console.error("LOG: OrderID não encontrado para cancelamento.");
    }
  };

  useEffect(() => {
    if (orderId && !cartCleared) {
      // Limpa o carrinho assim que a página de sucesso é carregada
      clearCart(); 
      setCartCleared(true);
      console.log("LOG: Carrinho limpo após sucesso do pedido.");
      
      // Se o Mercado Pago retornar 'approved' OU 'pending', tentamos confirmar o pagamento no backend.
      if (paymentStatus === 'approved' || paymentStatus === 'pending') {
        console.log("LOG: Chamando confirmPaymentMutation para OrderID:", orderId);
        setTimeout(() => {
          confirmPaymentMutation.mutate(orderId);
        }, 0);
      }
    }
  }, [orderId, paymentStatus, confirmPaymentMutation, clearCart, cartCleared]);

  if (!orderId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center shadow-xl">
          <CardHeader><CardTitle className="text-2xl font-bold text-destructive">Erro</CardTitle></CardHeader>
          <CardContent>
            <p className="text-muted-foreground">ID do pedido não encontrado.</p>
            <Link to="/menu"><Button className="mt-4">Voltar ao Cardápio</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading state initially or while fetching
  if (isLoadingOrder) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md text-center shadow-xl">
          <CardContent className="p-6 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 mb-4 text-primary animate-spin" />
            <p className="font-semibold">Carregando informações do pedido...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !order) {
    // Se não está carregando e não tem pedido, algo deu errado (ex: 404)
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center shadow-xl">
          <CardHeader><CardTitle className="text-2xl font-bold text-destructive">Erro</CardTitle></CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Pedido não encontrado ou erro de carregamento. Tente recarregar a página.</p>
            <Link to="/menu"><Button className="mt-4">Voltar ao Cardápio</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md mb-6">
        <Link to="/menu"><Button variant="ghost" className="mb-4"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao Cardápio</Button></Link>
      </div>
      
      {confirmPaymentMutation.isPending && (paymentStatus === 'approved' || paymentStatus === 'pending') && (
        <Card className="w-full max-w-md text-center shadow-xl mb-6">
          <CardContent className="p-6 flex items-center justify-center">
            <Loader2 className="h-5 w-5 mr-3 animate-spin" />
            <p className="font-semibold">Confirmando pagamento, por favor aguarde...</p>
          </CardContent>
        </Card>
      )}

      <div><OrderStatusTracker orderId={orderId} /></div>

      <div className="w-full max-w-md mt-6">
        <Card className="shadow-xl">
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">Você pode acompanhar o status do seu pedido nesta página.</p>
            
            {isCancellable ? (
                <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <AlertDialogTrigger asChild>
                        <Button 
                            variant="destructive" 
                            className="w-full"
                            disabled={cancelOrderMutation.isPending}
                        >
                            {cancelOrderMutation.isPending ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Cancelando...
                              </>
                            ) : 'Cancelar Pedido'}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Tem certeza que deseja cancelar o pedido?</AlertDialogTitle>
                            <AlertDialogDescription>
                                O cancelamento só é possível antes do pedido sair para entrega. Se o restaurante já estiver preparando, o cancelamento pode não ser aceito.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Não, manter pedido</AlertDialogCancel>
                            <AlertDialogAction 
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleCancel();
                                }}
                                className="bg-destructive hover:bg-destructive/90"
                                disabled={cancelOrderMutation.isPending}
                            >
                                {cancelOrderMutation.isPending ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Cancelando...
                                  </>
                                ) : 'Sim, cancelar'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            ) : (
                <Button className="w-full" variant="default" disabled>
                    Pedido não cancelável
                </Button>
            )}
            
            <Link to="/menu"><Button className="w-full" variant={isCancellable ? "outline" : "default"}>Fazer Novo Pedido</Button></Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OrderSuccess;