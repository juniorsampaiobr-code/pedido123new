import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, User, Phone, MapPin, CreditCard, Truck, Clock, Calendar, Euro, Package } from 'lucide-react';
import { Tables, Enums } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Order = Tables<'orders'>;
type OrderItem = Tables<'order_items'> & { products: Tables<'products'> | null };
type Customer = Tables<'customers'>;
type PaymentMethod = Tables<'payment_methods'>;

const ORDER_STATUS_MAP: Record<Enums<'order_status'>, { label: string, icon: React.ElementType, color: string }> = {
  pending: { label: 'Pendente', icon: Clock, color: 'bg-yellow-500' },
  preparing: { label: 'Em Preparação', icon: Package, color: 'bg-orange-500' },
  ready: { label: 'Pronto', icon: CheckCircle, color: 'bg-green-500' },
  delivering: { label: 'Em Entrega', icon: Truck, color: 'bg-blue-500' },
  delivered: { label: 'Entregue', icon: CheckCheck, color: 'bg-purple-500' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'bg-destructive' },
  pending_payment: { label: 'Aguardando Pagamento', icon: Euro, color: 'bg-gray-500' },
};

// Ícones auxiliares (definidos localmente para evitar importações)
const CheckCircle = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>;
const CheckCheck = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>;
const XCircle = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>;

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
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

const OrderDetailsModal = ({ order, isOpen, onClose }: OrderDetailsModalProps) => {
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchItems = async () => {
      if (!order?.id) return;
      
      setIsLoading(true);
      setError(null);
      try {
        const items = await fetchOrderItems(order.id);
        setOrderItems(items);
      } catch (err) {
        console.error("Failed to fetch order items:", err);
        setError("Falha ao carregar itens do pedido.");
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      fetchItems();
    }
  }, [order?.id, isOpen]);

  const customerName = order?.customer?.name || 'Cliente Desconhecido';
  const customerPhone = order?.customer?.phone;
  const customerEmail = order?.customer?.email;
  const customerCpfCnpj = order?.customer?.cpf_cnpj;
  const deliveryAddress = order?.delivery_address;
  const paymentMethodName = order?.payment_methods?.name || 'Não especificado';
  const statusInfo = order?.status ? ORDER_STATUS_MAP[order.status] : null;
  const orderNumber = order?.id ? order.id.slice(-4) : 'N/A';
  const createdAt = order?.created_at ? new Date(order.created_at) : null;
  const formattedDate = createdAt ? format(createdAt, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR }) : 'Data desconhecida';
  const changeFor = order?.change_for ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.change_for) : null;
  const deliveryFee = order?.delivery_fee ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.delivery_fee) : 'Grátis';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Detalhes do Pedido #{orderNumber}</span>
            {statusInfo && (
              <span className={cn("text-xs font-semibold px-2.5 py-0.5 rounded-full text-white flex items-center", statusInfo.color)}>
                <statusInfo.icon className="w-3 h-3 mr-1" />
                {statusInfo.label}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        
        {error && (
          <Alert variant="destructive">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-4 w-1/3" />
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : order && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start">
                <User className="h-4 w-4 mt-0.5 mr-2 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="font-medium">Cliente</p>
                  <p>{customerName}</p>
                  {customerCpfCnpj && <p className="text-muted-foreground text-xs">CPF/CNPJ: {customerCpfCnpj}</p>}
                </div>
              </div>
              <div className="flex items-start">
                <Phone className="h-4 w-4 mt-0.5 mr-2 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="font-medium">Telefone</p>
                  <p>{customerPhone || 'Não informado'}</p>
                  {customerEmail && <p className="text-muted-foreground text-xs">{customerEmail}</p>}
                </div>
              </div>
              <div className="flex items-start md:col-span-2">
                <MapPin className="h-4 w-4 mt-0.5 mr-2 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="font-medium">Endereço de Entrega</p>
                  <p>{deliveryAddress || 'Não informado'}</p>
                </div>
              </div>
              <div className="flex items-start">
                <CreditCard className="h-4 w-4 mt-0.5 mr-2 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="font-medium">Método de Pagamento</p>
                  <p>{paymentMethodName}</p>
                  {changeFor && <p className="text-muted-foreground text-xs">Troco para: {changeFor}</p>}
                </div>
              </div>
              <div className="flex items-start">
                <Calendar className="h-4 w-4 mt-0.5 mr-2 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="font-medium">Data do Pedido</p>
                  <p>{formattedDate}</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Itens do Pedido</h3>
              <div className="space-y-2">
                {orderItems.map((item) => (
                  <div key={item.id} className="flex justify-between items-start p-2 bg-muted/50 rounded">
                    <div>
                      <p className="font-medium">{item.products?.name || 'Produto não encontrado'}</p>
                      {item.notes && <p className="text-xs text-muted-foreground">Obs: {item.notes}</p>}
                    </div>
                    <div className="text-right">
                      <p>{item.quantity} x {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price)}</p>
                      <p className="font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.subtotal)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex justify-between mb-1">
                <span>Subtotal</span>
                <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_amount - (order.delivery_fee || 0))}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span>Taxa de Entrega</span>
                <span>{deliveryFee}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>Total</span>
                <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_amount)}</span>
              </div>
            </div>

            <div className="pt-4">
              {order.notes && (
                <div className="text-sm">
                  <p className="font-medium mb-1">Observações do Cliente:</p>
                  <p className="bg-muted p-2 rounded">{order.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex justify-end pt-4">
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { OrderDetailsModal };