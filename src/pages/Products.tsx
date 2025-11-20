import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Plus, Edit, Trash2, List, Grid, Terminal, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { AddProductModal } from '@/components/AddProductModal';
import { EditProductModal } from '@/components/EditProductModal';
import { CategoryManager } from '@/components/CategoryManager';
import { Tables } from '@/integrations/supabase/types';
import { ProductListItem } from '@/components/ProductListItem';
import { cn } from '@/lib/utils';
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
import { useOutletContext } from 'react-router-dom';
import { DashboardContextType } from '@/layouts/DashboardLayout'; // Importar o tipo do contexto

type Product = Tables<'products'>;
type LayoutType = 'grid' | 'list';

const fetchProducts = async (restaurantId: string) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Erro ao buscar produtos: ${error.message}`);
  return data as Product[];
};

const Products = () => {
  const queryClient = useQueryClient();
  // Usar o contexto para obter o restaurantId do usuário logado
  const { userRestaurantId } = useOutletContext<DashboardContextType>();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  
  // Inicializa o estado lendo do localStorage, com fallback para 'grid'
  const [layout, setLayoutState] = useState<LayoutType>(() => {
    if (typeof window !== 'undefined') {
      const savedLayout = localStorage.getItem('productsLayout');
      return (savedLayout === 'grid' || savedLayout === 'list') ? savedLayout : 'grid';
    }
    return 'grid';
  });

  const setLayout = useCallback((newLayout: LayoutType) => {
    setLayoutState(newLayout);
    localStorage.setItem('productsLayout', newLayout);
  }, []);

  // Usar userRestaurantId no queryKey e na função fetch
  const { data: products, isLoading, isError, error } = useQuery<Product[]>({
    queryKey: ['products', userRestaurantId],
    queryFn: () => fetchProducts(userRestaurantId!),
    enabled: !!userRestaurantId, // Só busca se o userRestaurantId estiver disponível
  });

  const handleEditClick = (product: Product) => {
    setEditingProduct(product);
    setIsEditModalOpen(true);
  };

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, is_available }: { id: string, is_available: boolean }) => {
      const { error } = await supabase
        .from('products')
        .update({ is_available })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success("Status do produto atualizado!");
    },
    onError: (err) => {
      toast.error(`Erro ao atualizar produto: ${err.message}`);
    },
  });
  
  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['menuData'] });
      toast.success("Produto excluído com sucesso!");
      setDeletingProductId(null);
    },
    onError: (err) => {
      toast.error(`Erro ao excluir produto: ${err.message}`);
      setDeletingProductId(null);
    },
  });
  
  const massUpdateStatusMutation = useMutation({
    mutationFn: async (is_available: boolean) => {
      if (!products || products.length === 0 || !userRestaurantId) return;
      
      const productIds = products.map(p => p.id);
      
      const { error } = await supabase
        .from('products')
        .update({ is_available })
        .in('id', productIds);
        
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, is_available) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['menuData'] });
      toast.success(`Todos os produtos foram ${is_available ? 'ativados' : 'desativados'} com sucesso!`);
    },
    onError: (err) => {
      toast.error(`Erro ao atualizar status em massa: ${err.message}`);
    },
  });

  const handleMassUpdate = (is_available: boolean) => {
    if (!products || products.length === 0) {
      toast.info("Nenhum produto para atualizar.");
      return;
    }
    massUpdateStatusMutation.mutate(is_available);
  };

  const handleDeleteClick = (productId: string) => {
    deleteProductMutation.mutate(productId);
  };

  const productToDelete = products?.find(p => p.id === deletingProductId);
  const isMassUpdating = massUpdateStatusMutation.isPending;

  return (
    <>
      <AddProductModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} restaurantId={userRestaurantId} />
      <EditProductModal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        product={editingProduct} 
      />
      
      {/* Diálogo de Confirmação de Exclusão */}
      <AlertDialog open={!!deletingProductId} onOpenChange={(open) => !open && setDeletingProductId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja excluir este produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. O produto "{productToDelete?.name || 'selecionado'}" será removido do cardápio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProductMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => handleDeleteClick(deletingProductId!)}
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteProductMutation.isPending}
            >
              {deleteProductMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-6">
        <Tabs defaultValue="products">
          <TabsList>
            <TabsTrigger value="products">Produtos</TabsTrigger>
            <TabsTrigger value="categories">Categorias</TabsTrigger>
          </TabsList>
          <TabsContent value="products" className="space-y-6">
            <div className="flex flex-wrap gap-4 justify-between items-center">
              <h2 className="text-2xl font-bold">Produtos</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="icon" onClick={() => setLayout(layout === 'grid' ? 'list' : 'grid')}>
                  {layout === 'grid' ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleMassUpdate(true)}
                  disabled={isMassUpdating || isLoading || !products || products.length === 0}
                >
                  {isMassUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Ativar Todos'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleMassUpdate(false)}
                  disabled={isMassUpdating || isLoading || !products || products.length === 0}
                >
                  {isMassUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Desativar Todos'}
                </Button>
                <Button onClick={() => setIsAddModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Novo Produto
                </Button>
              </div>
            </div>

            {isLoading && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                  <Card key={i} className="overflow-hidden">
                    <Skeleton className="h-48 w-full" />
                    <CardContent className="p-4 space-y-3">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-6 w-1/3" />
                      <div className="flex justify-between items-center border-t pt-3 mt-3">
                        <Skeleton className="h-5 w-1/2" />
                        <Skeleton className="h-6 w-12" />
                      </div>
                      <div className="flex gap-2 pt-2">
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
                <AlertTitle>Erro ao carregar produtos</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            )}

            {products && (
              <div className={cn(layout === 'grid' ? 'grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'space-y-4')}>
                {products.map((product) => (
                  layout === 'grid' ? (
                    <Card key={product.id} className="overflow-hidden flex flex-col">
                      <div className="relative">
                        <img
                          src={product.image_url || '/placeholder.svg'}
                          alt={product.name}
                          className="w-full h-48 object-cover"
                        />
                        {product.is_available && (
                          <Badge className="absolute top-2 right-2">Disponível</Badge>
                        )}
                      </div>
                      <CardContent className="p-4 flex-grow flex flex-col justify-between">
                        <div className="flex-grow">
                          <h3 className="text-lg font-semibold truncate">{product.name}</h3>
                          <p className="text-xl font-bold text-primary mt-1 mb-3">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price)}
                          </p>
                        </div>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between border-t pt-3">
                            <label htmlFor={`active-${product.id}`} className="text-sm font-medium">Produto Ativo</label>
                            <Switch
                              id={`active-${product.id}`}
                              checked={product.is_available ?? false}
                              onCheckedChange={(checked) => {
                                updateProductMutation.mutate({ id: product.id, is_available: checked });
                              }}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" className="w-full" onClick={() => handleEditClick(product)}>
                              <Edit className="mr-2 h-4 w-4" /> Editar
                            </Button>
                            <Button variant="destructive" size="icon" onClick={() => setDeletingProductId(product.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <ProductListItem 
                      key={product.id}
                      product={product}
                      onEditClick={handleEditClick}
                      onUpdateStatus={(checked) => updateProductMutation.mutate({ id: product.id, is_available: checked })}
                      onDeleteClick={handleDeleteClick}
                    />
                  )
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="categories">
            {/* Passar o userRestaurantId para o CategoryManager também */}
            <CategoryManager restaurantId={userRestaurantId} />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
};

export default Products;