import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form'; // Importando Controller
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
import { Upload, Music, Search, Loader2, Volume2, CheckCircle, XCircle, MapPin } from 'lucide-react';
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
import { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { ZipCodeInput } from '@/components/ZipCodeInput';
import { PhoneInput } from '@/components/PhoneInput'; // Importando PhoneInput
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MapLocationSection } from '@/components/MapLocationSection';
import { useOutletContext } from 'react-router-dom';
import { DashboardContextType } from '@/layouts/DashboardLayout';
import { geocodeAddress } from '@/utils/location'; // Importando geocodeAddress

type Restaurant = Tables<'restaurants'>;

const cleanPhoneNumber = (phone: string) => phone.replace(/\D/g, '');

const restaurantSchema = z.object({
  name: z.string().min(1, 'O nome do restaurante é obrigatório.'),
  description: z.string().optional(),
  logo_url: z.string().url('URL do logo inválida.').optional().or(z.literal('')),
  street: z.string().optional(), // Mantendo opcional, pois é preenchido pela busca
  // OBRIGATÓRIO
  number: z.string().min(1, 'O número é obrigatório.'),
  neighborhood: z.string().optional(), // Mantendo opcional
  city: z.string().optional(), // Mantendo opcional
  // OBRIGATÓRIO
  zip_code: z.string().min(1, 'O CEP é obrigatório.').transform(val => val.replace(/\D/g, '')).refine(val => val.length === 8, {
    message: 'O CEP deve ter 8 dígitos.',
  }),
  // OBRIGATÓRIO E VALIDANDO
  phone: z.string().min(1, 'Telefone é obrigatório.').transform(cleanPhoneNumber).refine(val => val.length >= 10, {
    message: 'O telefone deve ter pelo menos 10 dígitos (incluindo DDD).',
  }),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  is_active: z.boolean().default(true),
  // OBRIGATÓRIO: Garante que as coordenadas foram definidas
  latitude: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Latitude deve ser um número.' }).refine(val => val !== null, {
      message: 'A localização no mapa é obrigatória. Use o botão "Buscar Endereço".',
    }),
  ),
  // OBRIGATÓRIO: Garante que as coordenadas foram definidas
  longitude: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Longitude deve ser um número.' }).refine(val => val !== null, {
      message: 'A localização no mapa é obrigatória. Use o botão "Buscar Endereço".',
    }),
  ),
});

type RestaurantFormValues = z.infer<typeof restaurantSchema>;

// Usar userRestaurantId na função fetch
const fetchRestaurantData = async (restaurantId: string): Promise<Restaurant> => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId) // Usar restaurantId
    .single();

  if (error) throw new Error(`Erro ao buscar dados do restaurante: ${error.message}`);
  if (!data) throw new Error('Nenhum restaurante encontrado.');
  return data;
};

const Settings = () => {
  const queryClient = useQueryClient();
  const { userRestaurantId } = useOutletContext<DashboardContextType>(); // Obter restaurantId do contexto
  // Removendo searchCep e searchNumber, usaremos os campos do formulário
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [showMap, setShowMap] = useState(false);

  // Usar userRestaurantId no queryKey e na função fetch
  const { data: restaurant, isLoading, isError, error } = useQuery<Restaurant>({
    queryKey: ['restaurantSettings', userRestaurantId],
    queryFn: () => fetchRestaurantData(userRestaurantId!), // Usar userRestaurantId
    enabled: !!userRestaurantId, // Só busca se userRestaurantId estiver disponível
    staleTime: 1000 * 60 * 5,
  });

  const form = useForm<RestaurantFormValues>({
    resolver: zodResolver(restaurantSchema),
    defaultValues: {
      name: '',
      description: '',
      logo_url: '',
      street: '',
      number: '', // Agora obrigatório
      neighborhood: '',
      city: '',
      zip_code: '', // Agora obrigatório
      phone: '', // Valor inicial vazio
      email: '',
      is_active: true,
      latitude: null,
      longitude: null,
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (restaurant) {
      form.reset({
        name: restaurant.name || '',
        description: restaurant.description || '',
        logo_url: restaurant.logo_url || '',
        street: restaurant.street || '',
        number: restaurant.number || '',
        neighborhood: restaurant.neighborhood || '',
        city: restaurant.city || '',
        zip_code: restaurant.zip_code || '',
        phone: restaurant.phone || '', // Preenche o telefone
        email: restaurant.email || '',
        is_active: restaurant.is_active ?? true,
        latitude: restaurant.latitude ?? null,
        longitude: restaurant.longitude ?? null,
      });
      
      // Mostra o mapa apenas após carregar os dados
      if (restaurant.latitude && restaurant.longitude) {
        setShowMap(true);
      }
    }
  }, [restaurant, form.reset]);

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
    form.setValue('street', address.road || address.logradouro || '', { shouldValidate: true });
    form.setValue('number', address.house_number || '', { shouldValidate: true });
    form.setValue('neighborhood', address.suburb || address.bairro || '', { shouldValidate: true });
    form.setValue('city', address.city || address.localidade || '', { shouldValidate: true });
    form.setValue('zip_code', address.postcode || address.cep || '', { shouldValidate: true });
    
    // Não precisamos mais atualizar searchCep/searchNumber
    
  }, [form]);

  const handleAddressSearch = async () => {
    // 1. Valida os campos de CEP e Número no formulário principal
    const isValid = await form.trigger(['zip_code', 'number']);
    if (!isValid) {
      toast.error("Por favor, preencha o CEP e o Número corretamente.");
      return;
    }
    
    const currentData = form.getValues();
    const cleanedCep = currentData.zip_code.replace(/\D/g, '');
    const number = currentData.number;

    setIsSearchingCep(true);
    const loadingToast = toast.loading("Buscando endereço e coordenadas...");

    try {
      // Step 1: Fetch address from CEP
      const response = await fetch(`https://viacep.com.br/ws/${cleanedCep}/json/`);
      if (!response.ok) throw new Error("Falha na busca do CEP.");
      
      const data = await response.json();
      if (data.erro) {
        toast.error("CEP não encontrado.");
        return;
      }

      // Update form fields with data from ViaCEP and the provided number
      form.setValue('street', data.logradouro, { shouldValidate: true });
      form.setValue('neighborhood', data.bairro, { shouldValidate: true });
      form.setValue('city', data.localidade, { shouldValidate: true });
      // zip_code e number já estão no formulário

      // Step 2: Fetch coordinates using the full address
      const fullAddress = `${data.logradouro}, ${number}, ${data.localidade}, ${data.uf}`;
      
      const coords = await geocodeAddress(fullAddress);
      
      if (coords) {
        form.setValue('latitude', coords.lat, { shouldValidate: true });
        form.setValue('longitude', coords.lng, { shouldValidate: true });
        setShowMap(true); // Mostra o mapa após obter coordenadas
        toast.success("Endereço e mapa atualizados com sucesso!");
      } else {
        // Se não encontrar coordenadas, define o mapa para o centro padrão e avisa o usuário
        form.setValue('latitude', DEFAULT_CENTER[0], { shouldValidate: true });
        form.setValue('longitude', DEFAULT_CENTER[1], { shouldValidate: true });
        setShowMap(true);
        toast.warning("Endereço encontrado, mas não foi possível obter as coordenadas exatas. Ajuste o pino no mapa manualmente.");
      }

    } catch (err: any) {
      toast.dismiss(loadingToast);
      toast.error(`Erro na busca: ${err.message}`);
    } finally {
      setIsSearchingCep(false);
      toast.dismiss(loadingToast);
    }
  };

  const handleMapLocationChange = useCallback((newLat: number, newLng: number) => {
    form.setValue('latitude', newLat, { shouldValidate: true });
    form.setValue('longitude', newLng, { shouldValidate: true });
    // Não faz geocodificação reversa aqui, o usuário deve clicar no botão se quiser atualizar o endereço.
  }, [form]);

  const restaurantMutation = useMutation({
    mutationFn: async (data: RestaurantFormValues) => {
      if (!userRestaurantId) throw new Error('ID do restaurante não disponível.'); // Usar userRestaurantId
      
      // Cria um payload que exclui notification_sound_url, garantindo que ele não seja alterado
      const updatePayload: TablesUpdate<'restaurants'> = {
        name: data.name,
        description: data.description,
        logo_url: data.logo_url,
        street: data.street,
        number: data.number,
        neighborhood: data.neighborhood,
        city: data.city,
        zip_code: data.zip_code.replace(/\D/g, ''), // Garante que o CEP seja salvo limpo
        phone: data.phone, // Incluindo o telefone
        email: data.email,
        is_active: data.is_active,
        latitude: data.latitude,
        longitude: data.longitude,
        // notification_sound_url é omitido
      };
      
      const { error } = await supabase.from('restaurants').update(updatePayload).eq('id', userRestaurantId); // Usar userRestaurantId
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Configurações salvas com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['restaurantSettings', userRestaurantId] }); // Usar userRestaurantId
    },
    onError: (err) => toast.error(`Erro ao salvar configurações: ${err.message}`),
  });

  // Chave para forçar a recriação do mapa quando as coordenadas mudam
  const mapKey = useMemo(() => {
    if (lat === null || lng === null) {
      return `map-settings-null`;
    }
    return `map-settings-${lat.toFixed(6)}-${lng.toFixed(6)}`;
  }, [lat, lng]);


  return (
    <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Configurações do Restaurante</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <Skeleton className="h-96 w-full" />
            )}
            {isError && (
              <p className="text-destructive">Erro ao carregar dados: {error.message}</p>
            )}
            {!userRestaurantId && !isLoading && (
                <p className="text-destructive">Erro: ID do restaurante não encontrado.</p>
            )}
            {restaurant && !isError && !isLoading && (
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => restaurantMutation.mutate(data))} className="space-y-6">
                  <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nome do Restaurante *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Descrição</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="logo_url" render={({ field }) => (<FormItem><FormLabel>URL do Logo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                  
                  <div className="pt-4 border-t mt-6">
                    <h3 className="text-lg font-semibold">Endereço e Localização</h3>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Buscar Endereço por CEP e Número *</Label>
                    <div className="flex gap-2">
                      {/* Usando Controller para CEP e Número para que o Zod possa validar */}
                      <Controller
                        name="zip_code"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <ZipCodeInput 
                                placeholder="Digite o CEP"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Controller
                        name="number"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem className="w-24">
                            <FormControl>
                              <Input 
                                placeholder="Nº"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="button" onClick={handleAddressSearch} disabled={isSearchingCep}>
                        {isSearchingCep ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Coloque o CEP e nº do estabelecimento e para melhor precisão mova o alfinete no mapa e salve as configurações
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={form.control} name="street" render={({ field }) => (<FormItem className="md:col-span-2"><FormLabel>Rua</FormLabel><FormControl><Input {...field} disabled /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="number" render={({ field }) => (<FormItem className="md:col-span-1"><FormLabel>Número *</FormLabel><FormControl><Input {...field} disabled /></FormControl><FormMessage /></FormItem>)} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="neighborhood" render={({ field }) => (<FormItem><FormLabel>Bairro</FormLabel><FormControl><Input {...field} disabled /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="city" render={({ field }) => (<FormItem><FormLabel>Cidade</FormLabel><FormControl><Input {...field} disabled /></FormControl><FormMessage /></FormItem>)} />
                  </div>
                  <FormField control={form.control} name="zip_code" render={({ field }) => (<FormItem><FormLabel>CEP *</FormLabel><FormControl><ZipCodeInput {...field} disabled /></FormControl><FormMessage /></FormItem>)} />

                  <div className="pt-4 border-t">
                    {showMap && (
                      <MapLocationSection 
                        mapKey={mapKey}
                        markerPosition={markerPosition}
                        onLocationChange={handleMapLocationChange}
                        updateAddressFields={updateAddressFields}
                        restaurant={restaurant}
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="latitude" render={({ field }) => (<FormItem><FormLabel>Latitude *</FormLabel><FormControl><Input {...field} placeholder="-22.7627908" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="longitude" render={({ field }) => (<FormItem><FormLabel>Longitude *</FormLabel><FormControl><Input {...field} placeholder="-47.408315" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField 
                      control={form.control} 
                      name="phone" 
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telefone *</FormLabel>
                          <FormControl>
                            <PhoneInput {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} 
                    />
                    <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                  </div>
                  <FormField control={form.control} name="is_active" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><FormLabel className="font-normal">Restaurante Ativo</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                  <Button type="submit" className="w-full h-12 text-lg" disabled={restaurantMutation.isPending || !userRestaurantId}>{restaurantMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}</Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default Settings;