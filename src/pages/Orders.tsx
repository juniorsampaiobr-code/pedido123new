import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShoppingCart, Terminal, RefreshCw, Check, X, DollarSign, Trash2, Loader2, Package, Truck, Clock, CheckCircle, XCircle, Printer } from 'lucide-react';
import { Tables, Enums } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { OrderDetailsModal } from "@/components/OrderDetailsModal";
import { toast } from "sonner";
import { useOutletContext } from "react-router-dom";
import { DashboardContextType } from "@/layouts/DashboardLayout";
import { PaginationComponent } from "@/components/PaginationComponent";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Order = Tables<'orders'> & { customer: Tables<'customers'> | null };

const ORDER_STATUS_MAP: Record<Enums<'order_status'>, { label: string, icon: React.ElementType, color: string }> = {
  pending: { label: 'Pendente', icon: Clock, color: 'bg-yellow-500 hover:bg-yellow-600' },
  preparing: { label: 'Em Preparação', icon: Package, color: 'bg-orange-500 hover:bg-orange-600' },
  ready: { label: 'Pronto', icon: CheckCircle, color: 'bg-green-500 hover:bg-green-600' },
  delivering: { label: 'Em Entrega', icon: Truck, color: 'bg-indigo-500 hover:bg-indigo-600' },
  delivered: { label: 'Entregue', icon: Check, color: 'bg-primary hover:bg-primary/90' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'bg-destructive hover:bg-destructive/90' },
  pending_payment: { label: 'Aguardando Pag.', icon: DollarSign, color: 'bg-gray-500 hover:bg-gray-600' },
};

const STATUS_OPTIONS: { value: Enums<'order_status'> | 'delete', label: string }[] = [
  { value: 'pending', label: 'Mudar para Pendente' },
  { value: 'preparing', label: 'Mudar para Em Preparação' },
  { value: 'ready', label: 'Mudar para Pronto' },
  { value: 'delivering', label: 'Mudar para Em Entrega' },
  { value: 'delivered', label: 'Mudar para Entregue' },
  { value: 'cancelled', label: 'Mudar para Cancelado' },
  { value: 'pending_payment', label: 'Mudar para Aguardando Pag.' },
  { value: 'delete', label: 'Excluir Permanentemente' },
];

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

// Função para buscar o nome do método de pagamento
const fetchPaymentMethodName = async (paymentMethodId: string): Promise<string> => {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('name')
    .eq('id', paymentMethodId)
    .single();

  if (error) {
    console.error("Erro ao buscar nome do método de pagamento:", error);
    return 'Método Desconhecido';
  }
  return data?.name || 'Método Desconhecido';
};

