import React, { useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, Enums } from '@/integrations/supabase/types';
import { useCart } from '@/hooks/use-cart';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Clock, MapPin, CreditCard, Package, Truck, Terminal, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Order = Tables<'orders'> & { 
  customer: Tables<'customers'> | null,
  payment_methods: Tables<'payment_methods'> | null,
};
type OrderItem = Tables<'order_items'> & { products: Tables<'products'> | null };
type OrderStatus = Enums<'order_status'>;

const ORDER_STATUS_MAP: Record<OrderStatus, { label: string, icon: React.ElementType, color: string }> = {
  pending: { label: 'Pedido Recebido', icon: Clock, color: 'bg-yellow-500' },
  preparing: { label: 'Em Preparação', icon: Package, color: 'bg-orange-500' },
  ready: { label: 'Pronto para Entrega', icon: CheckCircle, color: 'bg-green-500' },
  delivering: { label: 'Em Entrega', icon: Truck, color: 'bg-blue-500' },
  delivered: { label: 'Entregue', icon: Check, color: 'bg-primary' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'bg-destructive' },
  pending_payment: { label: 'Aguardando Pagamento', icon: CreditCard, color: 'bg-gray-500' },
};

const fetchOrderDetails = async (orderId: string): Promise<Order> => {
  const { data, error } = await supabase
    .from('orders')
    .select('*, customer:customers(name, phone, email, cpf_cnpj), payment_methods(name)')
    .eq('id', orderId)
    .limit(1)
    .single();

  if (error) throw new Error(`Erro ao buscar pedido: ${error.message}`);
  if (!data) throw new Error('Pedido não encontrado.');
  return data as Order;
};

const fetchOrderItems = async (orderId: string): Promise<OrderItem[]> => {
  const { data, error } = await supabase
    .from('order_items')
    .select('*, products(name, is_price_by_weight)')
    .eq('order_id', orderId);
  if (error) throw new Error(error.message);
  return data as OrderItem[];
};

