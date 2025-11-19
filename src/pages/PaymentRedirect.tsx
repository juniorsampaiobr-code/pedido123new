import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Order = Tables<'orders'>;
type OrderItem = Tables<'order_items'> & { products: Pick<Tables<'products'>, 'name'> | null };
type Customer = Tables<'customers'>;
type Restaurant = Pick<Tables<'restaurants'>, 'id' | 'name'>;

// 1. Fetch Order Details
const fetchOrderDetails = async (orderId: string): Promise<Order> => {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .limit(1)
    .single();
  if (error) throw new Error(`Erro ao buscar pedido: ${error.message}`);
  if (!data) throw new Error('Pedido não encontrado.');
  return data;
};

// 2. Fetch Order Items
const fetchOrderItems = async (orderId: string): Promise<OrderItem[]> => {
  const { data, error } = await supabase
    .from('order_items')
    .select('*, products(name)')
    .eq('order_id', orderId);
  if (error) throw new Error(`Erro ao buscar itens do pedido: ${error.message}`);
  return data as OrderItem[];
};

// 3. Fetch Customer Details
const fetchCustomerDetails = async (customerId: string): Promise<Customer> => {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .limit(1)
    .single();
  if (error) throw new Error(`Erro ao buscar cliente: ${error.message}`);
  return data;
};

// 4. Fetch Restaurant Name
const fetchRestaurantName = async (restaurantId: string): Promise<Restaurant> => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, name')
    .eq('id', restaurantId)
    .limit(1)
    .single();
  if (error) throw new Error(`Erro ao buscar restaurante: ${error.message}`);
  return data;
};

// Helper function to get the base URL for redirection
const getCorrectClientUrl = () => {
  const origin = window.location.origin;
  const pathname = window.location.pathname;
  const firstPathSegment = pathname.split('/')[1];
  
  if (firstPathSegment) {
      return `${origin}/${firstPathSegment}`;
  }
  return origin;
};

const PaymentRedirect = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const clientUrl = getCorrectClientUrl();

  // 1. Fetch Order
  const { data: order, isLoading: isLoadingOrder, isError: isErrorOrder, error: errorOrder } = useQuery<Order>({
    queryKey: ['paymentOrder', orderId],
    queryFn: () => fetchOrderDetails(orderId!),
    enabled: !!orderId,
  });

  // 2. Fetch Items
  const { data: items, isLoading: isLoadingItems } = useQuery<OrderItem[]>({
    queryKey: ['paymentOrderItems', orderId],
    queryFn: () => fetchOrderItems(orderId!),
    enabled: !!orderId,
  });

  // 3. Fetch Customer
  const { data: customer, isLoading: isLoadingCustomer } = useQuery<Customer>({
    queryKey: ['paymentCustomer', order?.customer_id],
    queryFn: () => fetchCustomerDetails(order!.customer_id!),
    enabled: !!order?.customer_id,
  });

  // 4. Fetch Restaurant Name
  const { data: restaurant, isLoading: isLoadingRestaurant } = useQuery<Restaurant>({
    queryKey: ['paymentRestaurant', order?.restaurant_id],
    queryFn: () => fetchRestaurantName(order!.restaurant_id),
    enabled: !!order?.restaurant_id,
  });

  const isLoading = isLoadingOrder || isLoadingItems || isLoadingCustomer || isLoadingRestaurant;
  const isReadyToPay = order && items && customer && restaurant && !isLoading;

  const createPreferenceMutation = useMutation({
    mutationFn: async () => {
      if (!order || !items || !customer || !restaurant) {
        throw new Error("Dados incompletos para iniciar o pagamento.");
      }
      
      const preferenceItems = items.map(item => ({
        name: item.products?.name || 'Item Desconhecido',
        price: item.unit_price,
        quantity: item.quantity,
      }));
      
      const customerCpfCnpj = customer.cpf_cnpj?.replace(/\D/g, '') || undefined;

      const payload = {
        orderId: order.id,
        items: preferenceItems,
        totalAmount: order.total_amount,
        restaurantName: restaurant.name,
        clientUrl: clientUrl,
        customerEmail: customer.email || 'pagador_anonimo@pedido123.com',
        customerCpfCnpj: customerCpfCnpj,
      };

      console.log("LOG: Calling create-payment-preference with payload:", payload);

      const { data, error } = await supabase.functions.invoke('create-payment-preference', {
        body: payload,
      });

      if (error) throw new Error(error.message);
      
      return data as { init_point: string };
    },
    onSuccess: (data) => {
      console.log("LOG: Redirecionando para o Mercado Pago:", data.init_point);
      // Redirecionamento para o Mercado Pago
      window.location.href = data.init_point;
    },
    onError: (err) => {
      console.error("LOG: Erro ao criar preferência de pagamento:", err);
      // Usar console.error em vez de toast.error para evitar problemas de DOM/Sonner
    },
  });

  // Efeito para iniciar a mutação quando todos os dados estiverem prontos
  useEffect(() => {
    if (isReadyToPay && !createPreferenceMutation.isPending && !createPreferenceMutation.isSuccess) {
      createPreferenceMutation.mutate();
    }
  }, [isReadyToPay, createPreferenceMutation]);

  if (!orderId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Alert variant="destructive" className="w-full max-w-md">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Erro de Pedido</AlertTitle>
          <AlertDescription>ID do pedido não fornecido.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isErrorOrder) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Alert variant="destructive" className="w-full max-w-md">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Erro ao Carregar Pedido</AlertTitle>
          <AlertDescription>{errorOrder instanceof Error ? errorOrder.message : "Ocorreu um erro desconhecido."}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading || createPreferenceMutation.isPending) {
    return <LoadingSpinner />;
  }
  
  if (createPreferenceMutation.isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Alert variant="destructive" className="w-full max-w-md">
          <CreditCard className="h-4 w-4" />
          <AlertTitle>Falha ao Iniciar Pagamento</AlertTitle>
          <AlertDescription>
            Não foi possível iniciar o pagamento online. Por favor, volte ao checkout e tente novamente ou escolha outro método.
            <p className="mt-2 text-xs italic">Detalhe: {createPreferenceMutation.error.message}</p>
          </AlertDescription>
          <div className="mt-4">
            <a href={`${clientUrl}/#/checkout`}>
              <Button variant="default">Voltar ao Checkout</Button>
            </a>
          </div>
        </Alert>
      </div>
    );
  }

  // Se a mutação foi bem-sucedida, mas o redirecionamento ainda não ocorreu (improvável, mas por segurança)
  if (createPreferenceMutation.isSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <CreditCard className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
          <p className="text-lg font-semibold">Redirecionando para o Mercado Pago...</p>
          <p className="text-sm text-muted-foreground">Se o redirecionamento não ocorrer, clique no botão abaixo.</p>
          <a href={createPreferenceMutation.data.init_point} target="_self">
            <Button className="mt-4">Ir para o Pagamento</Button>
          </a>
        </div>
      </div>
    );
  }

  // Estado de carregamento final (deve ser breve)
  return <LoadingSpinner />;
};

export default PaymentRedirect;