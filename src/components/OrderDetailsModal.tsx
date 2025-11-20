// ... (código existente, apenas pequenas alterações para garantir compatibilidade) ...

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

// ... (restante do código existente) ...