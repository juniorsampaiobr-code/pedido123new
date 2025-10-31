import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShoppingCart, Terminal, RefreshCw, Check, X, DollarSign } from 'lucide-react';
import { Tables, Enums } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { OrderDetailsModal } from "@/components/OrderDetailsModal";
import { toast } from "sonner";
import { useSound } from "@/layouts/DashboardLayout";
import { useOutletContext } from "react-router-dom";
import { DashboardContextType } from "@/layouts/DashboardLayout";
import { PaginationComponent } from "@/components/PaginationComponent"; // Novo componente de paginação

type Order = Tables<'orders'> & { customer: Tables<'customers'> | null };

const ORDER_STATUS_MAP: Record<Enums<'order_status'>, { label: string, icon: React.ElementType, color: string }> = {
  pending: { label: 'Pendente', icon: ShoppingCart, color: 'bg-yellow-500 hover:bg-yellow-600' },
  confirmed: { label: 'Confirmado', icon: Check, color: 'bg-blue-500 hover:bg-blue-600' },
  preparing: { label: 'Em Preparação', icon: Check, color: 'bg-orange-500 hover:bg-orange-600' },
  ready: { label: 'Pronto', icon: Check, color: 'bg-green-500 hover:bg-green-600' },
  delivering: { label: 'Em Entrega', icon: Check, color: 'bg-indigo-500 hover:bg-indigo-600' },
  delivered: { label: 'Entregue', icon: Check, color: 'bg-primary hover:bg-primary/90' },
  cancelled: { label: 'Cancelado', icon: X, color: 'bg-destructive hover:bg-destructive/90' },
  pending_payment: { label: 'Aguardando Pag.', icon: DollarSign, color: 'bg-gray-500 hover:bg-gray-600' },
};

interface FetchOrdersResult {
  orders: Order[];
  count: number;
}

const PAGE_SIZE = 12;

const fetchOrders = async (restaurantId: string, status: Enums<'order_status'> | 'all', page: number): Promise<FetchOrdersResult> => {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase.from('orders').select('*, customer:customers(name, phone)', { count: 'exact' }).eq('restaurant_id', restaurantId);
  
  if (status !== 'all') {
    query = query.eq('status', status);
  }
  
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(`Erro ao buscar pedidos: ${error.message}`);
  
  return { orders: data as Order[], count: count || 0 };
};

const OrderCard = ({ order, onViewDetails, onAccept, onDecline }: { order: Order, onViewDetails: (order: Order) => void, onAccept: (orderId: string) => void, onDecline: (orderId: string) => void }) => {
  const statusInfo = ORDER_STATUS_MAP[order.status || 'pending'];
  const customerName = order.customer?.name || 'Cliente Desconhecido';
  const orderNumber = order.created_at ? new Date(order.created_at).getTime().toString().slice(-4) : 'N/A';

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-bold flex items-center gap-2">Pedido #{orderNumber}</CardTitle>
        <Badge className={cn("text-white", statusInfo.color)}><statusInfo.icon className="h-3 w-3 mr-1" />{statusInfo.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-2 flex-grow flex flex-col justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Cliente: {customerName}</p>
          <p className="text-2xl font-extrabold text-primary">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_amount)}</p>
        </div>
        <div className="flex justify-end pt-2 border-t gap-2">
          {(order.status === 'pending' || order.status === 'pending_payment') && (
            <>
              <Button variant="destructive" size="sm" onClick={() => onDecline(order.id)}><X className="h-4 w-4 mr-1" /> Recusar</Button>
              <Button variant="default" size="sm" onClick={() => onAccept(order.id)}><Check className="h-4 w-4 mr-1" /> Aceitar</Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => onViewDetails(order)}>Detalhes</Button>
        </div>
      </CardContent>
    </Card>
  );
};

