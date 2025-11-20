// ... (código existente, apenas pequenas alterações para garantir compatibilidade) ...

const fetchRestaurantData = async (): Promise<Restaurant> => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, name, address, phone, email, street, number, neighborhood, city, zip_code, latitude, longitude, delivery_enabled')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error) throw new Error(`Erro ao buscar restaurante: ${error.message}`);
  if (!data) throw new Error('Nenhum restaurante ativo encontrado.');
  return data as Restaurant; 
};

// ... (restante do código existente) ...