import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, Enums } from '@/integrations/supabase/types';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, ShoppingCart, Clock, MapPin, Copy, RefreshCw, LogOut, User as UserIcon } from 'lucide-react';
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
import { useParams } from 'react-router-dom';
import { useAuthStatus } from '@/hooks/use-auth-status';
import { useBusinessHoursRealtime } from '@/hooks/use-business-hours-realtime';
import { CustomerProfileModal } from '@/components/CustomerProfileModal';
import { Card } from '@/components/ui/card'; // Added missing import

type Restaurant = Tables<'restaurants'>;
type Category = Tables<'categories'>;
type Product = Tables<'products'>;
type BusinessHour = Tables<'business_hours'>;
type Customer = Tables<'customers'>;

interface MenuData {
  restaurant: Restaurant;
  categories: (Category & { products: Product[] })[];
}

const fetchMenuData = async (restaurantId: string): Promise<MenuData> => {
  // 1. Busca o restaurante específico
  const { data: restaurantData, error: restaurantError } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (restaurantError && restaurantError.code !== 'PGRST116') throw new Error(`Erro ao buscar restaurante: ${restaurantError.message}`);
  if (!restaurantData) throw new Error('Restaurante não encontrado ou inativo.');

  // 2. Busca categorias e produtos (Horários serão buscados via Realtime Hook)
  const [categoriesResult, productsResult] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', restaurantData.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restaurantData.id),
  ]);

  if (categoriesResult.error) throw new Error(`Erro ao buscar categorias: ${categoriesResult.error.message}`);
  if (productsResult.error) throw new Error(`Erro ao buscar produtos: ${productsResult.error.message}`);

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
  };
};

// Função para buscar dados do cliente (reutilizada do Checkout)
const fetchCustomerData = async (userId: string): Promise<Customer | null> => {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data || null;
};

const Menu = () => {
  const { restaurantId } = useParams<{ restaurantId: string }>(); // Obtém o ID da URL
  const isMobile = useIsMobile();
  const { totalItems } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { data: user } = useAuthStatus(); // Obtém o status de autenticação
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false); // NOVO ESTADO

  // 1. Busca dados estáticos do menu (restaurante, categorias, produtos)
  const { data: menuData, isLoading: isLoadingMenu, isError: isErrorMenu, error: errorMenu, refetch } = useQuery<MenuData>({
    queryKey: ['menuData', restaurantId], // Adiciona restaurantId na chave
    queryFn: () => fetchMenuData(restaurantId!),
    enabled: !!restaurantId, // Só executa se tiver o ID
    staleTime: 1000 * 60 * 1, // 1 minuto
  });
  
  // 2. Busca horários em tempo real
  const { hours: realtimeHours, isLoading: isLoadingHours, isError: isErrorHours } = useBusinessHoursRealtime(restaurantId);

  // 3. Busca dados do cliente logado
  const { data: customer, isLoading: isLoadingCustomer } = useQuery<Customer | null>({
    queryKey: ['menuCustomerData', user?.id],
    queryFn: () => fetchCustomerData(user!.id),
    enabled: !!user,
    staleTime: 0,
  });

  const { isOpen, todayHours } = useMemo(() => {
    if (realtimeHours) {
      return getBusinessStatus(realtimeHours);
    }
    return { isOpen: true, todayHours: 'Horário não configurado' };
  }, [realtimeHours]);
  
  // Determina se o checkout deve ser bloqueado
  const isCheckoutBlocked = !isOpen;

  const copyMenuLink = () => {
    if (menuData?.restaurant) {
      // O link agora inclui o ID do restaurante
      const menuLink = `${window.location.origin}${window.location.pathname}#/menu/${restaurantId}`;
      navigator.clipboard.writeText(menuLink);
      toast.success("Link do cardápio copiado!");
    }
  };
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Você saiu da sua conta.");
    // Redireciona para a página de autenticação do cliente
    window.location.reload(); // Força o recarregamento para limpar o estado do cliente
  };

  if (!restaurantId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-lg">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Erro de Acesso</AlertTitle>
          <AlertDescription>
            O link do cardápio está incompleto. Por favor, use o link fornecido no painel de administração.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoadingMenu || isLoadingHours) {
    return <LoadingSpinner />;
  }

  if (isErrorMenu || !menuData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg w-full text-center">
          <Alert variant="destructive">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Erro ao carregar cardápio</AlertTitle>
            <AlertDescription>
              {errorMenu instanceof Error ? errorMenu.message : "Ocorreu um erro desconhecido ao buscar os dados do restaurante."}
            </AlertDescription>
            <Button onClick={() => refetch()} className="mt-3" variant="secondary" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" /> Tentar Novamente
            </Button>
          </Alert>
        </Card>
      </div>
    );
  }

  const { restaurant, categories } = menuData;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Modal de Perfil do Cliente */}
      <CustomerProfileModal 
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        customer={customer}
      />

      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-30 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">{restaurant.name}</h1>
            </div>
            <div className="flex items-center gap-2">
              {user && (
                <>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => setIsProfileModalOpen(true)}
                    aria-label="Meu Perfil"
                  >
                    <UserIcon className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" /> Sair
                  </Button>
                </>
              )}
              {isMobile && totalItems > 0 && (
                <FloatingCartButton 
                  onClick={() => setIsCartOpen(true)} 
                  totalItems={totalItems} 
                  isCheckoutBlocked={isCheckoutBlocked}
                />
              )}
            </div>
          </div>
          
          {/* Restaurant Menu Link */}
          <div className="mt-3 flex items-center justify-between">
            <BusinessStatus restaurant={restaurant} hours={realtimeHours} />
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
                      <ProductCard 
                        key={product.id} 
                        product={product} 
                        isCheckoutBlocked={isCheckoutBlocked} // Passando a prop
                      />
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
          <CartSidebar isCheckoutBlocked={isCheckoutBlocked} restaurantId={restaurantId} />
        </div>
      </main>
      
      {/* Sidebar do Carrinho (Mobile) */}
      {isMobile && (
        <CartSidebar isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} isCheckoutBlocked={isCheckoutBlocked} restaurantId={restaurantId} />
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