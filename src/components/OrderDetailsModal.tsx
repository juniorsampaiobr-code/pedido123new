import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, User, Phone, MapPin, CreditCard, Truck, Clock, Calendar, Euro, Package, CheckCircle, XCircle, Check } from 'lucide-react';
import { Tables, Enums } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type OrderBase = Tables<'orders'>;
type Customer = Tables<'customers'>;
type PaymentMethod = Tables<'payment_methods'>;

// Definindo o tipo Order com as relações que estamos buscando
type Order = OrderBase & {
  customer: Customer | null;
  payment_methods: Pick<PaymentMethod, 'name'> | null;
};

// Atualizando OrderItem para incluir is_price_by_weight do produto
type OrderItem = Tables<'order_items'> & {
  products: (Tables<'products'> & { is_price_by_weight: boolean | null }) | null;
};

const ORDER_STATUS_MAP: Record<Enums<'order_status'>, { label: string, icon: React.ElementType, color: string }> = {
  pending: { label: 'Pendente', icon: Clock, color: 'bg-yellow-500' },
  preparing: { label: 'Em Preparação', icon: Package, color: 'bg-orange-500' },
  ready: { label: 'Pronto', icon: CheckCircle, color: 'bg-green-500' },
  delivering: { label: 'Em Entrega', icon: Truck, color: 'bg-blue-500' },
  delivered: { label: 'Entregue', icon: Check, color: 'bg-purple-500' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'bg-destructive' },
  pending_payment: { label: 'Aguardando Pagamento', icon: Euro, color: 'bg-gray-500' },
};

const fetchOrderItems = async (orderId: string): Promise<OrderItem[]> => {
  const { data, error } = await supabase
    .from('order_items')
    .select('*, products(name, is_price_by_weight)')
    // Buscando is_price_by_weight
    .eq('order_id', orderId);
  if (error) throw new Error(error.message);
  return data as OrderItem[];
};

// Função para buscar os detalhes do pedido com as relações
const fetchOrderDetails = async (orderId: string): Promise<Order> => {
  const { data, error } = await supabase
    .from('orders')
    .select(` 
      *, 
      customer:customers(name, phone, cpf_cnpj, email, street, number, neighborhood, city, zip_code, complement, state), 
      payment_methods(name) 
    `)
    .eq('id', orderId)
    .limit(1)
    .single();
  if (error) throw new Error(`Erro ao buscar detalhes do pedido: ${error.message}`);
  if (!data) throw new Error('Pedido não encontrado.');

  // Log temporário para depuração
  console.log("Dados do pedido carregados:", data);

  // O cast é seguro porque a query acima garante as relações
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

  // Estado para o nome do método de pagamento buscado separadamente
  const [paymentMethodName, setPaymentMethodName] = useState<string>('Carregando...');

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

  // Efeito para buscar o nome do método de pagamento separadamente
  useEffect(() => {
    const fetchPaymentMethodName = async () => {
      if (!order?.payment_method_id) {
        setPaymentMethodName('Não especificado');
        return;
      }
      try {
        const { data, error } = await supabase
          .from('payment_methods')
          .select('name')
          .eq('id', order.payment_method_id)
          .single();
        if (error) throw error;
        setPaymentMethodName(data?.name || 'Método não encontrado');
      } catch (err) {
        console.error("Failed to fetch payment method name:", err);
        setPaymentMethodName('Erro ao carregar');
      }
    };

    if (isOpen && order) {
      fetchPaymentMethodName();
    }
  }, [isOpen, order]);

  // Log temporário para depuração
  useEffect(() => {
    if (order) {
      console.log("Order prop recebida:", order);
    }
  }, [order]);

  // Extraindo dados do pedido
  const customerName = order?.customer?.name || 'Cliente Desconhecido';
  const customerPhone = order?.customer?.phone;
  const customerEmail = order?.customer?.email;
  const customerCpfCnpj = order?.customer?.cpf_cnpj;

  // Formatação do endereço com a nova ordem
  const deliveryAddress = useMemo(() => {
    if (!order?.customer) return null;
    
    const { street, number, neighborhood, city, state, zip_code, complement } = order.customer;
    
    // Se não tiver rua, não tem endereço completo
    if (!street) return null;
    
    const parts = [];
    
    // 1. Rua e Número
    if (street) parts.push(street);
    if (number) parts.push(number);
    
    // 2. Bairro
    if (neighborhood) parts.push(neighborhood);
    
    // Endereço principal
    let addressLine = parts.join(', ');
    
    // 3. Cidade e Estado
    const locationParts = [];
    if (city) locationParts.push(city);
    if (state) locationParts.push(state);
    let locationLine = locationParts.join(' - ');
    
    // 4. CEP
    const cleanedZip = zip_code?.replace(/\D/g, '') || '';
    let formattedZip = '';
    if (cleanedZip.length === 8) {
      formattedZip = `${cleanedZip.slice(0, 5)}-${cleanedZip.slice(5)}`;
    }
    if (formattedZip) {
      locationLine += (locationLine ? ', CEP: ' : 'CEP: ') + formattedZip;
    }
    
    // 5. Complemento (entre parênteses)
    if (complement) {
      locationLine += (locationLine ? ', ' : '') + `(Comp: ${complement})`;
    }
    
    // Combina as linhas
    const fullAddress = [addressLine, locationLine].filter(Boolean).join(', ');
    return fullAddress || null;
  }, [order?.customer]);

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
                  <p>{deliveryAddress || 'Retirada no local'}</p>
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
                {orderItems.map((item) => {
                  const isWeight = item.products?.is_price_by_weight;
                  const quantityLabel = isWeight ? `${item.quantity} kg` : `${item.quantity} x`;
                  return (
                    <div key={item.id} className="flex justify-between items-start p-2 bg-muted/50 rounded">
                      <div>
                        <p className="font-medium">{item.products?.name || 'Produto não encontrado'}</p>
                        {item.notes && <p className="text-xs text-muted-foreground">Obs: {item.notes}</p>}
                      </div>
                      <div className="text-right">
                        <p>{quantityLabel} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price)}</p>
                        <p className="font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.subtotal)}</p>
                      </div>
                    </div>
                  );
                })}
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