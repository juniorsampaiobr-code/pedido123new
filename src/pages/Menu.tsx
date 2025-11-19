import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, User, LogOut } from "lucide-react";
import { Tables } from '@/integrations/supabase/types';
import { useState, useMemo, useCallback } from 'react';
import { ProductDetailsModal } from '@/components/ProductDetailsModal';
import { WeightProductModal } from '@/components/WeightProductModal';
import { ProductCard } from '@/components/ProductCard';
import { useDebounce } from '@/hooks/useDebounce';
import { Card } from '@/components/ui/card';
import { LazyImage } from '@/components/LazyImage';
import { BusinessStatus } from '@/components/BusinessStatus';
import { getBusinessStatus } from '@/utils/time';
import { StoreClosedWarning } from '@/components/StoreClosedWarning';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FloatingCartButton } from '@/components/FloatingCartButton';
import { CartSidebar } from '@/components/CartSidebar';
import { Input } from '@/components/ui/input'; // Importando Input para a busca
import { Button } from '@/components/ui/button';
import { CustomerProfileModal } from '@/components/CustomerProfileModal'; // Novo import

type Product = Tables<'products'>;
type Restaurant = Tables<'restaurants'>;
type BusinessHour = Tables<'business_hours'>;
type Customer = Tables<'customers'>;

type CategoryWithProducts = Tables<'categories'> & {
  products: Product[];
};

interface MenuData {
  restaurant: Restaurant;
  menu: CategoryWithProducts[];
  hours: BusinessHour[];
}

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

  if (categoriesResult.error) throw new Error(`Erro ao buscar categorias: ${categoriesResult.error.message}`);
  if (productsResult.error) throw new Error(`Erro ao buscar produtos: ${productsResult.error.message}`);
  if (hoursResult.error) throw new Error(`Erro ao buscar horários: ${hoursResult.error.message}`);


  const productsByCategory = (categoriesResult.data || []).map(category => ({
    ...category,
    products: (productsResult.data || []).filter(product => product.category_id === category.id)
  })).filter(category => category.products.length > 0);

  return { 
    restaurant: restaurantData, 
    menu: productsByCategory as CategoryWithProducts[],
    hours: hoursResult.data as BusinessHour[],
  };
};

// Função para buscar dados do cliente logado
const fetchCustomerData = async (): Promise<Customer | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  // 1. Tenta buscar o registro do cliente na tabela 'customers'
  const { data: customerData, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (customerError && customerError.code !== 'PGRST116') { // PGRST116 = No rows found
    console.warn("Erro ao buscar dados do cliente (pode ser normal se o cliente for novo):", customerError.message);
    return null;
  }
  
  // 2. Se o registro 'customers' existir, retorna ele
  if (customerData) {
    return customerData;
  }
  
  // 3. Se o registro 'customers' não existir (primeiro acesso após signup), 
  // cria um objeto Customer temporário usando os dados do user metadata.
  const userMetadata = user.user_metadata;
  
  const fallbackCustomer: Customer = {
    id: user.id, // Usamos o user.id como ID temporário
    user_id: user.id,
    name: userMetadata.full_name || '',
    phone: userMetadata.phone || '',
    email: user.email || '',
    address: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    latitude: null,
    longitude: null,
    cpf_cnpj: null,
  };
  
  return fallbackCustomer;
};

