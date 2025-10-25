import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from "sonner";
import { MapPin, Plus, Trash2, Terminal } from 'lucide-react';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useEffect, useState } from 'react';

type Restaurant = Tables<'restaurants'>;
type DeliveryZone = Tables<'delivery_zones'>;

const coordinateSchema = z.object({
  latitude: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Latitude deve ser um número.' }).optional().nullable(),
  ),
  longitude: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Longitude deve ser um número.' }).optional().nullable(),
  ),
});

type CoordinateFormValues = z.infer<typeof coordinateSchema>;

const zoneSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  delivery_fee: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Taxa deve ser um número.' }).min(0, 'A taxa não pode ser negativa.')
  ),
  max_distance_km: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Distância deve ser um número.' }).positive('A distância máxima deve ser maior que zero.')
  ),
});

const zonesFormSchema = z.object({
  zones: z.array(zoneSchema),
});

type ZonesFormValues = z.infer<typeof zonesFormSchema>;

const fetchRestaurantData = async (): Promise<Restaurant> => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, latitude, longitude')
    .limit(1)
    .single();

  if (error) throw new Error(`Erro ao buscar dados do restaurante: ${error.message}`);
  if (!data) throw new Error('Nenhum restaurante encontrado.');
  return data as Restaurant;
};

const fetchDeliveryZones = async (restaurantId: string): Promise<DeliveryZone[]> => {
  const { data, error } = await supabase
    .from('delivery_zones')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('delivery_fee', { ascending: true });

  if (error) throw new Error(`Erro ao buscar zonas de entrega: ${error.message}`);
  return data;
};

