import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
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
import { Upload, Music, Search, Loader2, Volume2, CheckCircle, XCircle, MapPin, Mail, Phone } from 'lucide-react';
import { TablesUpdate, Tables } from '@/integrations/supabase/types';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { ZipCodeInput } from '@/components/ZipCodeInput';
import { PhoneInput } from '@/components/PhoneInput';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MapLocationSection } from '@/components/MapLocationSection';
import { useOutletContext } from 'react-router-dom';
import { DashboardContextType } from '@/layouts/DashboardLayout';
import { geocodeAddress } from '@/utils/location';

type Restaurant = Tables<'restaurants'>;

const cleanPhoneNumber = (phone: string) => phone.replace(/\D/g, '');

const restaurantSchema = z.object({
  name: z.string().min(1, 'O nome do restaurante é obrigatório.'),
  description: z.string().optional(),
  street: z.string().min(1, 'A rua é obrigatória.'),
  number: z.string().min(1, 'O número é obrigatório.'),
  neighborhood: z.string().min(1, 'O bairro é obrigatório.'),
  city: z.string().min(1, 'A cidade é obrigatória.'),
  zip_code: z.string().min(1, 'O CEP é obrigatório.').transform(val => val.replace(/\D/g, '')).refine(val => val.length === 8, {
    message: 'O CEP deve ter 8 dígitos.',
  }),
  phone: z.string().min(1, 'Telefone é obrigatório.').transform(cleanPhoneNumber).refine(val => val.length >= 10, {
    message: 'O telefone deve ter pelo menos 10 dígitos (incluindo DDD).',
  }),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  is_active: z.boolean().default(true),
  latitude: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Latitude deve ser um número.' }).refine(val => val !== null, {
      message: 'A localização no mapa é obrigatória. Mova o pino no mapa para definir a localização.',
    }),
  ),
  longitude: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Longitude deve ser um número.' }).refine(val => val !== null, {
      message: 'A localização no mapa é obrigatória. Mova o pino no pino para definir a localização.',
    }),
  ),
});

type RestaurantFormValues = z.infer<typeof restaurantSchema>;

const fetchRestaurantData = async (restaurantId: string): Promise<Restaurant> => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single();

  if (error) throw new Error(`Erro ao buscar dados do restaurante: ${error.message}`);
  if (!data) throw new Error('Nenhum restaurante encontrado.');
  return data;
};

