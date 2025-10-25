import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShoppingCart, Terminal, RefreshCw, Clock, CheckCircle, XCircle, Truck, Package, Utensils } from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { Tables, Enums } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { OrderDetailsModal } from "@/components/OrderDetailsModal";

type Order = Tables<'orders'> & {
  customer: Tables<'customers'> | null;
};

const ORDER_STATUS_MAP: Record<Enums<'order_status'>, { label: string, icon: React.ElementType, color: string }> = {
  pending: { label: 'Pendente', icon: Clock, color: 'bg-yellow-500 hover:bg-yellow-600' },
  confirmed: { label: 'Confirmado', icon: CheckCircle, color: 'bg-blue-500 hover:bg-blue-600' },
  preparing: { label: 'Em Preparação', icon: Utensils, color: 'bg-orange-500 hover:bg-orange-600' },
  ready: { label: 'Pronto', icon: Package, color: 'bg-green-500 hover:bg-green-600' },
  delivering: { label: 'Em Entrega', icon: Truck, color: 'bg-indigo-500 hover:bg-indigo-600' },
  delivered: { label: 'Entregue', icon: CheckCircle, color: 'bg-primary hover:bg-primary/90' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'bg-destructive hover:bg-destructive/90' },
};

const fetchOrders = async (status: Enums<'order_status'> | 'all'): Promise<Order[]> => {
  const { data: restaurantData, error: restaurantError } = await supabase
    .from('restaurants')
    .select('id')
    .limit(1)
    .single();

  if (restaurantError) throw new Error(`Erro ao buscar restaurante: ${restaurantError.message}`);
  if (!restaurantData) throw new Error('Nenhum restaurante ativo encontrado.');

  let query = supabase
    .from('orders')
    .select('*, customer:customers(name, phone)')
    .eq('restaurant_id', restaurantData.id)
    .order('created_at', { ascending: false });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Erro ao buscar pedidos: ${error.message}`);
  return data as Order[];
};

const OrderCard = ({ order, onViewDetails }: { order: Order, onViewDetails: (order: Order) => void }) => {
  const statusInfo = ORDER_STATUS_MAP[order.status || 'pending'];
  const customerName = order.customer?.name || 'Cliente Desconhecido';
  const orderNumber = order.created_at ? new Date(order.created_at).getTime().toString().slice(-4) : 'N/A';

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          Pedido #{orderNumber}
        </CardTitle>
        <Badge className={cn("text-white", statusInfo.color)}>
          <statusInfo.icon className="h-3 w-3 mr-1" />
          {statusInfo.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">Cliente: {customerName}</p>
        <p className="text-2xl font-extrabold text-primary">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_amount)}
        </p>
        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onViewDetails(order)}>Ver Detalhes</Button>
        </div>
      </CardContent>
    </Card>
  );
};

const OrdersList = ({ status, onViewDetails }: { status: Enums<'order_status'> | 'all', onViewDetails: (order: Order) => void }) => {
  const { data: orders, isLoading, isError, error, refetch } = useQuery<Order[]>({
    queryKey: ['orders', status],
    queryFn: () => fetchOrders(status),
  });

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}><CardContent className="p-4 space-y-3"><Skeleton className="h-32 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Erro ao carregar pedidos</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Ocorreu um erro desconhecido."}</AlertDescription>
        <Button onClick={() => refetch()} className="mt-3" variant="secondary" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" /> Tentar Novamente
        </Button>
      </Alert>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-12 bg-card rounded-lg border">
        <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-lg font-semibold">Nenhum pedido encontrado.</p>
        <p className="text-sm text-muted-foreground">Verifique o status selecionado ou aguarde novos pedidos.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} onViewDetails={onViewDetails} />
      ))}
    </div>
  );
};

const Orders = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<Enums<'order_status'> | 'all'>('pending');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    };
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') navigate("/");
      else if (!session?.user) navigate("/auth");
      else setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleViewDetails = (order: Order) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedOrder(null);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (!user) {
    return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }

  const statusTabs: { value: Enums<'order_status'> | 'all', label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Pendentes' },
    { value: 'confirmed', label: 'Confirmados' },
    { value: 'preparing', label: 'Em Preparação' },
    { value: 'ready', label: 'Prontos' },
    { value: 'delivering', label: 'Em Entrega' },
    { value: 'delivered', label: 'Entregues' },
    { value: 'cancelled', label: 'Cancelados' },
  ];

  return (
    <>
      <OrderDetailsModal order={selectedOrder} isOpen={isModalOpen} onClose={handleCloseModal} />
      <div className="flex min-h-screen bg-muted/40">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <header className="border-b bg-background sticky top-0 z-40">
            <div className="container max-w-none mx-auto px-8 h-16 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <ShoppingCart className="h-6 w-6" />
                <h1 className="text-xl font-semibold">Pedidos</h1>
              </div>
              <Button variant="outline" onClick={handleSignOut}>
                Sair
              </Button>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-6">
            <Tabs defaultValue="pending" onValueChange={(value) => setActiveTab(value as Enums<'order_status'> | 'all')}>
              <TabsList className="w-full overflow-x-auto justify-start">
                {statusTabs.map(tab => (
                  <TabsTrigger key={tab.value} value={tab.value} className="whitespace-nowrap">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              
              {statusTabs.map(tab => (
                <TabsContent key={tab.value} value={tab.value} className="mt-6">
                  <OrdersList status={tab.value} onViewDetails={handleViewDetails} />
                </TabsContent>
              ))}
            </Tabs>
          </main>
        </div>
      </div>
    </>
  );
};

export default Orders;