import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/PhoneInput';
import { CpfCnpjInput } from '@/components/CpfCnpjInput';
import { Tables, TablesUpdate, TablesInsert, Enums } from '@/integrations/supabase/types';
import { User, Save, Loader2, History, Clock, CreditCard, Package, CheckCircle, XCircle, Check, Euro, Truck, Eye, Mail, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';

type Customer = Tables<'customers'>;
type Order = Tables<'orders'> & { 
  order_items: (Tables<'order_items'> & { products: Tables<'products'> | null })[],
  payment_methods: Tables<'payment_methods'> | null,
  restaurants: { name: string | null } | null, // Adicionado relacionamento com restaurantes
};
type OrderStatus = Enums<'order_status'>;

const ORDER_STATUS_MAP: Record<OrderStatus, { label: string, icon: React.ElementType, color: string }> = {
  pending: { label: 'Pendente', icon: Clock, color: 'bg-yellow-500' },
  preparing: { label: 'Em Preparação', icon: Package, color: 'bg-orange-500' },
  ready: { label: 'Pronto', icon: CheckCircle, color: 'bg-green-500' },
  delivering: { label: 'Em Entrega', icon: Truck, color: 'bg-blue-500' },
  delivered: { label: 'Entregue', icon: Check, color: 'bg-primary' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'bg-destructive' },
  pending_payment: { label: 'Aguardando Pag.', icon: Euro, color: 'bg-gray-500' },
};

const cleanPhoneNumber = (phone: string) => phone.replace(/\D/g, '');
const cleanCpfCnpj = (doc: string) => doc.replace(/\D/g, '');

const profileSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório.'),
  phone: z.string().min(1, 'Telefone é obrigatório.').transform(cleanPhoneNumber).refine(val => val.length >= 10, {
    message: 'O telefone deve ter pelo menos 10 dígitos (incluindo DDD).',
  }),
  cpf_cnpj: z.string().min(1, 'CPF/CNPJ é obrigatório.').transform(cleanCpfCnpj).refine(val => val.length === 11 || val.length === 14, {
    message: 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.',
  }),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface CustomerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
}