const Settings = () => {
  const queryClient = useQueryClient();
  const { userRestaurantId } = useOutletContext<DashboardContextType>();
  const [showMap, setShowMap] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  
  // NOVO ESTADO: Armazena o último endereço que foi geocodificado com sucesso
  const [lastGeocodedAddress, setLastGeocodedAddress] = useState<string | null>(null);

  const { data: restaurant, isLoading, isError, error } = useQuery<Restaurant>({
    queryKey: ['restaurantSettings', userRestaurantId],
    queryFn: () => fetchRestaurantData(userRestaurantId!),
    enabled: !!userRestaurantId,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email || null);
    });
  }, []);

  const form = useForm<RestaurantFormValues>({
    resolver: zodResolver(restaurantSchema),
    defaultValues: {
      name: '',
      description: '',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      zip_code: '',
      phone: '',
      email: '',
      is_active: true,
      latitude: null,
      longitude: null,
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (restaurant) {
      const initialZipCode = restaurant.zip_code || '';
      const initialAddress = `${restaurant.street || ''}, ${restaurant.number || ''}, ${restaurant.neighborhood || ''}, ${restaurant.city || ''}, ${initialZipCode}`;
      
      form.reset({
        name: restaurant.name || '',
        description: restaurant.description || '',
        street: restaurant.street || '',
        number: restaurant.number || '',
        neighborhood: restaurant.neighborhood || '',
        city: restaurant.city || '',
        zip_code: initialZipCode,
        phone: restaurant.phone || '',
        email: restaurant.email || '',
        is_active: restaurant.is_active ?? true,
        latitude: restaurant.latitude ?? null,
        longitude: restaurant.longitude ?? null,
      });
      
      // Define o endereço inicial como o último geocodificado para evitar loop na inicialização
      setLastGeocodedAddress(initialAddress);
      
      // Mostra o mapa apenas após carregar os dados
      if (restaurant.latitude && restaurant.longitude) {
        setShowMap(true);
      }
    }
  }, [restaurant, form.reset]);

  const lat = form.watch('latitude');
  const lng = form.watch('longitude');
  
  // Observa os campos de endereço
  const addressFields = form.watch(['street', 'number', 'neighborhood', 'city', 'zip_code']);
  const [street, number, neighborhood, city, zip_code] = addressFields;
  
  const currentFullAddress = useMemo(() => {
    const cleanedZip = zip_code.replace(/\D/g, '');
    if (!street || !number || !neighborhood || !city || cleanedZip.length !== 8) {
      return null;
    }
    return `${street}, ${number}, ${neighborhood}, ${city}, ${cleanedZip}`;
  }, [street, number, neighborhood, city, zip_code]);


  const DEFAULT_CENTER: [number, number] = [-23.55052, -46.633308]; // São Paulo

  const markerPosition = useMemo((): [number, number] => {
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      return [lat, lng];
    }
    return DEFAULT_CENTER;
  }, [lat, lng]);

  const handleMapLocationChange = useCallback((newLat: number, newLng: number) => {
    // Quando o usuário arrasta o pino, atualizamos as coordenadas
    form.setValue('latitude', newLat, { shouldValidate: true });
    form.setValue('longitude', newLng, { shouldValidate: true });
    
    // IMPORTANTE: Não atualizamos lastGeocodedAddress aqui, pois a mudança veio do mapa, não do texto.
  }, [form]);
  
  // Função para geocodificar o endereço e atualizar o mapa
  const geocodeAndSetMap = useCallback(async (address: string) => {
    if (isGeocoding || address === lastGeocodedAddress) return;
    
    setIsGeocoding(true);
    const loadingToast = toast.loading("Buscando coordenadas do endereço...");

    try {
      const coords = await geocodeAddress(address);
      
      if (coords) {
        // Atualiza os campos de latitude e longitude do formulário
        form.setValue('latitude', coords.lat, { shouldValidate: true });
        form.setValue('longitude', coords.lng, { shouldValidate: true });
        setLastGeocodedAddress(address); // Marca o endereço como geocodificado
        toast.success("Localização do mapa atualizada!");
      } else {
        toast.warning("Não foi possível encontrar o endereço no mapa. Verifique os campos.");
      }
    } catch (e) {
      console.error("Geocoding error:", e);
      toast.error("Erro ao buscar coordenadas.");
    } finally {
      setIsGeocoding(false);
      toast.dismiss(loadingToast);
    }
  }, [isGeocoding, lastGeocodedAddress, form]);
  
  // Efeito para acionar a geocodificação quando os campos de endereço mudam
  useEffect(() => {
    if (!currentFullAddress) return;
    
    // Verifica se o endereço mudou desde a última geocodificação
    if (currentFullAddress !== lastGeocodedAddress) {
      // Aciona a geocodificação com um pequeno debounce (ex: 500ms)
      const handler = setTimeout(() => {
        geocodeAndSetMap(currentFullAddress);
      }, 500);

      return () => {
        clearTimeout(handler);
      };
    }
  }, [currentFullAddress, lastGeocodedAddress, geocodeAndSetMap]);


  const restaurantMutation = useMutation({
    mutationFn: async (data: RestaurantFormValues) => {
      if (!userRestaurantId) throw new Error('ID do restaurante não disponível.');

      const updatePayload: TablesUpdate<'restaurants'> = {
        name: data.name,
        description: data.description,
        logo_url: null,
        street: data.street,
        number: data.number,
        neighborhood: data.neighborhood,
        city: data.city,
        zip_code: data.zip_code.replace(/\D/g, ''),
        phone: data.phone,
        email: data.email,
        is_active: data.is_active,
        latitude: data.latitude,
        longitude: data.longitude,
        // O campo 'address' é redundante, mas garantimos que os campos individuais estão salvos
        address: `${data.street}, ${data.number}, ${data.neighborhood}, ${data.city}, ${data.zip_code}`,
      };

      const { error: restaurantError } = await supabase
        .from('restaurants')
        .update(updatePayload)
        .eq('id', userRestaurantId);

      if (restaurantError) throw restaurantError;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const profileUpdatePayload: TablesUpdate<'profiles'> = {
          phone: data.phone,
        };
        const { error: profileError } = await supabase
          .from('profiles')
          .update(profileUpdatePayload)
          .eq('id', user.id);
        if (profileError) console.warn("Falha ao sincronizar telefone com o perfil:", profileError.message);
      }
    },
    onSuccess: () => {
      toast.success('Configurações salvas com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['restaurantSettings', userRestaurantId] });
      queryClient.invalidateQueries({ queryKey: ['adminProfile'] });
    },
    onError: (err) => toast.error(`Erro ao salvar configurações: ${err.message}`),
  });

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
                  
                  <div className="pt-4 border-t mt-6">
                    <h3 className="text-lg font-semibold">Contato e Status</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <Mail className="h-4 w-4" />
                        Email do Administrador
                      </Label>
                      <Input
                        value={userEmail || 'N/A'}
                        disabled
                        className="bg-muted/50"
                      />
                      <p className="text-xs text-muted-foreground">Este é o email de login do administrador.</p>
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            Telefone do Restaurante *
                          </FormLabel>
                          <FormControl>
                            <PhoneInput {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="pt-4 border-t mt-6">
                    <h3 className="text-lg font-semibold">Endereço e Localização</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="street"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rua *</FormLabel>
                          <FormControl>
                            <Input placeholder="Nome da rua" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número *</FormLabel>
                          <FormControl>
                            <Input placeholder="Número" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="neighborhood"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bairro *</FormLabel>
                          <FormControl>
                            <Input placeholder="Bairro" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cidade *</FormLabel>
                          <FormControl>
                            <Input placeholder="Cidade" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="zip_code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CEP *</FormLabel>
                          <FormControl>
                            <ZipCodeInput placeholder="00000-000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="pt-4 border-t">
                    {showMap && (
                      <MapLocationSection
                        markerPosition={markerPosition}
                        onLocationChange={handleMapLocationChange}
                        restaurant={restaurant}
                      />
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="latitude"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Latitude *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="-22.7627908" value={field.value ?? ''} disabled={isGeocoding} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="longitude"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Longitude *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="-47.408315" value={field.value ?? ''} disabled={isGeocoding} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <FormLabel className="font-normal">Restaurante Ativo</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <Button type="submit" className="w-full h-12 text-lg" disabled={restaurantMutation.isPending || !userRestaurantId || isGeocoding}>
                    {restaurantMutation.isPending || isGeocoding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Salvar Configurações'}
                  </Button>
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