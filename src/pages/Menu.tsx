import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, Enums } from '@/integrations/supabase/types';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, ShoppingCart, Clock, MapPin, Copy } from 'lucide-react';
import { BusinessStatus } from '@/components/BusinessStatus';
import { StoreClosedWarning } from '@/components/StoreClosedWarning';
import { getBusinessStatus } from '@/utils/time';
import { ProductCard } from '@/components/ProductCard';
import { FloatingCartButton } from '@/components/FloatingCartButton';
import { CartSidebar } from '@/components/CartSidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCart } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type Restaurant = Tables<'restaurants'>;
type Category = Tables<'categories'>;
type Product = Tables<'products'>;
type BusinessHour = Tables<'business_hours'>;

interface MenuData {
  restaurant: Restaurant;
  categories: (Category & { products: Product[] })[];
  hours: BusinessHour[];
}

const fetchMenuData = async (): Promise<MenuData> => {
  // Busca o restaurante mais recentemente criado e ativo
  const { data: restaurantData, error: restaurantError } = await supabase
    .from('restaurants')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false }) // Ordena pelo mais novo
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

  if (categoriesResult.error) throw new Error(`Erro ao buscar categorias: ${categoriesResult.error.message}`);
  if (productsResult.error) throw new Error(`Erro ao buscar produtos: ${productsResult.error.message}`);
  if (hoursResult.error) console.warn("Aviso: Erro ao buscar horários de funcionamento:", hoursResult.error.message);

  const productsMap = new Map<string, Product[]>();
  productsResult.data?.forEach(product => {
    if (product.category_id) {
      const list = productsMap.get(product.category_id) || [];
      list.push(product);
      productsMap.set(product.category_id, list);
    }
  });

  const categoriesWithProducts = categoriesResult.data
    .map(category => ({
      ...category,
      products: productsMap.get(category.id) || [],
    }))
    .filter(category => category.products.length > 0);

  return {
    restaurant: restaurantData,
    categories: categoriesWithProducts,
    hours: hoursResult.data || [],
  };
};

const Menu = () => {
  const isMobile = useIsMobile();
  const { totalItems } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);

  const { data: menuData, isLoading, isError, error, refetch } = useQuery<MenuData>({
    queryKey: ['menuData'],
    queryFn: fetchMenuData,
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  const { isOpen, todayHours } = useMemo(() => {
    if (menuData?.hours) {
      return getBusinessStatus(menuData.hours);
    }
    return { isOpen: true, todayHours: 'Horário não configurado' };
  }, [menuData?.hours]);

  const copyMenuLink = () => {
    if (menuData?.restaurant) {
      const menuLink = `${window.location.origin}${window.location.pathname}#/menu`;
      navigator.clipboard.writeText(menuLink);
      toast.success("Link do cardápio copiado!");
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (isError || !menuData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-lg">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Erro ao carregar cardápio</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao buscar os dados do restaurante."}
          </AlertDescription>
          <Button onClick={() => refetch()} className="mt-3" variant="secondary" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" /> Tentar Novamente
          </Button>
        </Alert>
      </div>
    );
  }

  const { restaurant, categories } = menuData;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-30 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">{restaurant.name}</h1>
            </div>
            {isMobile && totalItems > 0 && (
              <FloatingCartButton onClick={() => setIsCartOpen(true)} totalItems={totalItems} />
            )}
          </div>
          
          {/* Restaurant Menu Link */}
          <div className="mt-3 flex items-center justify-between">
            <BusinessStatus restaurant={restaurant} hours={menuData.hours} />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={copyMenuLink}
              className="hidden sm:flex items-center gap-2"
            >
              <Copy className="h-4 w-4" />
              Copiar Link
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 flex">
        <div className="flex-1 max-w-full lg:max-w-3xl xl:max-w-4xl">
          {/* Aviso de Loja Fechada */}
          {!isOpen && <StoreClosedWarning todayHours={todayHours} />}

          {/* Lista de Categorias e Produtos */}
          <div className="space-y-10">
            {categories.map(category => (
              <section key={category.id} id={`category-${category.id}`} className="scroll-mt-20">
                <h2 className="text-3xl font-bold mb-6 border-b pb-2">{category.name}</h2>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {category.products
                    .filter(p => p.is_available)
                    .map(product => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                </div>
                {category.products.filter(p => p.is_available).length === 0 && (
                  <p className="text-muted-foreground">Nenhum produto disponível nesta categoria.</p>
                )}
              </section>
            ))}
          </div>
        </div>

        {/* Sidebar do Carrinho (Desktop) */}
        <div className="hidden lg:block lg:w-96 lg:ml-8 flex-shrink-0 sticky top-20 self-start">
          <CartSidebar />
        </div>
      </main>
      
      {/* Sidebar do Carrinho (Mobile) */}
      {isMobile && (
        <CartSidebar isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      )}
      
      {/* Floating action button for mobile */}
      <div className="fixed bottom-20 right-4 sm:hidden">
        <Button 
          onClick={copyMenuLink}
          className="rounded-full h-12 w-12 shadow-lg"
        >
          <Copy className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default Menu;