// Função para gerar conteúdo de impressão do pedido
const generatePrintContent = (order: Order, items: any[], paymentMethodName: string) => {
  const orderNumber = order.id ? order.id.slice(-4) : 'N/A';
  const customerName = order.customer?.name || 'Cliente Desconhecido';
  const customerPhone = order.customer?.phone || 'Não informado';
  const deliveryAddress = order.delivery_address || 'Retirada no local';
  const createdAt = order.created_at ? new Date(order.created_at).toLocaleString('pt-BR') : 'Data desconhecida';
  const changeFor = order.change_for ? `Troco para: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.change_for)}` : '';
  const deliveryFee = order.delivery_fee ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.delivery_fee) : 'Grátis';
  const subtotal = order.total_amount - (order.delivery_fee || 0);

  // Lógica para observação de pagamento online
  let paymentNote = '';
  if (paymentMethodName.toLowerCase().includes('online') && order.status !== 'cancelled' && order.status !== 'pending_payment') {
    paymentNote = '<div style="margin-top: 10px; padding: 5px; border: 1px solid #000; text-align: center; font-weight: bold; background-color: #ccffcc;">PAGO ONLINE - NÃO COBRAR</div>';
  } else if (order.status === 'pending_payment') {
    paymentNote = '<div style="margin-top: 10px; padding: 5px; border: 1px solid #000; text-align: center; font-weight: bold; background-color: #ffffcc;">AGUARDANDO PAGAMENTO</div>';
  }

  let itemsHtml = '';
  items.forEach(item => {
    itemsHtml += `
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
        <span>${item.quantity}x ${item.products?.name || 'Produto não encontrado'}</span>
        <span>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.subtotal)}</span>
      </div>
      ${item.notes ? `<div style="font-size: 12px; color: #666; margin-bottom: 10px;">Obs: ${item.notes}</div>` : ''}
    `;
  });

  return `
    <div style="font-family: Arial, sans-serif; max-width: 300px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px;">
        <h2 style="margin: 0;">PEDIDO #${orderNumber}</h2>
        <p style="margin: 5px 0;">${createdAt}</p>
      </div>
      
      <div style="margin-bottom: 15px;">
        <h3 style="margin: 0 0 5px 0;">Cliente</h3>
        <p style="margin: 0;">${customerName}</p>
        <p style="margin: 0;">${customerPhone}</p>
      </div>
      
      <div style="margin-bottom: 15px;">
        <h3 style="margin: 0 0 5px 0;">Entrega</h3>
        <p style="margin: 0;">${deliveryAddress}</p>
      </div>
      
      <div style="margin-bottom: 15px;">
        <h3 style="margin: 0 0 5px 0;">Itens</h3>
        ${itemsHtml}
      </div>
      
      <div style="border-top: 1px dashed #000; padding-top: 10px; margin-bottom: 15px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
          <span>Subtotal:</span>
          <span>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
          <span>Taxa de Entrega:</span>
          <span>${deliveryFee}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 16px; margin-top: 10px;">
          <span>Total:</span>
          <span>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_amount)}</span>
        </div>
      </div>
      
      <div style="margin-bottom: 15px;">
        <h3 style="margin: 0 0 5px 0;">Pagamento</h3>
        <p style="margin: 0;">${paymentMethodName}</p>
        ${changeFor ? `<p style="margin: 0;">${changeFor}</p>` : ''}
        ${paymentNote}
      </div>
      
      ${order.notes ? `
        <div style="margin-bottom: 15px;">
          <h3 style="margin: 0 0 5px 0;">Observações</h3>
          <p style="margin: 0;">${order.notes}</p>
        </div>
      ` : ''}
      
      <div style="text-align: center; margin-top: 20px;">
        <p style="font-size: 12px;">Obrigado pela preferência!</p>
      </div>
    </div>
  `;
};

const OrderCard = ({ order, onViewDetails, onAccept, onDecline, onDelete, isSelected, onSelect, onPrint }: { 
  order: Order, 
  onViewDetails: (order: Order) => void, 
  onAccept: (orderId: string) => void, 
  onDecline: (orderId: string) => void,
  onDelete: (orderId: string) => void,
  isSelected: boolean;
  onSelect: (orderId: string, isChecked: boolean) => void;
  onPrint: (order: Order) => void;
}) => {
  const statusInfo = ORDER_STATUS_MAP[order.status || 'pending'];
  const customerName = order.customer?.name || 'Cliente Desconhecido';
  const orderNumber = order.id ? order.id.slice(-4) : 'N/A';
  
  // NOVO: Verifica se o pedido está aguardando pagamento
  const isPendingPayment = order.status === 'pending_payment';

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col relative">
      <div className="absolute top-3 left-3 z-10">
        <Checkbox 
          checked={isSelected} 
          onCheckedChange={(checked) => onSelect(order.id, !!checked)} 
          className="h-5 w-5"
        />
      </div>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pl-12">
        <CardTitle className="text-lg font-bold flex items-center gap-2">Pedido #{orderNumber}</CardTitle>
        <Badge className={cn("text-white", statusInfo.color)}><statusInfo.icon className="h-3 w-3 mr-1" />{statusInfo.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-2 flex-grow flex flex-col justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Cliente: {customerName}</p>
          <p className="text-2xl font-extrabold text-primary">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_amount)}</p>
        </div>
        <div className="flex justify-end pt-2 border-t gap-2">
          {/* Condição para mostrar Aceitar/Recusar: Apenas se for 'pending' E NÃO for 'pending_payment' */}
          {order.status === 'pending' && !isPendingPayment && (
            <>
              <Button variant="destructive" size="sm" onClick={() => onDecline(order.id)}><X className="h-4 w-4 mr-1" /> Recusar</Button>
              <Button variant="default" size="sm" onClick={() => onAccept(order.id)}><Check className="h-4 w-4 mr-1" /> Aceitar</Button>
            </>
          )}
          
          {/* Se for 'pending_payment', podemos mostrar uma mensagem ou apenas os botões de detalhes/impressão */}
          {isPendingPayment && (
            <Badge variant="secondary" className="bg-gray-100 text-gray-600">Aguardando Pagamento</Badge>
          )}
          
          <Button variant="outline" size="sm" onClick={() => onViewDetails(order)}>Detalhes</Button>
          <Button variant="outline" size="icon" onClick={() => onPrint(order)}>
            <Printer className="h-4 w-4" />
          </Button>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tem certeza que deseja excluir?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação é permanente. O pedido #{orderNumber} será excluído permanentemente do sistema, incluindo todos os itens associados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => onDelete(order.id)}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Excluir Permanentemente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
};

