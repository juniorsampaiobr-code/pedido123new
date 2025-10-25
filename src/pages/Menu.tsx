import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, ShoppingCart, ArrowRight } from "lucide-react";
import { Tables } from '@/integrations/supabase/types';
import { useState } from 'react';
import { ProductDetailsModal } from '@/components/ProductDetailsModal';
import { WeightProductModal } from '@/components/WeightProductModal';
import { useCart } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

type Product = Tables<'products'>;
type Restaurant = Tables<'restaurants'>;

type CategoryWithProducts = Tables<'categories'> & {
  products: Product[];
};

const fetchMenuData = async (): Promise<{ restaurant: Restaurant, menu: CategoryWithProducts[] }> => {
  const { data: restaurantData, error: restaurantError } = await supabase
    .from('restaurants')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (restaurantError) throw new Error(`Erro ao buscar restaurante: ${restaurantError.message}`);
  if (!restaurantData) throw new Error('Nenhum restaurante ativo encontrado.');

  const restaurantId = restaurantData.id;

  const [categoriesResult, productsResult] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_available', true)
  ]);

  if (categoriesResult.error) throw new Error(`Erro ao buscar categorias: ${categoriesResult.error.message}`);
  if (productsResult.error) throw new Error(`Erro ao buscar produtos: ${productsResult.error.message}`);

  const productsByCategory = (categoriesResult.data || []).map(category => ({
    ...category,
    products: (productsResult.data || []).filter(product => product.category_id === category.id)
  })).filter(category => category.products.length > 0);

  return { restaurant: restaurantData, menu: productsByCategory as CategoryWithProducts[] };
};

const Menu = () => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['menuData'],
    queryFn: fetchMenuData,
  });
  
  const { totalItems, subtotal } = useCart();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    if (product.is_price_by_weight) {
      setIsWeightModalOpen(true);
    } else {
      setIsDetailsModalOpen(true);
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
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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

  const { restaurant, menu } = data;

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

      <div className="container mx-auto px-4 py-8 max-w-5xl mb-20">
        <header className="text-center mb-12">
          {restaurant.logo_url && <img src={restaurant.logo_url} alt={restaurant.name} className="w-24 h-24 mx-auto rounded-full mb-4 object-cover border-4 border-card shadow-lg" />}
          <h1 className="text-4xl font-bold tracking-tight">{restaurant.name}</h1>
          <p className="text-muted-foreground mt-2">{restaurant.description}</p>
        </header>

        <main>
          {menu.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-lg">Nenhum item no cardápio no momento.</p>
            </div>
          ) : (
            <div className="space-y-10">
              {menu.map(category => (
                <section key={category.id}>
                  <h2 className="text-3xl font-bold border-b-2 border-primary pb-2 mb-6">{category.name}</h2>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {category.products.map(product => (
                      <Card 
                        key={product.id} 
                        className="overflow-hidden group hover:shadow-xl transition-shadow duration-300 flex flex-col cursor-pointer"
                        onClick={() => handleProductClick(product)}
                      >
                        <img 
                          src={product.image_url || '/placeholder.svg'} 
                          alt={product.name} 
                          className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300" 
                        />
                        <div className="p-4 flex flex-col flex-grow">
                          <CardTitle className="text-xl mb-1">{product.name}</CardTitle>
                          <CardDescription className="text-sm mb-3 flex-grow">{product.description}</CardDescription>
                          <p className="text-lg font-bold text-primary text-right mt-2">
                            {product.is_price_by_weight 
                              ? `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price)} / kg`
                              : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price)
                            }
                          </p>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>
      </div>
      
      {/* Floating Cart Button */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-card shadow-2xl border-t">
          <Link to="/checkout">
            <Button className="w-full h-14 text-lg font-bold flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                {totalItems} {totalItems === 1 ? 'Item' : 'Itens'}
              </div>
              <div className="flex items-center gap-2">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}
                <ArrowRight className="h-5 w-5 ml-2" />
              </div>
            </Button>
          </Link>
        </div>
      )}
    </>
  );
};

export default Menu;