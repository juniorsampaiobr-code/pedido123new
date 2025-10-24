import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from "sonner";
import { Store } from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { TablesUpdate, Tables } from '@/integrations/supabase/types';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';

type Restaurant = Tables<'restaurants'>;
type RestaurantUpdate = TablesUpdate<'restaurants'>;

const restaurantSchema = z.object({
  name: z.string().min(1, 'O nome do restaurante é obrigatório.'),
  description: z.string().optional(),
  logo_url: z.string().url('URL do logo inválida.').optional().or(z.literal('')),
  
  // Endereço
  street: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  zip_code: z.string().optional(),
  
  // Contato
  phone: z.string().optional(),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  
  is_active: z.boolean().default(true),
});

type RestaurantFormValues = z.infer<typeof restaurantSchema>;

const fetchRestaurantData = async (): Promise<Restaurant> => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .limit(1)
    .single();

  if (error) throw new Error(`Erro ao buscar dados do restaurante: ${error.message}`);
  if (!data) throw new Error('Nenhum restaurante encontrado.');
  return data;
};

const updateRestaurantData = async (data: RestaurantUpdate & { id: string }) => {
  const { id, ...updateData } = data;
  const { error } = await supabase
    .from('restaurants')
    .update(updateData)
    .eq('id', id);

  if (error) throw new Error(error.message);
};

const MyStore = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);

  // 1. Autenticação e Redirecionamento
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

  // 2. Busca de Dados
  const { data: restaurant, isLoading, isError, error } = useQuery<Restaurant>({
    queryKey: ['restaurantSettings'],
    queryFn: fetchRestaurantData,
    enabled: !!user,
  });

  // 3. Configuração do Formulário
  const form = useForm<RestaurantFormValues>({
    resolver: zodResolver(restaurantSchema),
    values: {
      name: restaurant?.name || '',
      description: restaurant?.description || '',
      logo_url: restaurant?.logo_url || '',
      street: restaurant?.street || '',
      number: restaurant?.number || '',
      neighborhood: restaurant?.neighborhood || '',
      city: restaurant?.city || '',
      zip_code: restaurant?.zip_code || '',
      phone: restaurant?.phone || '',
      email: restaurant?.email || '',
      is_active: restaurant?.is_active ?? true,
    },
    mode: 'onBlur',
  });

  // 4. Mutação para Salvar
  const mutation = useMutation({
    mutationFn: (data: RestaurantFormValues) => {
      if (!restaurant?.id) throw new Error('ID do restaurante não disponível para atualização.');
      return updateRestaurantData({ ...data, id: restaurant.id });
    },
    onSuccess: () => {
      toast.success('Configurações salvas com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['restaurantSettings'] });
      queryClient.invalidateQueries({ queryKey: ['menuData'] }); // Invalida o menu para refletir mudanças
    },
    onError: (err) => {
      toast.error(`Erro ao salvar configurações: ${err.message}`);
    },
  });

  const onSubmit = (data: RestaurantFormValues) => {
    mutation.mutate(data);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (!user) {
    return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="flex min-h-screen bg-muted/40">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="border-b bg-background sticky top-0 z-40">
          <div className="container max-w-none mx-auto px-8 h-16 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Store className="h-6 w-6" />
              <h1 className="text-xl font-semibold">Minha Loja</h1>
            </div>
            <Button variant="outline" onClick={handleSignOut}>
              Sair
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-6">
          <Card className="max-w-3xl mx-auto">
            <CardHeader>
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                Configurações do Restaurante
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <div className="space-y-2"><Skeleton className="h-4 w-1/4" /><Skeleton className="h-10 w-full" /></div>
                  <div className="space-y-2"><Skeleton className="h-4 w-1/4" /><Skeleton className="h-20 w-full" /></div>
                  <div className="space-y-2"><Skeleton className="h-4 w-1/4" /><Skeleton className="h-10 w-full" /></div>
                  <Skeleton className="h-6 w-1/2 mt-6" />
                  <div className="grid grid-cols-2 gap-4">
                    <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
                  </div>
                  <Skeleton className="h-10 w-full" />
                  <div className="grid grid-cols-2 gap-4">
                    <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
                  </div>
                  <div className="flex justify-between items-center pt-4"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-8 w-12" /></div>
                  <Skeleton className="h-12 w-full mt-6" />
                </div>
              ) : isError ? (
                <p className="text-destructive">Erro ao carregar dados: {error.message}</p>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    
                    {/* Nome do Restaurante */}
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome do Restaurante *</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Descrição */}
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descrição</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={3} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* URL do Logo */}
                    <FormField
                      control={form.control}
                      name="logo_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>URL do Logo</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <h3 className="text-lg font-semibold pt-4 border-t mt-6">Endereço</h3>
                    
                    {/* Rua e Número */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="street"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>Rua</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="number"
                        render={({ field }) => (
                          <FormItem className="md:col-span-1">
                            <FormLabel>Número</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Bairro e Cidade */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="neighborhood"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bairro</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cidade</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* CEP */}
                    <FormField
                      control={form.control}
                      name="zip_code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CEP</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <h3 className="text-lg font-semibold pt-4 border-t mt-6">Contato</h3>

                    {/* Telefone e Email */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Telefone</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Restaurante Ativo Switch */}
                    <FormField
                      control={form.control}
                      name="is_active"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <FormLabel className="font-normal">Restaurante Ativo</FormLabel>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <Button 
                      type="submit" 
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-lg"
                      disabled={mutation.isPending}
                    >
                      {mutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
};

export default MyStore;