const OrdersList = ({ status, onViewDetails, restaurantId, selectedOrders, setSelectedOrders, totalOrdersInView, onPrint }: { 
  status: Enums<'order_status'> | 'all', 
  onViewDetails: (order: Order) => void, 
  restaurantId: string,
  selectedOrders: string[],
  setSelectedOrders: React.Dispatch<React.SetStateAction<string[]>>,
  totalOrdersInView: number,
  onPrint: (order: Order) => void;
}) => {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery<FetchOrdersResult>({
    queryKey: ['orders', status, restaurantId, currentPage],
    queryFn: () => fetchOrders(restaurantId, status, currentPage - 1),
    enabled: !!restaurantId,
  });

  const orders = data?.orders || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, newStatus }: { orderId: string, newStatus: Enums<'order_status'> }) => {
      // CORREÇÃO: Se o status for 'pending_payment', não deve ser aceito/recusado aqui.
      // A lógica de aceitar/recusar só deve ser chamada para 'pending'.
      // Se for 'pending', muda para 'preparing'.
      const statusToSet = newStatus === 'pending' ? 'preparing' : newStatus; 
      const { error } = await supabase.from('orders').update({ status: statusToSet }).eq('id', orderId);
      if (error) throw new Error(error.message);
      return statusToSet;
    },
    onSuccess: (newStatus) => {
      toast.success(`Pedido ${newStatus === 'preparing' ? 'aceito' : 'recusado'} com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err) => toast.error(`Erro ao atualizar pedido: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.from('orders').delete().eq('id', orderId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Pedido excluído permanentemente.');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err) => toast.error(`Erro ao excluir pedido: ${err.message}`),
  });

  const handleAccept = (orderId: string) => {
    // Garante que só aceita se o status for 'pending' (não 'pending_payment')
    const order = orders.find(o => o.id === orderId);
    if (order && order.status === 'pending') {
        updateStatusMutation.mutate({ orderId, newStatus: 'preparing' as Enums<'order_status'> });
    } else {
        toast.error("Ação inválida. O pedido não está no status Pendente.");
    }
  };
  const handleDecline = (orderId: string) => {
    // Garante que só recusa se o status for 'pending' (não 'pending_payment')
    const order = orders.find(o => o.id === orderId);
    if (order && order.status === 'pending') {
        updateStatusMutation.mutate({ orderId, newStatus: 'cancelled' });
    } else {
        toast.error("Ação inválida. O pedido não está no status Pendente.");
    }
  };
  const handleViewDetails = (order: Order) => {
    onViewDetails(order);
  };
  const handleDelete = (orderId: string) => {
    deleteMutation.mutate(orderId);
  };
  
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleSelectOrder = useCallback((orderId: string, isChecked: boolean) => {
    setSelectedOrders(prev => {
      if (isChecked) {
        return [...prev, orderId];
      } else {
        return prev.filter(id => id !== orderId);
      }
    });
  }, [setSelectedOrders]);

  const handleSelectAll = useCallback((isChecked: boolean) => {
    if (isChecked) {
      const allIds = orders.map(o => o.id);
      setSelectedOrders(prev => [...new Set([...prev, ...allIds])]);
    } else {
      const currentIds = new Set(orders.map(o => o.id));
      setSelectedOrders(prev => prev.filter(id => !currentIds.has(id)));
    }
  }, [orders, setSelectedOrders]);

  const isAllSelected = orders.length > 0 && orders.every(o => selectedOrders.includes(o.id));

  if (isLoading) return <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[...Array(4)].map((_, i) => <Card key={i}><CardContent className="p-4 space-y-3"><Skeleton className="h-32 w-full" /></CardContent></Card>)}</div>;
  if (isError) return <Alert variant="destructive"><Terminal className="h-4 w-4" /><AlertTitle>Erro ao carregar pedidos</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Ocorreu um erro desconhecido."}</AlertDescription><Button onClick={() => refetch()} className="mt-3" variant="secondary" size="sm"><RefreshCw className="h-4 w-4 mr-2" /> Tentar Novamente</Button></Alert>;
  if (!orders || orders.length === 0) return <div className="text-center py-12 bg-card rounded-lg border"><ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><p className="text-lg font-semibold">Nenhum pedido encontrado.</p><p className="text-sm text-muted-foreground">Verifique o status selecionado ou aguarde novos pedidos.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 p-3 border rounded-lg bg-muted/50">
        <Checkbox 
          checked={isAllSelected} 
          onCheckedChange={handleSelectAll} 
          className="h-5 w-5"
        />
        <span className="text-sm font-medium">
          Selecionar todos ({orders.length}) nesta página.
        </span>
        {totalOrdersInView > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {totalOrdersInView} pedidos selecionados no total.
          </span>
        )}
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {orders.map((order) => (
          <OrderCard 
            key={order.id} 
            order={order} 
            onViewDetails={handleViewDetails} 
            onAccept={handleAccept} 
            onDecline={handleDecline} 
            onDelete={handleDelete}
            isSelected={selectedOrders.includes(order.id)}
            onSelect={handleSelectOrder}
            onPrint={onPrint}
          />
        ))}
      </div>
      
      {totalPages > 1 && (
        <div className="flex justify-center pt-4">
          <PaginationComponent 
            currentPage={currentPage} 
            totalPages={totalPages} 
            onPageChange={handlePageChange} 
          />
        </div>
      )}
    </div>
  );
};

