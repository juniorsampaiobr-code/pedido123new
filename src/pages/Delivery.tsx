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
import { Plus, Trash2, Terminal, Settings } from 'lucide-react';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useEffect } from 'react';
import { DeliveryZoneMap } from '@/components/DeliveryZoneMap';
import { Link } from 'react-router-dom';

type DeliveryZone = Tables<'delivery_zones'>;
type Restaurant = Tables<'restaurants'>;

const zoneSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'O nome da zona é obrigatório.'),
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
    .select('*')
    .limit(1)
    .single();

  if (error) throw new Error(`Erro ao buscar dados do restaurante: ${error.message}`);
  if (!data) throw new Error('Nenhum restaurante encontrado.');
  return data;
};

const fetchDeliveryZones = async (restaurantId: string): Promise<DeliveryZone[]> => {
  const { data, error } = await supabase
    .from('delivery_zones')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('max_distance_km', { ascending: true });

  if (error) throw new Error(`Erro ao buscar zonas de entrega: ${error.message}`);
  return data;
};

const Delivery = () => {
  const queryClient = useQueryClient();

  const { data: restaurant, isLoading: isLoadingRestaurant } = useQuery<Restaurant>({
    queryKey: ['restaurantDataForDelivery'],
    queryFn: fetchRestaurantData,
  });

  const { data: deliveryZones, isLoading: isLoadingZones, isError: isErrorZones, error: errorZones } = useQuery<DeliveryZone[]>({
    queryKey: ['deliveryZones', restaurant?.id],
    queryFn: () => fetchDeliveryZones(restaurant!.id),
    enabled: !!restaurant?.id,
  });

  const zonesForm = useForm<ZonesFormValues>({
    resolver: zodResolver(zonesFormSchema),
    defaultValues: { zones: [] },
    mode: 'onBlur',
  });

  const { fields: zoneFields, append: appendZone, remove: removeZone, replace } = useFieldArray({
    control: zonesForm.control,
    name: "zones",
  });

  const watchedZones = zonesForm.watch('zones');

  useEffect(() => {
    if (deliveryZones) {
      const formattedZones = deliveryZones.map(zone => ({
        id: zone.id,
        name: zone.name || '',
        delivery_fee: zone.delivery_fee,
        max_distance_km: zone.max_distance_km || 1,
      }));
      replace(formattedZones);
    }
  }, [deliveryZones, replace]);

  const zonesMutation = useMutation({
    mutationFn: async (data: ZonesFormValues) => {
      if (!restaurant?.id) throw new Error('ID do restaurante não disponível.');

      const updates = data.zones.map(zone => ({
        restaurant_id: restaurant.id,
        name: zone.name,
        delivery_fee: zone.delivery_fee,
        max_distance_km: zone.max_distance_km,
        is_active: true,
      }));

      const { error: deleteError } = await supabase
        .from('delivery_zones')
        .delete()
        .eq('restaurant_id', restaurant.id);
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

  const hasCoordinates = restaurant?.latitude && restaurant?.longitude;
  const restaurantCenter: [number, number] = hasCoordinates ? [restaurant.latitude!, restaurant.longitude!] : [0, 0];

  return (
    <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
        <div className="lg:sticky top-24 h-fit">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Mapa de Cobertura</CardTitle>
              <p className="text-sm text-muted-foreground">
                Visualize as faixas de entrega em tempo real.
              </p>
            </CardHeader>
            <CardContent>
              {isLoadingRestaurant ? (
                <Skeleton className="h-96 w-full" />
              ) : hasCoordinates ? (
                <DeliveryZoneMap center={restaurantCenter} zones={watchedZones} />
              ) : (
                <Alert>
                  <Settings className="h-4 w-4" />
                  <AlertTitle>Endereço Não Configurado</AlertTitle>
                  <AlertDescription>
                    Para visualizar o mapa de entrega, primeiro configure o endereço e as coordenadas do seu restaurante na página de Configurações.
                    <Link to="/settings">
                      <Button variant="link" className="p-0 h-auto mt-2">Ir para Configurações</Button>
                    </Link>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Zonas de Entrega</CardTitle>
              <p className="text-sm text-muted-foreground">
                Defina a taxa de entrega com base na distância máxima em quilômetros (km).
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <FormField
                            control={zonesForm.control}
                            name={`zones.${index}.name`}
                            render={({ field: nameField }) => (
                              <FormItem className="md:col-span-1">
                                <FormLabel>Nome da Zona *</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="Ex: Centro" 
                                    {...nameField} 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={zonesForm.control}
                            name={`zones.${index}.max_distance_km`}
                            render={({ field: distanceField }) => (
                              <FormItem className="md:col-span-1">
                                <FormLabel>Distância (km) *</FormLabel>
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
                              <FormItem className="md:col-span-1">
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
                      <Plus className="mr-2 h-4 w-4" /> Adicionar Nova Zona
                    </Button>

                    <Button 
                      type="submit" 
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-lg mt-6"
                      disabled={zonesMutation.isPending}
                    >
                      {zonesMutation.isPending ? 'Salvando...' : 'Salvar Zonas de Entrega'}
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
};

export default Delivery;