const OrderSuccess = () => {
  const { orderId: paramOrderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  
  // Prioriza o ID da URL, mas verifica também o external_reference do Mercado Pago
  const orderId = paramOrderId || searchParams.get('external_reference');
  const restaurantIdFromQuery = searchParams.get('restaurantId'); // NOVO: Lê o restaurantId da query param
  const paymentStatus = searchParams.get('status'); // Status do Mercado Pago (approved, pending, failure)

  const { clearCart } = useCart();
  const [cartCleared, setCartCleared] = React.useState(false);

  // 1. Fetch Order Details
  const { data: order, isLoading: isLoadingOrder, isError: isErrorOrder, error: errorOrder, refetch: refetchOrder } = useQuery<Order>({
    queryKey: ['orderSuccessDetails', orderId],
    queryFn: () => fetchOrderDetails(orderId!),
    enabled: !!orderId,
    staleTime: 0,
  });

  // 2. Fetch Order Items
  const { data: items, isLoading: isLoadingItems, isError: isErrorItems } = useQuery<OrderItem[]>({
    queryKey: ['orderSuccessItems', orderId],
    queryFn: () => fetchOrderItems(orderId!),
    enabled: !!orderId,
    staleTime: 0,
  });

  // Efeito para limpar o carrinho
  useEffect(() => {
    if (orderId && !cartCleared) {
      // Limpa o carrinho assim que a página de sucesso é carregada
      clearCart();
      setCartCleared(true);
    }
  }, [orderId, clearCart, cartCleared]);

  const currentStatus = order?.status || 'pending_payment';
  const statusInfo = ORDER_STATUS_MAP[currentStatus] || ORDER_STATUS_MAP.pending_payment;
  
  // CORREÇÃO 1: Usar os últimos 4 caracteres do UUID do pedido
  const orderNumber = order?.id ? order.id.slice(-4) : 'N/A';
  
  // NOVO: Determina o ID do restaurante para o link de retorno
  const finalRestaurantId = order?.restaurant_id || restaurantIdFromQuery;

  const totalAmount = order?.total_amount || 0;
  const deliveryFee = order?.delivery_fee || 0;
  const subtotal = totalAmount - deliveryFee;
  const createdAt = order?.created_at ? new Date(order.created_at) : null;
  const formattedDate = createdAt ? format(createdAt, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR }) : 'Data desconhecida';
  const changeFor = order?.change_for ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.change_for) : null;
  const paymentMethodName = order?.payment_methods?.name || 'Não especificado';

  if (!orderId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg w-full text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-destructive flex items-center justify-center gap-2">
              <AlertCircle className="h-6 w-6" />
              Erro no Pedido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-6">ID do pedido não encontrado. Por favor, volte ao menu.</p>
            <Link to="/">
              <Button size="lg">Voltar ao Início</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoadingOrder || isLoadingItems) {
    return <LoadingSpinner />;
  }

  if (isErrorOrder || isErrorItems || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg w-full text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-destructive flex items-center justify-center gap-2">
              <Terminal className="h-6 w-6" />
              Erro ao Carregar Pedido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{errorOrder?.message || "Ocorreu um erro desconhecido ao buscar os detalhes do pedido."}</p>
            <Button onClick={() => refetchOrder()} className="mr-2"><RefreshCw className="h-4 w-4 mr-2" /> Tentar Novamente</Button>
            <Link to={finalRestaurantId ? `/menu/${finalRestaurantId}` : '/'}>
              <Button variant="outline">Voltar ao Cardápio</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex justify-center p-4 sm:p-8">
      <Card className="w-full max-w-3xl shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className={cn("mx-auto p-3 rounded-full w-16 h-16 flex items-center justify-center", statusInfo.color)}>
            <statusInfo.icon className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold">
            {currentStatus === 'cancelled' ? 'Pedido Cancelado' : 'Pedido Realizado com Sucesso!'}
          </CardTitle>
          <p className="text-lg text-muted-foreground">
            Seu pedido #{orderNumber} está em {statusInfo.label.toLowerCase()}.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Detalhes do Cliente e Entrega */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-primary flex-shrink-0" />
              <div>
                <p className="font-semibold">Entrega</p>
                <p className="text-sm text-muted-foreground">{order.delivery_address || 'Retirada no local'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CreditCard className="h-5 w-5 text-primary flex-shrink-0" />
              <div>
                <p className="font-semibold">Pagamento</p>
                <p className="text-sm text-muted-foreground">{paymentMethodName}</p>
                {changeFor && <p className="text-xs text-muted-foreground">Troco para: {changeFor}</p>}
              </div>
            </div>
          </div>

          {/* Itens do Pedido */}
          <div>
            <h3 className="text-xl font-semibold mb-3">Resumo do Pedido</h3>
            <div className="space-y-2">
              {items?.map((item) => (
                <div key={item.id} className="flex justify-between items-start p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{item.products?.name || 'Produto Removido'}</p>
                    {item.notes && <p className="text-xs text-muted-foreground">Obs: {item.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      {item.quantity} {item.products?.is_price_by_weight ? 'kg' : 'x'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price)}
                    </p>
                    <p className="font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.subtotal)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totais */}
          <div className="pt-4 border-t space-y-1">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Taxa de Entrega</span>
              <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deliveryFee)}</span>
            </div>
            <div className="flex justify-between font-bold text-xl pt-2 border-t">
              <span>Total</span>
              <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}</span>
            </div>
          </div>
          
          {/* Ações */}
          <div className="pt-6 flex justify-center">
            {/* CORREÇÃO 2: Usando o ID do restaurante para o link de retorno */}
            <Link to={finalRestaurantId ? `/menu/${finalRestaurantId}` : '/'}>
              <Button size="lg">Fazer Novo Pedido</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderSuccess;