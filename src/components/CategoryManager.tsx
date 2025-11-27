import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, Edit, Trash2, Terminal, Loader2 } from 'lucide-react';
import { AddCategoryModal } from './AddCategoryModal';
import { EditCategoryModal } from './EditCategoryModal'; // Importando o novo modal
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Category = Tables<'categories'>; // Definindo o tipo Category
type Product = {
  id: string;
  name: string;
  is_available: boolean | null;
};

type CategoryWithProducts = Category & {
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

  return categoriesWithProducts as CategoryWithProducts[];
};

// Atualizar a assinatura do componente
export const CategoryManager = ({ restaurantId }: CategoryManagerProps) => {
  const queryClient = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);

  // Usar restaurantId no queryKey e na função fetch
  const { data: categories, isLoading, isError, error } = useQuery<CategoryWithProducts[]>({
    queryKey: ['categoriesWithProducts', restaurantId],
    queryFn: () => fetchCategoriesWithProducts(restaurantId!),
    enabled: !!restaurantId, // Só busca se restaurantId estiver disponível
  });
  
  const handleDeleteCategory = (categoryId: string) => {
    setDeletingCategoryId(categoryId);
  };

  const deleteMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId);
      
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Categoria excluída com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['categoriesWithProducts', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['categories', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['menuData'] });
      setDeletingCategoryId(null);
    },
    onError: (err) => {
      toast.error(`Erro ao excluir categoria: ${err.message}`);
      setDeletingCategoryId(null);
    },
  });

  const categoryToDelete = categories?.find(c => c.id === deletingCategoryId);

  return (
    <>
      {/* Modal de Adição */}
      <AddCategoryModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        restaurantId={restaurantId} 
      />
      
      {/* Modal de Edição */}
      <EditCategoryModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingCategory(null);
        }}
        category={editingCategory}
        restaurantId={restaurantId}
      />
      
      {/* Diálogo de Confirmação de Exclusão */}
      <AlertDialog open={!!deletingCategoryId} onOpenChange={(open) => !open && setDeletingCategoryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja excluir esta categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. A categoria "{categoryToDelete?.name || 'selecionada'}" será removida.
              <br />
              **Atenção:** Os produtos associados a esta categoria não serão excluídos, mas ficarão sem categoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteMutation.mutate(deletingCategoryId!)}
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => {
                        setEditingCategory(category);
                        setIsEditModalOpen(true);
                      }}
                    >
                      <Edit className="mr-2 h-4 w-4" /> Editar
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="icon"
                      onClick={() => handleDeleteCategory(category.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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