const Menu = () => {
  const queryClient = useQueryClient(); // Inicializando queryClient
  const { data, isLoading, isError, error } = useQuery<MenuData>({
    queryKey: ['menuData'],
    queryFn: fetchMenuData,
    staleTime: 1000 * 60 * 5, // 5 minutos
    gcTime: 1000 * 60 * 10, // 10 minutos
  });
  
  // Query para buscar o cliente logado
  const { data: customer, isLoading: isLoadingCustomer } = useQuery<Customer | null>({
    queryKey: ['menuCustomerData'],
    queryFn: fetchCustomerData,
    staleTime: 0, // Sempre verifica se o usuário está logado
  });
  
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isCartSidebarOpen, setIsCartSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false); // Estado do modal de perfil

  const { isOpen } = useMemo(() => {
    if (!data?.hours) return { isOpen: false, todayHours: 'Carregando...' };
    return getBusinessStatus(data.hours);
  }, [data?.hours]);

  const filteredMenu = useMemo(() => {
    if (!data?.menu) return [];
    
    if (!debouncedSearchTerm) return data.menu;
    
    return data.menu.map(category => ({
      ...category,
      products: category.products.filter(product => 
        product.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        (product.description && product.description.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
      )
    })).filter(category => category.products.length > 0);
  }, [data?.menu, debouncedSearchTerm]);

  const handleProductClick = useCallback((product: Product) => {
    if (!isOpen) {
      toast.error("A loja está fechada.", {
        description: "Não é possível adicionar itens ao carrinho no momento.",
      });
      return;
    }
    if (!product.is_available) {
      toast.info("Produto indisponível", {
        description: "Este item não está disponível no momento.",
      });
      return;
    }
    setSelectedProduct(product);
    if (product.is_price_by_weight) {
      setIsWeightModalOpen(true);
    } else {
      setIsDetailsModalOpen(true);
    }
  }, [isOpen]);
  
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair.", { description: error.message });
    } else {
      toast.success("Você saiu da sua conta.");
      // Invalida a query do cliente para forçar a atualização da UI (remoção dos botões)
      queryClient.invalidateQueries({ queryKey: ['menuCustomerData'] });
      
      // Redireciona para a página de autenticação do cliente
      const authUrl = `${window.location.origin}${window.location.pathname}#/auth`;
      window.location.href = authUrl;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="text-center mb-12">
          <Skeleton className="h-24 w-24 rounded-full mx-auto mb-4" />
          <Skeleton className="h-10 w-1/2 mx-auto mb-2" />
          <Skeleton className="h-6 w-3/4 mx-auto" />
        </div>
        <div className="space-y-10">
          {[...Array(3)].map((_, i) => (
            <div key={i}>
              <Skeleton className="h-9 w-1/3 mb-6" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(3)].map((_, j) => (
                  <Card key={j} className="p-4"><Skeleton className="h-48 w-full" /></Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Erro ao carregar o cardápio</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Ocorreu um erro desconhecido."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { restaurant, hours } = data;

  return (
    <>
      <ProductDetailsModal 
        product={selectedProduct} 
        isOpen={isDetailsModalOpen} 
        onClose={() => setIsDetailsModalOpen(false)} 
      />
      <WeightProductModal
        product={selectedProduct}
        isOpen={isWeightModalOpen}
        onClose={() => setIsWeightModalOpen(false)}
      />
      <CartSidebar isOpen={isCartSidebarOpen} onOpenChange={setIsCartSidebarOpen} />
      
      {/* Modal de Perfil do Cliente */}
      <CustomerProfileModal 
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        customer={customer}
      />

      <div 
        className={cn(
          "container mx-auto px-4 py-8 max-w-5xl"
          // Classes de zoom removidas
        )}
      >
        <header className="text-center mb-8 relative">
          {restaurant.logo_url && (
            <div className="w-20 h-20 mx-auto rounded-full mb-4 overflow-hidden border-4 border-card shadow-lg">
              <LazyImage 
                src={restaurant.logo_url} 
                alt={restaurant.name} 
                className="w-full h-full object-cover" 
              />
            </div>
          )}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">{restaurant.name}</h1>
          <p className="text-sm text-muted-foreground mb-4">{restaurant.description}</p>
          
          <BusinessStatus restaurant={restaurant} hours={hours} />
        </header>

        {!isOpen && <StoreClosedWarning />}

        <div className="mb-8 sticky top-0 z-30 bg-background pt-4 -mt-4">
          <Input
            type="text"
            placeholder="Buscar produtos..."
            className="w-full p-3 h-10 text-base"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <main className={cn(!isOpen && "opacity-50 pointer-events-none")}>
          {filteredMenu.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-lg">
                {debouncedSearchTerm ? 'Nenhum produto encontrado.' : 'Nenhum item no cardápio no momento.'}
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {filteredMenu.map(category => (
                <section key={category.id}>
                  <h2 className="text-xl sm:text-2xl font-bold border-b-2 border-primary pb-2 mb-6">
                    {category.name}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {category.products.map(product => (
                      <ProductCard
                        key={product.id}
                        id={product.id}
                        name={product.name}
                        description={product.description}
                        price={product.price}
                        image_url={product.image_url}
                        is_price_by_weight={product.is_price_by_weight}
                        is_available={product.is_available}
                        onClick={() => handleProductClick(product)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>
      </div>
      
      {/* Botões Flutuantes (Perfil e Logout) */}
      {customer && (
        <div className="fixed top-4 left-4 z-50 flex gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => setIsProfileModalOpen(true)}
            aria-label="Editar Perfil"
            className="h-14 w-14 rounded-full shadow-lg bg-card"
          >
            <User className="h-6 w-6" />
          </Button>
          
          {/* Botão de Logout */}
          <Button 
            variant="destructive" 
            size="icon" 
            onClick={handleLogout}
            aria-label="Sair da Conta"
            className="h-14 w-14 rounded-full shadow-lg bg-destructive hover:bg-destructive/90 text-white"
          >
            <LogOut className="h-6 w-6" />
          </Button>
        </div>
      )}
      
      {/* Botão Flutuante de Carrinho (Fixo no canto superior direito) */}
      {isOpen && (
        <div className="fixed top-4 right-4 z-50">
          <FloatingCartButton onClick={() => setIsCartSidebarOpen(true)} />
        </div>
      )}
    </>
  );
};

export default Menu;