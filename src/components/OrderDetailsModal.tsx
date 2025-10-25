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

type Order = Tables<'orders'> & { customer: Tables<'customers'> | null };
type OrderItem = Tables<'order_items'> & { products: Pick<Tables<'products'>, 'name'> | null };

const ORDER_STATUS_MAP: Record<Enums<'order_status'>, { label: string }> = {
  pending: { label: 'Pendente' },
  confirmed: { label: 'Confirmado' },
  preparing: { label: 'Em Preparação' },
  ready: { label: 'Pronto' },
  delivering: { label: 'Em Entrega' },
  delivered: { label: 'Entregue' },
  cancelled: { label: 'Cancelado' },
};

const fetchOrderItems = async (orderId: string): Promise<OrderItem[]> => {
  const { data, error } = await supabase
    .from('order_items')
    .select('*, products(name)')
    .eq('order_id', orderId);
  if (error) throw new Error(error.message);
  return data as OrderItem[];
};

interface OrderDetailsModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

export const OrderDetailsModal = ({ order, isOpen, onClose }: OrderDetailsModalProps) => {
  const queryClient = useQueryClient();
  const [currentStatus, setCurrentStatus] = useState<Enums<'order_status'>>('pending');

  useEffect(() => {
    if (order?.status) {
      setCurrentStatus(order.status);
    }
  }, [order]);

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

  if (!order) return null;

  const orderNumber = order.created_at ? new Date(order.created_at).getTime().toString().slice(-4) : 'N/A';

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
            <p className="text-sm text-muted-foreground">Nome: {order.customer?.name || 'N/A'}</p>
            <p className="text-sm text-muted-foreground">Telefone: {order.customer?.phone || 'N/A'}</p>
            <p className="text-sm text-muted-foreground">Endereço: {order.delivery_address || 'N/A'}</p>
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
                  <div key={item.id} className="flex justify-between items-start text-sm">
                    <div>
                      <span className="font-medium">{item.quantity}x {item.products?.name || 'Produto desconhecido'}</span>
                      {item.notes && <p className="text-xs text-muted-foreground italic">Obs: {item.notes}</p>}
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
            <div className="flex justify-between">
              <span>Taxa de Entrega:</span>
              <span className="font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.delivery_fee || 0)}</span>
            </div>
            <div className="flex justify-between font-bold text-base">
              <span>Total:</span>
              <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_amount)}</span>
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
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button 
            onClick={() => updateStatusMutation.mutate(currentStatus)}
            disabled={updateStatusMutation.isPending || currentStatus === order.status}
          >
            {updateStatusMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};