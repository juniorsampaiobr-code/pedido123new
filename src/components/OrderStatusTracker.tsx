import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, Enums } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Clock, CheckCircle, XCircle, Truck, Package, Utensils, Loader2, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

type Order = Tables<'orders'> & {
  customer: Tables<'customers'> | null;
};

const ORDER_STATUS_MAP: Record<Enums<'order_status'>, { label: string, icon: React.ElementType, color: string, description: string }> = {
  pending: { label: 'Pendente', icon: Clock, color: 'bg-yellow-500', description: 'Aguardando a confirmação do restaurante.' },
  preparing: { label: 'Em Preparação', icon: Utensils, color: 'bg-orange-500', description: 'O restaurante está preparando seus itens.' },
  ready: { label: 'Pronto', icon: Package, color: 'bg-green-500', description: 'Seu pedido está pronto para retirada ou entrega.' },
  delivering: { label: 'Em Entrega', icon: Truck, color: 'bg-indigo-500', description: 'Seu pedido saiu para entrega e está a caminho.' },
  delivered: { label: 'Entregue', icon: CheckCircle, color: 'bg-primary', description: 'Seu pedido foi entregue com sucesso!' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'bg-destructive', description: 'Seu pedido foi cancelado. Entre em contato com o restaurante se houver dúvidas.' },
  pending_payment: { label: 'Aguardando Pagamento', icon: DollarSign, color: 'bg-gray-500', description: 'Aguardando a confirmação do pagamento online.' },
};

const fetchOrderDetails = async (orderId: string): Promise<Order> => {
  const { data, error } = await supabase
    .from('orders')
    .select('*, customer:customers(name, phone)')
    .eq('id', orderId)
    .limit(1)
    .single();

  if (error) throw new Error(`Erro ao buscar detalhes do pedido: ${error.message}`);
  if (!data) throw new Error('Pedido não encontrado.');
  return data as Order;
};

interface OrderStatusTrackerProps {
  orderId: string;
}

export const OrderStatusTracker = ({ orderId }: OrderStatusTrackerProps) => {
  const { data: order, isLoading, isError, error } = useQuery<Order>({
    queryKey: ['orderStatus', orderId],
    queryFn: () => fetchOrderDetails(orderId),
    // Refetch every 10 seconds to get real-time status updates
    refetchInterval: 10000,
    // Garante que os dados sejam sempre frescos ao montar o componente
    staleTime: 0,
    refetchOnMount: true,
  });

  if (isLoading && !order) {
    return (
      <Card className="w-full max-w-md text-center shadow-xl">
        <div className="p-6">
          <CardHeader className="space-y-4">
            <Loader2 className="h-16 w-16 text-primary mx-auto animate-spin" />
            <CardTitle className="text-2xl font-bold">Carregando Status...</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-3/4 mx-auto mb-2" />
            <Skeleton className="h-4 w-1/2 mx-auto" />
          </CardContent>
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive" className="w-full max-w-md mx-auto">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Erro ao rastrear pedido</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Não foi possível carregar o status do pedido."}
        </AlertDescription>
      </Alert>
    );
  }

  if (!order) return null;

  const statusKey = order.status || 'pending';
  const statusInfo = ORDER_STATUS_MAP[statusKey];
  const displayId = order.created_at ? new Date(order.created_at).getTime().toString().slice(-4) : orderId.slice(-4);
  const Icon = statusInfo.icon;

  return (
    <Card className="w-full max-w-md text-center shadow-xl">
      <div className="p-6">
        <CardHeader className="space-y-4">
          <div className={cn("h-16 w-16 rounded-full mx-auto flex items-center justify-center text-white", statusInfo.color)}>
            <Icon className="h-8 w-8" />
          </div>
          <CardTitle className="text-3xl font-bold">Pedido #{displayId}</CardTitle>
          <p className="text-lg font-semibold text-foreground">Status: {statusInfo.label}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {statusInfo.description}
          </p>
          
          <div className="text-left border-t pt-4 space-y-2">
            <p className="text-sm font-medium">Detalhes:</p>
            <p className="text-xs text-muted-foreground">Cliente: {order.customer?.name || 'N/A'}</p>
            <p className="text-xs text-muted-foreground">Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_amount)}</p>
            <p className="text-xs text-muted-foreground">Endereço: {order.delivery_address || 'Retirada no Local'}</p>
          </div>
        </CardContent>
      </div>
    </Card>
  );
};