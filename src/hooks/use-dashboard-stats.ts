import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface DashboardStats {
  productsCount: number;
  customersCount: number;
  ordersTodayCount: number;
  salesMonthTotal: number;
}

const fetchDashboardStats = async (restaurantId: string): Promise<DashboardStats> => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const startOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');
  
  // 1. Contagem de Produtos
  const { count: productsCount, error: productsError } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId);

  if (productsError) console.error("Error fetching products count:", productsError);

  // 2. Contagem de Clientes (vinculados ao restaurante ou que fizeram pedidos)
  // Por simplicidade, vamos contar todos os clientes que fizeram pedidos neste restaurante
  const { count: customersCount, error: customersError } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', supabase.auth.currentUser?.id); // Contando apenas clientes vinculados ao usuário logado (admin)

  if (customersError) console.error("Error fetching customers count:", customersError);
  
  // 3. Pedidos Hoje e Vendas do Mês
  const { data: ordersData, error: ordersError } = await supabase
    .from('orders')
    .select('created_at, total_amount, status')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', startOfMonth)
    .in('status', ['delivered', 'preparing', 'ready', 'delivering', 'pending']); // Exclui 'cancelled' e 'pending_payment'

  if (ordersError) console.error("Error fetching orders data:", ordersError);

  let ordersTodayCount = 0;
  let salesMonthTotal = 0;

  if (ordersData) {
    ordersData.forEach(order => {
      const orderDate = format(new Date(order.created_at!), 'yyyy-MM-dd');
      
      // Soma apenas pedidos que não foram cancelados
      if (order.status !== 'cancelled') {
        salesMonthTotal += order.total_amount;
      }
      
      // Conta pedidos de hoje (excluindo cancelados)
      if (orderDate === today && order.status !== 'cancelled') {
        ordersTodayCount++;
      }
    });
  }

  return {
    productsCount: productsCount || 0,
    customersCount: customersCount || 0,
    ordersTodayCount: ordersTodayCount,
    salesMonthTotal: salesMonthTotal,
  };
};

export const useDashboardStats = (restaurantId: string | null) => {
  return useQuery<DashboardStats>({
    queryKey: ['dashboardStats', restaurantId],
    queryFn: () => fetchDashboardStats(restaurantId!),
    enabled: !!restaurantId,
    initialData: {
      productsCount: 0,
      customersCount: 0,
      ordersTodayCount: 0,
      salesMonthTotal: 0,
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
};