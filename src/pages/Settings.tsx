import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from "sonner";
import { Upload, Music, Search, Loader2 } from 'lucide-react';
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
import { useState, useMemo, useCallback } from 'react';
import { LocationPickerMap } from '@/components/LocationPickerMap';

type Restaurant = Tables<'restaurants'>;

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
  latitude: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Latitude deve ser um número.' }).optional().nullable(),
  ),
  longitude: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Longitude deve ser um número.' }).optional().nullable(),
  ),
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
  const queryClient = useQueryClient();
  const [soundFile, setSoundFile] = useState<File | null>(null);
  const [searchAddress, setSearchAddress] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const { data: restaurant, isLoading, isError, error } = useQuery<Restaurant>({
    queryKey: ['restaurantSettings'],
    queryFn: fetchRestaurantData,
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
      latitude: restaurant?.latitude ?? null,
      longitude: restaurant?.longitude ?? null,
    },
    mode: 'onBlur',
  });

  const lat = form.watch('latitude');
  const lng = form.watch('longitude');

  const DEFAULT_CENTER: [number, number] = [-23.55052, -46.633308]; // São Paulo

  const markerPosition = useMemo((): [number, number] => {
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      return [lat, lng];
    }
    return DEFAULT_CENTER;
  }, [lat, lng]);

  const updateAddressFields = useCallback((address: any) => {
    form.setValue('street', address.road || '', { shouldValidate: true });
    form.setValue('number', address.house_number || '', { shouldValidate: true });
    form.setValue('neighborhood', address.suburb || address.city_district || '', { shouldValidate: true });
    form.setValue('city', address.city || address.town || '', { shouldValidate: true });
    form.setValue('zip_code', address.postcode || '', { shouldValidate: true });
  }, [form]);

  const handleAddressSearch = async () => {
    if (!searchAddress) {
      toast.warning("Por favor, digite um endereço para buscar.");
      return;
    }
    setIsSearching(true);
    const loadingToast = toast.loading("Buscando endereço...");

    try {
      const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}`;
      const response = await fetch(searchUrl);
      if (!response.ok) throw new Error("Falha na busca do endereço.");
      
      const data = await response.json();
      if (data.length === 0) {
        toast.error("Endereço não encontrado.");
        return;
      }

      const { lat, lon, address } = data[0];
      
      form.setValue('latitude', parseFloat(lat), { shouldValidate: true });
      form.setValue('longitude', parseFloat(lon), { shouldValidate: true });
      updateAddressFields(address);

      toast.success("Endereço encontrado e campos atualizados!");

    } catch (err: any) {
      toast.error(`Erro na busca: ${err.message}`);
    } finally {
      setIsSearching(false);
      toast.dismiss(loadingToast);
    }
  };

  const handleMapLocationChange = useCallback(async (newLat: number, newLng: number) => {
    form.setValue('latitude', newLat, { shouldValidate: true });
    form.setValue('longitude', newLng, { shouldValidate: true });

    const loadingToast = toast.loading("Buscando endereço para a nova localização...");
    try {
      const reverseUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}`;
      const response = await fetch(reverseUrl);
      if (!response.ok) throw new Error("Falha ao obter detalhes do endereço.");

      const data = await response.json();
      if (data.address) {
        updateAddressFields(data.address);
        toast.success("Endereço atualizado a partir do mapa.");
      } else {
        toast.warning("Não foi possível encontrar um endereço para esta localização.");
      }
    } catch (err: any) {
      toast.error(`Erro ao buscar endereço: ${err.message}`);
    } finally {
      toast.dismiss(loadingToast);
    }
  }, [form, updateAddressFields]);

  const restaurantMutation = useMutation({
    mutationFn: async (data: RestaurantFormValues) => {
      if (!restaurant?.id) throw new Error('ID do restaurante não disponível.');
      const { id, ...updateData } = { ...data, id: restaurant.id };
      const { error } = await supabase.from('restaurants').update(updateData).eq('id', id);
      if (error) throw error;
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

  return (
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
                  
                  <h3 className="text-lg font-semibold pt-4 border-t mt-6">Endereço e Localização</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="address-search">Buscar Endereço</Label>
                    <div className="flex gap-2">
                      <Input 
                        id="address-search"
                        placeholder="Digite o endereço, ex: Av. Paulista, 1578, São Paulo"
                        value={searchAddress}
                        onChange={(e) => setSearchAddress(e.target.value)}
                      />
                      <Button type="button" onClick={handleAddressSearch} disabled={isSearching}>
                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={form.control} name="street" render={({ field }) => (<FormItem className="md:col-span-2"><FormLabel>Rua</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="number" render={({ field }) => (<FormItem className="md:col-span-1"><FormLabel>Número</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="neighborhood" render={({ field }) => (<FormItem><FormLabel>Bairro</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="city" render={({ field }) => (<FormItem><FormLabel>Cidade</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                  </div>
                  <FormField control={form.control} name="zip_code" render={({ field }) => (<FormItem><FormLabel>CEP</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />

                  <p className="text-sm text-muted-foreground pt-4 border-t">
                    Clique no mapa ou arraste o marcador para ajustar a localização exata.
                  </p>
                  
                  <LocationPickerMap 
                    center={markerPosition}
                    markerPosition={markerPosition}
                    onLocationChange={handleMapLocationChange}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="latitude" render={({ field }) => (<FormItem><FormLabel>Latitude</FormLabel><FormControl><Input {...field} placeholder="-22.7627908" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="longitude" render={({ field }) => (<FormItem><FormLabel>Longitude</FormLabel><FormControl><Input {...field} placeholder="-47.408315" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                  </div>

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
            <div className="space-y-2">
              <Label htmlFor="sound-upload">Arquivo de Som (MP3)</Label>
              <label className="flex items-center justify-center w-full h-12 px-4 border-2 border-dashed rounded-md cursor-pointer hover:bg-muted">
                <Upload className="w-4 h-4 mr-2" />
                <span>{soundFile?.name || 'Escolher Arquivo MP3'}</span>
                <input
                  id="sound-upload"
                  type="file"
                  className="hidden"
                  accept=".mp3"
                  onChange={(e) => setSoundFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
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
  );
};

export default Settings;