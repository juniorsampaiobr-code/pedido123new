import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, Enums } from '@/integrations/supabase/types';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, ShoppingCart, Clock, MapPin, Copy, RefreshCw, LogOut, User as UserIcon, Phone, Search } from 'lucide-react';
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
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CategoryNavigation } from '@/components/CategoryNavigation';
import { Input } from '@/components/ui/input';

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
    .eq('id', restaurantId) // Busca pelo ID específico
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
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const isMobile = useIsMobile();
  const { totalItems } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { data: user } = useAuthStatus();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Busca dados estáticos do menu (restaurante, categorias, produtos)
  const { data: menuData, isLoading: isLoadingMenu, isError: isErrorMenu, error: errorMenu, refetch } = useQuery<MenuData>({
    queryKey: ['menuData', restaurantId],
    queryFn: () => fetchMenuData(restaurantId!),
    enabled: !!restaurantId,
    staleTime: 1000 * 60 * 1,
  });
  
  // 2. Busca horários em tempo real
  const { hours: realtimeHours, isLoading: isLoadingHours } = useBusinessHoursRealtime(restaurantId);

  // 3. Busca dados do cliente logado
  const { data: customer } = useQuery<Customer | null>({
    queryKey: ['menuCustomerData', user?.id],
    queryFn: () => fetchCustomerData(user!.id),
    enabled: !!user,
    staleTime: 0,
  });

  // 4. Lógica de Status de Negócio
  const { isOpen, todayHours } = useMemo(() => {
    if (realtimeHours && realtimeHours.length > 0) {
      return getBusinessStatus(realtimeHours);
    }
    return { isOpen: true, todayHours: 'Horário não configurado' };
  }, [realtimeHours]);
  
  // 5. Lógica de Filtragem
  const filteredCategories = useMemo(() => {
    const categories = menuData?.categories || [];
    const term = searchTerm.toLowerCase().trim();
    
    if (!term) {
      return categories.map(category => ({
        ...category,
        products: category.products.filter(p => p.is_available),
      })).filter(category => category.products.length > 0);
    }

    return categories.map(category => {
      const filteredProducts = category.products.filter(product => 
        product.is_available && 
        (product.name.toLowerCase().includes(term) || 
         product.description?.toLowerCase().includes(term))
      );
      return {
        ...category,
        products: filteredProducts,
      };
    }).filter(category => category.products.length > 0);
    
  }, [menuData?.categories, searchTerm]);
  
  // Determina se o checkout deve ser bloqueado
  const isCheckoutBlocked = !isOpen;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Você saiu da sua conta.");
    window.location.reload();
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

  const restaurant = menuData.restaurant;
  const availableCategories = filteredCategories;
  
  const isSearching = searchTerm.length > 0;

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
              <div>
                <h1 className="text-xl font-bold">{restaurant.name}</h1>
                {restaurant.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">{restaurant.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {user && (
                <>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsProfileModalOpen(true)}
                    aria-label="Meu Perfil e Pedidos"
                  >
                    <UserIcon className="h-4 w-4 mr-2" /> Perfil / Pedidos
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
          
          {/* Restaurant Info (Status, Address, Phone) */}
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <BusinessStatus restaurant={restaurant} hours={realtimeHours} />
            
            {/* NOVO: Telefone do Restaurante */}
            {restaurant.phone && (
              <a 
                href={`tel:${restaurant.phone.replace(/\D/g, '')}`} 
                className="flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <Phone className="h-4 w-4 mr-1" />
                {restaurant.phone}
              </a>
            )}
          </div>
          
          {/* Campo de Pesquisa */}
          <div className="relative mt-4 mb-4"> {/* Adicionando mb-4 para separar da navegação */}
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              className="pl-10 h-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {/* Navegação de Categorias Fixa (AGORA DENTRO DO HEADER) */}
          {!isSearching && availableCategories.length > 1 && (
            <CategoryNavigation categories={availableCategories} />
          )}
        </div>
      </header>
      
      <main className="flex-1 container mx-auto px-4 py-8 flex">
        <div className="flex-1 w-full lg:max-w-3xl xl:max-w-4xl">
          {/* Aviso de Loja Fechada */}
          {!isOpen && <StoreClosedWarning todayHours={todayHours} />}
          
          {/* Mensagem de Nenhum Resultado */}
          {isSearching && availableCategories.length === 0 && (
            <div className="text-center py-12 bg-card rounded-lg border">
              <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-semibold">Nenhum produto encontrado.</p>
              <p className="text-sm text-muted-foreground">Tente um termo de pesquisa diferente.</p>
            </div>
          )}

          {/* Lista de Categorias e Produtos */}
          <div className="space-y-10">
            {availableCategories.map(category => (
              <section 
                key={category.id} 
                // Aplica o ID para rolagem
                id={`category-${category.id}`} 
                // Ajustando para 120px para compensar o cabeçalho fixo
                className={cn("scroll-mt-[200px]", isSearching && "pt-0")} // Aumentando o offset para 200px para garantir que o título apareça
              >
                <h2 className="text-3xl font-bold mb-6 border-b pb-2">
                  {isSearching ? 'Resultados da Pesquisa' : category.name}
                </h2>
                <div className="grid gap-6 grid-cols-2 lg:grid-cols-3"> 
                  {category.products
                    .map(product => (
                      <ProductCard 
                        key={product.id} 
                        product={product} 
                        isCheckoutBlocked={isCheckoutBlocked}
                      />
                    ))}
                </div>
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
    </div>
  );
};

export default Menu;