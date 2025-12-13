// ... (código existente, apenas pequenas alterações para garantir compatibilidade) ...

const fetchOrderDetails = async (orderId: string): Promise<Order> => {
  const { data, error } = await supabase
    .from('orders')
    .select('*, customer:customers(name, phone)')
    .eq('id', orderId)
    .limit(1)
    .single();

  if (error) throw new Error(`Erro ao buscar detalhes do pedido: ${error.message}`);
  if (!data) throw new Error('Pedido não encontrado.');
  return data as Order;
};

// ... (restante do código existente) ...