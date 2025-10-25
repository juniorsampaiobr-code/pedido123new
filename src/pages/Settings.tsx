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
import { Settings as SettingsIcon, Upload, Music } from 'lucide-react';
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
  street: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  zip_code: z.string().optional(),
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

const Settings = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [soundFile, setSoundFile] = useState<File | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) navigate("/auth");
      else setUser(session.user);
    };
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') navigate("/");
      else if (!session?.user) navigate("/auth");
      else setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const { data: restaurant, isLoading, isError, error } = useQuery<Restaurant>({
    queryKey: ['restaurantSettings'],
    queryFn: fetchRestaurantData,
    enabled: !!user,
  });

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

  const restaurantMutation = useMutation({
    mutationFn: (data: RestaurantFormValues) => {
      if (!restaurant?.id) throw new Error('ID do restaurante não disponível.');
      const { id, ...updateData } = { ...data, id: restaurant.id };
      return supabase.from('restaurants').update(updateData).eq('id', id).throwOnError();
    },
    onSuccess: () => {
      toast.success('Configurações salvas com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['restaurantSettings'] });
    },
    onError: (err) => toast.error(`Erro ao salvar configurações: ${err.message}`),
  });

  const soundMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!restaurant?.id) throw new Error('ID do restaurante não disponível.');
      const filePath = `${restaurant.id}/notification.mp3`;

      const { error: uploadError } = await supabase.storage
        .from('settings')
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('settings')
        .getPublicUrl(filePath);
      
      const { error: dbError } = await supabase
        .from('restaurants')
        .update({ notification_sound_url: `${publicUrlData.publicUrl}?t=${new Date().getTime()}` }) // Add timestamp to bust cache
        .eq('id', restaurant.id);
      if (dbError) throw dbError;
    },
    onSuccess: () => {
      toast.success('Som de notificação atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['restaurantSettings'] });
      setSoundFile(null);
    },
    onError: (err: any) => toast.error(`Erro ao salvar som: ${err.message}`),
  });

  const handleSoundSave = () => {
    if (soundFile) {
      soundMutation.mutate(soundFile);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (!user) return <div className="flex h-screen items-center justify-center">Carregando...</div>;

  return (
    <div className="flex min-h-screen bg-muted/40">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="border-b bg-background sticky top-0 z-40">
          <div className="container max-w-none mx-auto px-8 h-16 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <SettingsIcon className="h-6 w-6" />
              <h1 className="text-xl font-semibold">Configurações</h1>
            </div>
            <Button variant="outline" onClick={handleSignOut}>Sair</Button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold">Configurações do Restaurante</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-96 w-full" />
                ) : isError ? (
                  <p className="text-destructive">Erro ao carregar dados: {error.message}</p>
                ) : (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit((data) => restaurantMutation.mutate(data))} className="space-y-6">
                      <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nome do Restaurante *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Descrição</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="logo_url" render={({ field }) => (<FormItem><FormLabel>URL do Logo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <h3 className="text-lg font-semibold pt-4 border-t mt-6">Endereço</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField control={form.control} name="street" render={({ field }) => (<FormItem className="md:col-span-2"><FormLabel>Rua</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="number" render={({ field }) => (<FormItem className="md:col-span-1"><FormLabel>Número</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="neighborhood" render={({ field }) => (<FormItem><FormLabel>Bairro</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="city" render={({ field }) => (<FormItem><FormLabel>Cidade</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                      <FormField control={form.control} name="zip_code" render={({ field }) => (<FormItem><FormLabel>CEP</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <h3 className="text-lg font-semibold pt-4 border-t mt-6">Contato</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>Telefone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                      <FormField control={form.control} name="is_active" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><FormLabel className="font-normal">Restaurante Ativo</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                      <Button type="submit" className="w-full h-12 text-lg" disabled={restaurantMutation.isPending}>{restaurantMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}</Button>
                    </form>
                  </Form>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <Music className="h-6 w-6 text-primary" />
                  Notificação Sonora
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Envie um arquivo MP3 para ser usado como som de notificação para novos pedidos.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormItem>
                  <FormLabel>Arquivo de Som (MP3)</FormLabel>
                  <FormControl>
                    <label className="flex items-center justify-center w-full h-12 px-4 border-2 border-dashed rounded-md cursor-pointer hover:bg-muted">
                      <Upload className="w-4 h-4 mr-2" />
                      <span>{soundFile?.name || 'Escolher Arquivo MP3'}</span>
                      <input
                        type="file"
                        className="hidden"
                        accept=".mp3"
                        onChange={(e) => setSoundFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </FormControl>
                </FormItem>
                <Button 
                  onClick={handleSoundSave} 
                  className="w-full h-12 text-lg" 
                  disabled={!soundFile || soundMutation.isPending}
                >
                  {soundMutation.isPending ? 'Salvando Som...' : 'Salvar Som de Notificação'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Settings;