const Delivery = () => {
  const queryClient = useQueryClient();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  const { data: restaurantData, isLoading: isLoadingRestaurant } = useQuery<Restaurant>({
    queryKey: ['restaurantCoordinates'],
    queryFn: fetchRestaurantData,
    onSuccess: (data) => setRestaurantId(data.id),
  });

  const { data: deliveryZones, isLoading: isLoadingZones, isError: isErrorZones, error: errorZones } = useQuery<DeliveryZone[]>({
    queryKey: ['deliveryZones', restaurantId],
    queryFn: () => fetchDeliveryZones(restaurantId!),
    enabled: !!restaurantId,
  });

  const coordForm = useForm<CoordinateFormValues>({
    resolver: zodResolver(coordinateSchema),
    defaultValues: {
      latitude: undefined,
      longitude: undefined,
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (restaurantData) {
      coordForm.reset({
        latitude: restaurantData.latitude ?? undefined,
        longitude: restaurantData.longitude ?? undefined,
      });
    }
  }, [restaurantData, coordForm]);

  const coordMutation = useMutation({
    mutationFn: async (data: CoordinateFormValues) => {
      if (!restaurantId) throw new Error('ID do restaurante não disponível.');
      
      const updateData: TablesUpdate<'restaurants'> = {
        latitude: data.latitude,
        longitude: data.longitude,
      };

      const { error } = await supabase
        .from('restaurants')
        .update(updateData)
        .eq('id', restaurantId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Coordenadas atualizadas com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['restaurantCoordinates'] });
    },
    onError: (err) => {
      toast.error(`Erro ao salvar coordenadas: ${err.message}`);
    },
  });

  const handleCoordSubmit = (data: CoordinateFormValues) => {
    coordMutation.mutate(data);
  };

  const zonesForm = useForm<ZonesFormValues>({
    resolver: zodResolver(zonesFormSchema),
    defaultValues: { zones: [] },
    mode: 'onBlur',
  });

  const { fields: zoneFields, append: appendZone, remove: removeZone } = useFieldArray({
    control: zonesForm.control,
    name: "zones",
  });

  useEffect(() => {
    if (deliveryZones) {
      const formattedZones = deliveryZones.map(zone => ({
        id: zone.id,
        name: zone.name || '',
        delivery_fee: zone.delivery_fee,
        max_distance_km: zone.minimum_order || 1, 
      }));
      zonesForm.reset({ zones: formattedZones });
    }
  }, [deliveryZones, zonesForm]);

  const zonesMutation = useMutation({
    mutationFn: async (data: ZonesFormValues) => {
      if (!restaurantId) throw new Error('ID do restaurante não disponível.');

      const updates = data.zones.map(zone => ({
        restaurant_id: restaurantId,
        name: zone.name || `Faixa até ${zone.max_distance_km} km`,
        delivery_fee: zone.delivery_fee,
        minimum_order: zone.max_distance_km,
        is_active: true,
      }));

      const { error: deleteError } = await supabase
        .from('delivery_zones')
        .delete()
        .eq('restaurant_id', restaurantId);
      if (deleteError) throw new Error(`Erro ao limpar zonas antigas: ${deleteError.message}`);

      const { error: insertError } = await supabase
        .from('delivery_zones')
        .insert(updates as TablesInsert<'delivery_zones'>[]);
      if (insertError) throw new Error(`Erro ao inserir novas zonas: ${insertError.message}`);
    },
    onSuccess: () => {
      toast.success('Faixas de entrega salvas com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['deliveryZones'] });
    },
    onError: (err) => {
      toast.error(`Erro ao salvar faixas de entrega: ${err.message}`);
    },
  });

  const handleZonesSubmit = (data: ZonesFormValues) => {
    zonesMutation.mutate(data);
  };

  return (
    <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="h-6 w-6 text-primary" />
              Localização do Restaurante
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Defina as coordenadas exatas do seu restaurante para calcular a distância de entrega.
            </p>
          </CardHeader>
          <CardContent>
            {isLoadingRestaurant ? (
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-1/2 col-span-2" />
              </div>
            ) : (
              <Form {...coordForm}>
                <form onSubmit={coordForm.handleSubmit(handleCoordSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={coordForm.control}
                      name="latitude"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Latitude</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="text"
                              placeholder="-22.7627908" 
                              value={field.value === undefined || field.value === null ? '' : String(field.value)}
                              onChange={(e) => field.onChange(e.target.value)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={coordForm.control}
                      name="longitude"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Longitude</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="text"
                              placeholder="-47.408315" 
                              value={field.value === undefined || field.value === null ? '' : String(field.value)}
                              onChange={(e) => field.onChange(e.target.value)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={coordMutation.isPending}
                  >
                    {coordMutation.isPending ? 'Salvando...' : 'Atualizar Coordenadas'}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Faixas de Distância</CardTitle>
            <p className="text-sm text-muted-foreground">
              Defina a taxa de entrega com base na distância máxima em quilômetros (km) a partir do restaurante.
            </p>
          </CardHeader>
          <CardContent>
            {isLoadingZones ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-12 w-full mt-4" />
              </div>
            ) : isErrorZones ? (
              <Alert variant="destructive">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Erro ao carregar zonas de entrega</AlertTitle>
                <AlertDescription>{errorZones instanceof Error ? errorZones.message : "Ocorreu um erro desconhecido."}</AlertDescription>
              </Alert>
            ) : (
              <Form {...zonesForm}>
                <form onSubmit={zonesForm.handleSubmit(handleZonesSubmit)} className="space-y-6">
                  
                  {zoneFields.map((field, index) => (
                    <div key={field.id} className="border p-4 rounded-lg space-y-4 relative">
                      <h4 className="font-semibold text-lg">Faixa {index + 1}</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={zonesForm.control}
                          name={`zones.${index}.max_distance_km`}
                          render={({ field: distanceField }) => (
                            <FormItem>
                              <FormLabel>Distância Máxima (km) *</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  step="0.1" 
                                  placeholder="2" 
                                  {...distanceField} 
                                  value={distanceField.value === undefined || distanceField.value === null ? '' : String(distanceField.value)}
                                  onChange={(e) => distanceField.onChange(e.target.value)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={zonesForm.control}
                          name={`zones.${index}.delivery_fee`}
                          render={({ field: feeField }) => (
                            <FormItem>
                              <FormLabel>Taxa (R$) *</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  step="0.01" 
                                  placeholder="4,00" 
                                  {...feeField} 
                                  value={feeField.value === undefined || feeField.value === null ? '' : String(feeField.value)}
                                  onChange={(e) => feeField.onChange(e.target.value)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <Button 
                        type="button" 
                        variant="destructive" 
                        size="icon" 
                        className="absolute top-4 right-4"
                        onClick={() => removeZone(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full"
                    onClick={() => appendZone({ 
                      name: '', 
                      delivery_fee: 0, 
                      max_distance_km: 1,
                    })}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Adicionar Nova Faixa
                  </Button>

                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-lg mt-6"
                    disabled={zonesMutation.isPending}
                  >
                    {zonesMutation.isPending ? 'Salvando...' : 'Salvar Faixas de Entrega'}
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

export default Delivery;