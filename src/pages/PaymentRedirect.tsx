// ... (código existente, apenas pequenas alterações para garantir compatibilidade) ...

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

// ... (restante do código existente) ...