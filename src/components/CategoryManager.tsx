import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, Edit, Trash2, Terminal } from 'lucide-react';
import { AddCategoryModal } from './AddCategoryModal';

type Product = {
  id: string;
  name: string;
  is_available: boolean | null;
};

type CategoryWithProducts = {
  id: string;
  name: string;
  display_order: number | null;
  is_active: boolean | null;
  products: Product[];
};

// Receber restaurantId como prop
interface CategoryManagerProps {
  restaurantId: string | null;
}

const fetchCategoriesWithProducts = async (restaurantId: string): Promise<CategoryWithProducts[]> => {
  // Usar restaurantId nas queries
  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('display_order', { ascending: true });

  if (categoriesError) throw new Error(`Erro ao buscar categorias: ${categoriesError.message}`);

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, category_id, is_available')
    .eq('restaurant_id', restaurantId); // Usar restaurantId

  if (productsError) throw new Error(`Erro ao buscar produtos: ${productsError.message}`);

  const categoriesWithProducts = categories.map(category => ({
    ...category,
    products: products.filter(product => product.category_id === category.id),
  }));

  return categoriesWithProducts;
};

// Atualizar a assinatura do componente
export const CategoryManager = ({ restaurantId }: CategoryManagerProps) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Usar restaurantId no queryKey e na função fetch
  const { data: categories, isLoading, isError, error } = useQuery<CategoryWithProducts[]>({
    queryKey: ['categoriesWithProducts', restaurantId],
    queryFn: () => fetchCategoriesWithProducts(restaurantId!),
    enabled: !!restaurantId, // Só busca se restaurantId estiver disponível
  });

  return (
    <>
      {/* Passar restaurantId para o modal */}
      <AddCategoryModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} restaurantId={restaurantId} />
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Categorias</h2>
          <Button onClick={() => setIsAddModalOpen(true)} disabled={!restaurantId}>
            <Plus className="mr-2 h-4 w-4" /> Nova Categoria
          </Button>
        </div>

        {isLoading && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <div className="space-y-2 pt-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-10" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {isError && (
          <Alert variant="destructive">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Erro ao carregar categorias</AlertTitle>
            <AlertDescription>{error instanceof Error ? error.message : "Ocorreu um erro desconhecido."}</AlertDescription>
          </Alert>
        )}

        {categories && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <Card key={category.id}>
                <CardHeader className="flex flex-row items-start justify-between">
                  <CardTitle>{category.name}</CardTitle>
                  {category.is_active && <Badge>Ativa</Badge>}
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">Ordem: {category.display_order ?? 0}</p>
                  <div>
                    <h4 className="text-sm font-medium mb-2">Produtos ({category.products.length}):</h4>
                    <div className="space-y-2">
                      {category.products.length > 0 ? (
                        category.products.map((product) => (
                          <div key={product.id} className="flex items-center justify-between bg-muted/50 p-2 rounded-md">
                            <span className="text-sm">{product.name}</span>
                            {product.is_available && <Badge variant="secondary">Disponível</Badge>}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">Nenhum produto nesta categoria.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t">
                    <Button variant="outline" className="w-full"><Edit className="mr-2 h-4 w-4" /> Editar</Button>
                    <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
};