const Orders = () => {
  const { userRestaurantId } = useOutletContext<DashboardContextType>();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [massAction, setMassAction] = useState<Enums<'order_status'> | 'delete' | ''>('');
  
  const handleViewDetails = (order: Order) => { setSelectedOrder(order); setIsModalOpen(true); };
  const handleCloseModal = () => { setIsModalOpen(false); setSelectedOrder(null); };
  
  const handleRefreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['orders', userRestaurantId] });
    toast.info("Atualizando pedidos...", { description: "Buscando novos dados no servidor." });
  };

  // Função para buscar itens do pedido para impressão
  const fetchOrderItemsForPrint = async (orderId: string) => {
    const { data, error } = await supabase
      .from('order_items')
      .select('*, products(name)')
      .eq('order_id', orderId);
    
    if (error) throw new Error(`Erro ao buscar itens do pedido: ${error.message}`);
    return data;
  };

  // Função para imprimir pedido (Definida no componente Orders)
  const handlePrintOrder = async (order: Order) => {
    try {
      // 1. Buscar itens do pedido
      const items = await fetchOrderItemsForPrint(order.id);
      
      // 2. Buscar o nome do método de pagamento
      let paymentMethodName = 'Não especificado';
      if (order.payment_method_id) {
        paymentMethodName = await fetchPaymentMethodName(order.payment_method_id);
      }
      
      // 3. Gerar conteúdo HTML para impressão
      const printContent = generatePrintContent(order, items, paymentMethodName);
      
      // 4. Criar janela de impressão
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Pedido #${order.id ? order.id.slice(-4) : 'N/A'}</title>
              <style>
                @media print {
                  body { margin: 0; }
                  /* Estilo para garantir que a linha tracejada apareça */
                  .dashed-line { border-top: 1px dashed #000; }
                }
              </style>
            </head>
            <body>
              ${printContent}
              <script>
                window.onload = function() {
                  window.print();
                  window.onafterprint = function() {
                    window.close();
                  }
                }
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        toast.error('Não foi possível abrir a janela de impressão. Verifique as permissões do navegador.');
      }
    } catch (error) {
      console.error('Erro ao preparar impressão do pedido:', error);
      toast.error('Erro ao preparar impressão do pedido.');
    }
  };

  const massActionMutation = useMutation({
    mutationFn: async ({ orderIds, action }: { orderIds: string[], action: Enums<'order_status'> | 'delete' }) => {
      if (action === 'delete') {
        const { error } = await supabase.from('orders').delete().in('id', orderIds);
        if (error) throw new Error(error.message);
        return 'deleted';
      } else {
        // Se a ação for 'pending_payment', não deve ser permitido em massa, mas vamos permitir a mudança de status
        const statusToSet = action === 'pending' ? 'preparing' : action;
        const { error } = await supabase.from('orders').update({ status: statusToSet }).in('id', orderIds);
        if (error) throw new Error(error.message);
        return 'updated';
      }
    },
    onSuccess: (result, variables) => {
      if (result === 'deleted') {
        toast.success(`${variables.orderIds.length} pedidos excluídos permanentemente.`);
      } else {
        const statusLabel = ORDER_STATUS_MAP[variables.action as Enums<'order_status'>].label;
        toast.success(`${variables.orderIds.length} pedidos atualizados para "${statusLabel}".`);
      }
      setSelectedOrders([]);
      setMassAction('');
      queryClient.invalidateQueries({ queryKey: ['orders', userRestaurantId] });
    },
    onError: (err) => {
      toast.error(`Erro na ação em massa: ${err.message}`);
    },
  });

  const handleApplyMassAction = () => {
    if (!massAction || selectedOrders.length === 0) return;

    if (massAction === 'delete') {
      document.getElementById('mass-delete-trigger')?.click();
    } else {
      massActionMutation.mutate({ orderIds: selectedOrders, action: massAction as Enums<'order_status'> | 'delete' });
    }
  };

  const statusTabs: { value: Enums<'order_status'> | 'all', label: string }[] = [
    { value: 'pending_payment', label: 'Aguardando Pag.' }, 
    { value: 'pending', label: 'Pendentes' }, 
    { value: 'preparing', label: 'Em Preparação' }, 
    { value: 'ready', label: 'Prontos' }, 
    { value: 'delivering', label: 'Em Entrega' },
    { value: 'delivered', label: 'Entregues' }, 
    { value: 'cancelled', label: 'Cancelados' },
    { value: 'all', label: 'Todos' }, 
  ];

  const isMassActionPending = massActionMutation.isPending;

  if (!userRestaurantId) {
      return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }

  return (
    <>
      <OrderDetailsModal order={selectedOrder} isOpen={isModalOpen} onClose={handleCloseModal} />
      
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button id="mass-delete-trigger" className="hidden" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja excluir {selectedOrders.length} pedidos?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. {selectedOrders.length} pedidos serão excluídos permanentemente do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => massActionMutation.mutate({ orderIds: selectedOrders, action: 'delete' })}
              className="bg-destructive hover:bg-destructive/90"
              disabled={isMassActionPending}
            >
              {isMassActionPending ? 'Excluindo...' : 'Excluir Permanentemente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-6">
        <div className="flex flex-wrap gap-4 justify-between items-center">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleRefreshAll}>
              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar Dados
            </Button>
          </div>
          
          {selectedOrders.length > 0 && (
            <div className="flex items-center gap-2 p-2 border rounded-lg bg-card shadow-lg animate-fade-in">
              <ShoppingCart className="h-5 w-5 text-primary mr-2" />
              <span className="text-sm font-medium mr-4">{selectedOrders.length} selecionado(s)</span>
              
              <Select value={massAction} onValueChange={(value) => setMassAction(value as Enums<'order_status'> | 'delete')}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Ação em Massa" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button 
                onClick={handleApplyMassAction} 
                disabled={!massAction || isMassActionPending}
              >
                {isMassActionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
              </Button>
            </div>
          )}
        </div>
        
        {userRestaurantId ? (
          <Tabs defaultValue="pending">
            <TabsList className="w-full overflow-x-auto justify-start">{statusTabs.map(tab => <TabsTrigger key={tab.value} value={tab.value} className="whitespace-nowrap">{tab.label}</TabsTrigger>)}</TabsList>
            {statusTabs.map(tab => (
              <TabsContent key={tab.value} value={tab.value} className="mt-6">
                <OrdersList 
                  status={tab.value} 
                  onViewDetails={handleViewDetails} 
                  restaurantId={userRestaurantId}
                  selectedOrders={selectedOrders}
                  setSelectedOrders={setSelectedOrders}
                  totalOrdersInView={selectedOrders.length}
                  onPrint={handlePrintOrder}
                />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="text-center py-12"><Skeleton className="h-12 w-12 mx-auto mb-4" /><p>Carregando dados do restaurante...</p></div>
        )}
      </main>
    </>
  );
};

export default Orders;