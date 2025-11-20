// ... (código existente, apenas pequenas alterações para garantir compatibilidade) ...

const fetchMenuData = async (): Promise<MenuData> => {
  const { data: restaurantData, error: restaurantError } = await supabase
    .from('restaurants')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (restaurantError) throw new Error(`Erro ao buscar restaurante: ${restaurantError.message}`);
  if (!restaurantData) throw new Error('Nenhum restaurante ativo encontrado.');

  const restaurantId = restaurantData.id;

  const [categoriesResult, productsResult, hoursResult] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restaurantId),
    supabase
      .from('business_hours')
      .select('*')
      .eq('restaurant_id', restaurantId)
  ]);

  // ... (restante do código existente) ...
};