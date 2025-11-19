import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, Enums } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { Printer } from 'lucide-react';

type Customer = Tables<'customers'> & { cpf_cnpj: string | null, email: string | null };
type Order = Tables<'orders'> & { customer: Customer | null, payment_methods: Tables<'payment_methods'> | null };
type OrderItem = Tables<'order_items'> & { products: Pick<Tables<'products'>, 'name'> | null };

const ORDER_STATUS_MAP: Record<Enums<'order_status'>, { label: string }> = {
  pending: { label: 'Pendente' },
  preparing: { label: 'Em Preparação' },
  ready: { label: 'Pronto' },
  delivering: { label: 'Em Entrega' },
  delivered: { label: 'Entregue' },
  cancelled: { label: 'Cancelado' },
  pending_payment: { label: 'Aguardando Pagamento' },
};

const fetchOrderItems = async (orderId: string): Promise<OrderItem[]> => {
  const { data, error } = await supabase
    .from('order_items')
    .select('*, products(name)')
    .eq('order_id', orderId);
  if (error) throw new Error(error.message);
  return data as OrderItem[];
};

const fetchOrderDetails = async (orderId: string): Promise<Order> => {
  const { data, error } = await supabase
    .from('orders')
    // Adicionando 'email' na seleção do customer
    .select('*, customer:customers(name, phone, cpf_cnpj, email), payment_methods(name)')
    .eq('id', orderId)
    .limit(1)
    .single();

  if (error) throw new Error(`Erro ao buscar detalhes do pedido: ${error.message}`);
  return data as Order;
};

interface OrderDetailsModalProps {
  order: Tables<'orders'> | null; // Recebe o tipo base para evitar problemas de tipagem inicial
  isOpen: boolean;
  onClose: () => void;
}

export const OrderDetailsModal = ({ order, isOpen, onClose }: OrderDetailsModalProps) => {
  const queryClient = useQueryClient();
  const [currentStatus, setCurrentStatus] = useState<Enums<'order_status'>>('pending');

  const { data: fullOrderDetails, isLoading: isLoadingOrderDetails, isError: isErrorOrderDetails } = useQuery<Order>({
    queryKey: ['orderDetails', order?.id],
    queryFn: () => fetchOrderDetails(order!.id),
    enabled: !!order && isOpen,
  });

  useEffect(() => {
    if (fullOrderDetails?.status) {
      setCurrentStatus(fullOrderDetails.status);
    }
  }, [fullOrderDetails]);

  const { data: items, isLoading: isLoadingItems } = useQuery<OrderItem[]>({
    queryKey: ['orderItems', order?.id],
    queryFn: () => fetchOrderItems(order!.id),
    enabled: !!order && isOpen,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: Enums<'order_status'>) => {
      if (!order) throw new Error('Pedido não encontrado.');
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', order.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, newStatus) => {
      toast.success(`Status do pedido atualizado para "${ORDER_STATUS_MAP[newStatus].label}"`);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
    onError: (err) => {
      toast.error(`Erro ao atualizar status: ${err.message}`);
    },
  });

  const handlePrint = () => {
    // Implementação básica de impressão
    window.print();
  };

  if (!order || isLoadingOrderDetails) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg">
          <Skeleton className="h-6 w-1/2 mb-4" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Separator />
            <Skeleton className="h-48 w-full" />
            <Separator />
            <Skeleton className="h-10 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  
  if (isErrorOrderDetails || !fullOrderDetails) return null;

  const orderNumber = fullOrderDetails.created_at ? new Date(fullOrderDetails.created_at).getTime().toString().slice(-4) : 'N/A';
  const customer = fullOrderDetails.customer;
  const paymentMethodName = fullOrderDetails.payment_methods?.name || 'Não Informado';
  const changeFor = fullOrderDetails.change_for;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalhes do Pedido #{orderNumber}</DialogTitle>
          <DialogDescription>
            Gerencie os detalhes e o status deste pedido.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-1">
            <h3 className="font-semibold">Cliente</h3>
            <p className="text-sm text-muted-foreground">Nome: {customer?.name || 'N/A'}</p>
            <p className="text-sm text-muted-foreground">Telefone: {customer?.phone || 'N/A'}</p>
            {/* Adicionando a exibição do email */}
            {customer?.email && (
              <p className="text-sm text-muted-foreground">Email: {customer.email}</p>
            )}
            {customer?.cpf_cnpj && (
              <p className="text-sm text-muted-foreground">CPF/CNPJ: {customer.cpf_cnpj}</p>
            )}
            <p className="text-sm text-muted-foreground">Endereço: {fullOrderDetails.delivery_address || 'Retirada no Local'}</p>
          </div>
          <Separator />
          <div className="space-y-1">
            <h3 className="font-semibold">Pagamento</h3>
            <p className="text-sm text-muted-foreground">Método: {paymentMethodName}</p>
            
            {/* Exibir Troco se for Dinheiro e houver valor */}
            {paymentMethodName === 'Dinheiro' && changeFor !== null && changeFor !== undefined && (
              <p className="text-sm text-muted-foreground">
                Troco para: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(changeFor)}
              </p>
            )}
            {paymentMethodName === 'Dinheiro' && (changeFor === null || changeFor === undefined) && (
              <p className="text-sm text-muted-foreground">
                Troco: Não precisa de troco
              </p>
            )}
          </div>
          <Separator />
          <div>
            <h3 className="font-semibold mb-2">Itens do Pedido</h3>
            {isLoadingItems ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {items?.map(item => (
                  <div key={item.id} className="flex justify-between items-start text-sm border-b pb-2 last:border-b-0">
                    <div>
                      <span className="font-medium">{item.quantity}x {item.products?.name || 'Produto desconhecido'}</span>
                      {item.notes && <p className="text-xs text-destructive italic mt-1">Obs: {item.notes}</p>}
                    </div>
                    <span className="text-muted-foreground">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Separator />
          <div className="space-y-1 text-sm">
            {/* Observações do Pedido - Ajustado para ocupar a linha inteira */}
            <div className="flex flex-col pb-2">
              <span className="font-semibold">Observações do Pedido:</span>
              <span className="text-sm text-muted-foreground mt-1">
                {fullOrderDetails.notes || 'Nenhuma observação.'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span>Taxa de Entrega:</span>
              <span className="font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fullOrderDetails.delivery_fee || 0)}</span>
            </div>
            <div className="flex justify-between font-bold text-base">
              <span>Total:</span>
              <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fullOrderDetails.total_amount)}</span>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <h3 className="font-semibold">Atualizar Status</h3>
            <Select value={currentStatus} onValueChange={(value) => setCurrentStatus(value as Enums<'order_status'>)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um status" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ORDER_STATUS_MAP).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row sm:justify-between sm:space-x-2">
          <Button variant="outline" onClick={handlePrint} className="w-full sm:w-auto mb-2 sm:mb-0">
            <Printer className="h-4 w-4 mr-2" /> Imprimir Pedido
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button 
              onClick={() => updateStatusMutation.mutate(currentStatus)}
              disabled={updateStatusMutation.isPending || currentStatus === fullOrderDetails.status}
            >
              {updateStatusMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};