// Atualizado para buscar o nome do restaurante
const fetchCustomerOrders = async (customerId: string): Promise<Order[]> => {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items(*, products(name)),
      payment_methods(name),
      restaurants(name)
    `)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error("Erro ao buscar pedidos do cliente:", error);
    throw new Error(`Erro ao buscar histórico de pedidos: ${error.message}`);
  }
  return data as Order[];
};

export const CustomerProfileModal = ({ isOpen, onClose, customer }: CustomerProfileModalProps) => {
  const queryClient = useQueryClient();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      phone: '',
      cpf_cnpj: '',
    },
  });
  
  const { data: orders, isLoading: isLoadingOrders } = useQuery<Order[]>({
    queryKey: ['customerOrders', customer?.id],
    queryFn: () => fetchCustomerOrders(customer!.id),
    enabled: !!customer?.id && isOpen,
    staleTime: 0,
  });

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        setUserEmail(user.email || null);
        
        if (customer) {
          form.reset({
            name: customer.name || '',
            phone: customer.phone || '',
            cpf_cnpj: customer.cpf_cnpj || '',
          });
        } else if (isOpen) {
          const userMetadata = user.user_metadata;
          form.reset({
            name: (userMetadata.full_name as string) || '',
            phone: (userMetadata.phone as string) || '',
            cpf_cnpj: (userMetadata.cpf_cnpj as string) || '',
          });
        }
      } else {
        form.reset({ name: '', phone: '', cpf_cnpj: '' });
        setUserEmail(null);
      }
    };
    
    if (isOpen) {
        loadData();
    }
  }, [customer, form, isOpen]);

  const mutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const user = await supabase.auth.getUser();
      const userId = user.data.user?.id;
      
      if (!customer?.id && !userId) throw new Error('ID do cliente ou usuário não encontrado.');
      
      const updateData: TablesUpdate<'customers'> = {
        name: data.name,
        phone: data.phone,
        cpf_cnpj: data.cpf_cnpj || null,
      };

      if (customer?.id) {
        const { error } = await supabase
          .from('customers')
          .update(updateData)
          .eq('id', customer.id);

        if (error) throw new Error(error.message);
      } else if (userId) {
        const insertData: TablesInsert<'customers'> = { 
            ...updateData, 
            user_id: userId, 
            name: data.name,
            phone: data.phone,
            email: user.data.user?.email || null,
        };
        
        const { error } = await supabase
          .from('customers')
          .insert(insertData);
          
        if (error) throw new Error(error.message);
      } else {
        throw new Error('Não foi possível identificar o cliente para salvar.');
      }
    },
    onSuccess: () => {
      toast.success('Perfil atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['menuCustomerData'] });
      queryClient.invalidateQueries({ queryKey: ['checkoutCustomerData'] });
      onClose();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar perfil: ${error.message}`);
    },
  });

  const onSubmit = (data: ProfileFormValues) => {
    mutation.mutate(data);
  };
  
  const formatPrice = (price: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Seu Perfil de Cliente
          </DialogTitle>
          <DialogDescription>
            Atualize seus dados de contato e identificação.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid md:grid-cols-2 gap-6 pt-4">
          
          {/* Coluna 1: Formulário de Perfil */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Dados Pessoais</h3>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                
                <div className="space-y-2">
                    <FormLabel className="flex items-center gap-2">
                        <Mail className="h-4 w-4" /> Email
                    </FormLabel>
                    <Input 
                        value={userEmail || 'N/A'} 
                        disabled 
                        className="bg-muted/50" 
                    />
                    <p className="text-xs text-muted-foreground">O email é usado para login e não pode ser alterado aqui.</p>
                </div>
                
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo *</FormLabel>
                      <FormControl>
                        <Input placeholder="Seu nome" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone *</FormLabel>
                      <FormControl>
                        <PhoneInput {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="cpf_cnpj"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF/CNPJ *</FormLabel>
                      <FormControl>
                        <CpfCnpjInput {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="pt-4">
                  <Button type="submit" disabled={mutation.isPending} className="w-full">
                    {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar Alterações
                  </Button>
                </div>
              </form>
            </Form>
          </div>
          
          {/* Coluna 2: Histórico de Pedidos */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2 flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Últimos Pedidos
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Apenas os 5 pedidos mais recentes são exibidos aqui.
            </p>
            
            {isLoadingOrders ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {orders && orders.length > 0 ? (
                  orders.map(order => {
                    const statusInfo = ORDER_STATUS_MAP[order.status || 'pending'];
                    const orderNumber = order.id ? order.id.slice(-4) : 'N/A';
                    const createdAt = new Date(order.created_at!);
                    const formattedDate = format(createdAt, "dd/MM/yy 'às' HH:mm", { locale: ptBR });
                    const paymentMethodName = order.payment_methods?.name || 'Não especificado';
                    const restaurantName = order.restaurants?.name || 'Loja Desconhecida';
                    
                    const itemSummary = order.order_items
                      .slice(0, 2)
                      .map(item => item.products?.name || 'Item')
                      .join(', ');
                    const remainingItems = order.order_items.length > 2 ? ` +${order.order_items.length - 2} itens` : '';

                    return (
                      <div key={order.id} className="border p-3 rounded-lg hover:bg-muted/50 transition-colors space-y-1">
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex flex-col">
                            <span className="font-bold text-sm">Pedido #{orderNumber}</span>
                            <span className="text-xs font-semibold text-primary flex items-center gap-1 mt-0.5">
                              <Store className="h-3 w-3" /> {restaurantName}
                            </span>
                          </div>
                          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full text-white flex-shrink-0", statusInfo.color)}>
                            {statusInfo.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {itemSummary}{remainingItems}
                        </p>
                        <div className="flex justify-between items-center text-xs text-muted-foreground pt-1 border-t border-dashed border-muted-foreground/30">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{formattedDate}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <CreditCard className="h-3 w-3" />
                            <span>{paymentMethodName}</span>
                          </div>
                          <span className="font-bold text-foreground">{formatPrice(order.total_amount)}</span>
                        </div>
                        
                        <Link to={`/order-success/${order.id}`} onClick={onClose}>
                            <Button variant="secondary" size="sm" className="w-full mt-2 h-7 text-xs">
                                <Eye className="h-3 w-3 mr-2" /> Ver Detalhes
                            </Button>
                        </Link>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum pedido encontrado.</p>
                )}
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter className="pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};