const OrdersList = ({ status, onViewDetails, restaurantId }: { status: Enums<'order_status'> | 'all', onViewDetails: (order: Order) => void, restaurantId: string }) => {
  const queryClient = useQueryClient();
  const { stopSoundLoop } = useSound();
  const [currentPage, setCurrentPage] = useState(0); // 0-indexed page

  const { data, isLoading, isError, error, refetch } = useQuery<FetchOrdersResult>({
    queryKey: ['orders', status, restaurantId, currentPage],
    queryFn: () => fetchOrders(restaurantId, status, currentPage),
    enabled: !!restaurantId,
  });

  const orders = data?.orders || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, newStatus }: { orderId: string, newStatus: Enums<'order_status'> }) => {
      const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
      if (error) throw new Error(error.message);
      return newStatus;
    },
    onSuccess: (newStatus) => {
      toast.success(`Pedido ${newStatus === 'confirmed' ? 'aceito' : 'recusado'} com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err) => toast.error(`Erro ao atualizar pedido: ${err.message}`),
  });

  const handleAccept = (orderId: string) => {
    stopSoundLoop();
    updateStatusMutation.mutate({ orderId, newStatus: 'confirmed' });
  };
  const handleDecline = (orderId: string) => {
    stopSoundLoop();
    updateStatusMutation.mutate({ orderId, newStatus: 'cancelled' });
  };
  const handleViewDetails = (order: Order) => {
    stopSoundLoop();
    onViewDetails(order);
  };
  
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page - 1); // Componente de paginação é 1-indexed
  }, []);

  if (isLoading) return <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[...Array(4)].map((_, i) => <Card key={i}><CardContent className="p-4 space-y-3"><Skeleton className="h-32 w-full" /></CardContent></Card>)}</div>;
  if (isError) return <Alert variant="destructive"><Terminal className="h-4 w-4" /><AlertTitle>Erro ao carregar pedidos</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Ocorreu um erro desconhecido."}</AlertDescription><Button onClick={() => refetch()} className="mt-3" variant="secondary" size="sm"><RefreshCw className="h-4 w-4 mr-2" /> Tentar Novamente</Button></Alert>;
  if (!orders || orders.length === 0) return <div className="text-center py-12 bg-card rounded-lg border"><ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><p className="text-lg font-semibold">Nenhum pedido encontrado.</p><p className="text-sm text-muted-foreground">Verifique o status selecionado ou aguarde novos pedidos.</p></div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {orders.map((order) => (
          <OrderCard 
            key={order.id} 
            order={order} 
            onViewDetails={handleViewDetails} 
            onAccept={handleAccept} 
            onDecline={handleDecline} 
          />
        ))}
      </div>
      
      {totalPages > 1 && (
        <div className="flex justify-center pt-4">
          <PaginationComponent 
            currentPage={currentPage + 1} 
            totalPages={totalPages} 
            onPageChange={handlePageChange} 
          />
        </div>
      )}
    </div>
  );
};

const Orders = () => {
  const { restaurant } = useOutletContext<DashboardContextType>();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleViewDetails = (order: Order) => { setSelectedOrder(order); setIsModalOpen(true); };
  const handleCloseModal = () => { setIsModalOpen(false); setSelectedOrder(null); };

  const statusTabs: { value: Enums<'order_status'> | 'all', label: string }[] = [
    { value: 'pending_payment', label: 'Aguardando Pag.' }, 
    { value: 'pending', label: 'Pendentes' }, 
    { value: 'confirmed', label: 'Confirmados' },
    { value: 'preparing', label: 'Em Preparação' }, 
    { value: 'ready', label: 'Prontos' }, 
    { value: 'delivering', label: 'Em Entrega' },
    { value: 'delivered', label: 'Entregues' }, 
    { value: 'cancelled', label: 'Cancelados' },
    { value: 'all', label: 'Todos' }, 
  ];

  return (
    <>
      <OrderDetailsModal order={selectedOrder} isOpen={isModalOpen} onClose={handleCloseModal} />
      <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-6">
        {restaurant?.id ? (
          <Tabs defaultValue="pending_payment">
            <TabsList className="w-full overflow-x-auto justify-start">{statusTabs.map(tab => <TabsTrigger key={tab.value} value={tab.value} className="whitespace-nowrap">{tab.label}</TabsTrigger>)}</TabsList>
            {statusTabs.map(tab => <TabsContent key={tab.value} value={tab.value} className="mt-6"><OrdersList status={tab.value} onViewDetails={handleViewDetails} restaurantId={restaurant.id} /></TabsContent>)}
          </Tabs>
        ) : (
          <div className="text-center py-12"><Skeleton className="h-12 w-12 mx-auto mb-4" /><p>Carregando dados do restaurante...</p></div>
        )}
      </main>
    </>
  );
};

export default Orders;