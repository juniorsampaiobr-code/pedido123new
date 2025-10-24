import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Plus, Edit, Trash2, List, Terminal, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { AddProductModal } from '@/components/AddProductModal';
import { CategoryManager } from '@/components/CategoryManager';

type Product = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  is_available: boolean | null;
  restaurant_id: string;
};

const fetchProducts = async () => {
  const { data: restaurantData, error: restaurantError } = await supabase
    .from('restaurants')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (restaurantError) throw new Error(`Erro ao buscar restaurante: ${restaurantError.message}`);
  if (!restaurantData) throw new Error('Nenhum restaurante ativo encontrado.');

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('restaurant_id', restaurantData.id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Erro ao buscar produtos: ${error.message}`);
  return data as Product[];
};

const Products = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    };
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') navigate("/");
      else if (!session?.user) navigate("/auth");
      else setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const { data: products, isLoading, isError, error } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: fetchProducts,
    enabled: !!user,
  });

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (!user) {
    return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }

  return (
    <>
      <AddProductModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
      <div className="flex min-h-screen bg-muted/40">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <header className="border-b bg-background sticky top-0 z-40">
            <div className="container max-w-none mx-auto px-8 h-16 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <Package className="h-6 w-6" />
                <h1 className="text-xl font-semibold">Produtos</h1>
              </div>
              <Button variant="outline" onClick={handleSignOut}>
                Sair
              </Button>
            </div>
          </header>

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
                    <Button variant="outline" size="icon"><List className="h-4 w-4" /></Button>
                    <Button variant="outline">Ativar Todos</Button>
                    <Button variant="outline">Desativar Todos</Button>
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
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {products.map((product) => (
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
                              <Button variant="outline" className="w-full"><Edit className="mr-2 h-4 w-4" /> Editar</Button>
                              <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="categories">
                <CategoryManager />
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </>
  );
};

export default Products;