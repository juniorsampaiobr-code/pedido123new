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
import { Plus, Trash2, Edit, Terminal, Settings, ToggleLeft, ToggleRight } from 'lucide-react';
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
import { useEffect, useMemo, useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

type DeliveryZone = Tables<'delivery_zones'>;
type Restaurant = Tables<'restaurants'>; // Usando o tipo correto agora

const zoneSchema = z.object({
  id: z.string().optional(),
  max_distance_km: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Distância deve ser um número.' }).positive('A distância máxima deve ser maior que zero.')
  ),
  delivery_fee: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Taxa deve ser um número.' }).min(0, 'A taxa não pode ser negativa.')
  ),
  min_delivery_time_minutes: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Tempo deve ser um número.' }).min(0, 'O tempo mínimo não pode ser negativo.')
  ),
  center_latitude: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Latitude deve ser um número.' }).optional().nullable(),
  ),
  center_longitude: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Longitude deve ser um número.' }).optional().nullable(),
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

// Função para buscar o status das taxas de entrega
const fetchDeliveryStatus = async (restaurantId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('delivery_enabled')
    .eq('id', restaurantId)
    .single();

  if (error) {
    console.warn('Erro ao buscar status de entrega:', error);
    return true;
  }
  return data.delivery_enabled ?? true;
};

// Função para atualizar o status das taxas de entrega
const updateDeliveryStatus = async (restaurantId: string, enabled: boolean) => {
  const updatePayload: TablesUpdate<'restaurants'> = {
    delivery_enabled: enabled,
  };
  
  const { error } = await supabase
    .from('restaurants')
    .update(updatePayload)
    .eq('id', restaurantId);

  if (error) throw new Error(`Erro ao atualizar status de entrega: ${error.message}`);
};

const Delivery = () => {
  const navigate = useNavigate();
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

  // Query para buscar o status atual das taxas de entrega
  const { data: deliveryEnabled, isLoading: isLoadingDeliveryStatus } = useQuery<boolean>({
    queryKey: ['deliveryStatus', restaurant?.id],
    queryFn: () => fetchDeliveryStatus(restaurant!.id),
    enabled: !!restaurant?.id,
    initialData: true,
  });

  const zonesForm = useForm<ZonesFormValues>({
    resolver: zodResolver(zonesFormSchema),
    defaultValues: { zones: [] },
    mode: 'onChange',
  });

  const { fields: zoneFields, append: appendZone, remove: removeZone, replace } = useFieldArray({
    control: zonesForm.control,
    name: "zones",
  });

  const DEFAULT_CENTER: [number, number] = useMemo(() => {
    if (typeof restaurant?.latitude === 'number' && typeof restaurant?.longitude === 'number') {
      return [restaurant.latitude, restaurant.longitude];
    }
    return [-23.55052, -46.633308];
  }, [restaurant?.latitude, restaurant?.longitude]);

  const updateFormWithZones = useCallback((zones: DeliveryZone[]) => {
    const formattedZones = zones.map(zone => ({
      id: zone.id,
      delivery_fee: zone.delivery_fee,
      max_distance_km: zone.max_distance_km && typeof zone.max_distance_km === 'number' ? zone.max_distance_km : 1,
      min_delivery_time_minutes: zone.min_delivery_time_minutes ?? 0,
      center_latitude: zone.center_latitude,
      center_longitude: zone.center_longitude,
    }));
    replace(formattedZones);
  }, [replace]);

  useEffect(() => {
    if (deliveryZones) {
      updateFormWithZones(deliveryZones);
    }
  }, [deliveryZones, updateFormWithZones]);

  // Mutação para atualizar o status das taxas de entrega
  const deliveryStatusMutation = useMutation({
    mutationFn: ({ restaurantId, enabled }: { restaurantId: string; enabled: boolean }) => 
      updateDeliveryStatus(restaurantId, enabled),
    onSuccess: (_, variables) => {
      // Invalida a query de status de entrega do dashboard e do checkout
      queryClient.invalidateQueries({ queryKey: ['deliveryStatus'] });
      queryClient.invalidateQueries({ queryKey: ['checkoutDeliveryStatus'] });
      toast.success(`Taxas de entrega ${variables.enabled ? 'ativadas' : 'desativadas'} com sucesso!`);
    },
    onError: (err) => {
      toast.error(`Erro ao atualizar status: ${err.message}`);
    },
  });

  const zonesMutation = useMutation({
    mutationFn: async (data: ZonesFormValues) => {
      if (!restaurant?.id) throw new Error('ID do restaurante não disponível.');

      const updates = data.zones.map(zone => ({
        restaurant_id: restaurant.id,
        delivery_fee: zone.delivery_fee,
        max_distance_km: zone.max_distance_km,
        min_delivery_time_minutes: zone.min_delivery_time_minutes,
        center_latitude: zone.center_latitude,
        center_longitude: zone.center_longitude,
        is_active: true,
      }));

      // Estratégia: Deletar todas as zonas existentes e inserir as novas.
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
      queryClient.invalidateQueries({ queryKey: ['checkoutDeliveryZones'] });
    },
    onError: (err) => {
      toast.error(`Erro ao salvar faixas de entrega: ${err.message}`);
    },
  });

  const handleZonesSubmit = (data: ZonesFormValues) => {
    zonesMutation.mutate(data);
  };

  const handleNewZone = useCallback(() => {
    appendZone({ 
      delivery_fee: 5.00, 
      max_distance_km: 10,
      min_delivery_time_minutes: 30,
      center_latitude: DEFAULT_CENTER[0],
      center_longitude: DEFAULT_CENTER[1],
    });
  }, [appendZone, DEFAULT_CENTER]);

  const hasCoordinates = restaurant?.latitude && restaurant?.longitude;

  // Função para alternar o status de entrega
  const toggleDeliveryStatus = () => {
    if (restaurant?.id) {
      deliveryStatusMutation.mutate({ 
        restaurantId: restaurant.id, 
        enabled: !deliveryEnabled 
      });
    }
  };

  if (isLoadingZones || isLoadingRestaurant || isLoadingDeliveryStatus) {
    return (
      <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-8">
        <div className="max-w-3xl mx-auto"><Skeleton className="h-96 w-full" /></div>
      </main>
    );
  }

  if (isErrorZones) {
    return (
      <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-8">
        <div className="max-w-3xl mx-auto">
          <Alert variant="destructive">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Erro ao carregar zonas de entrega</AlertTitle>
            <AlertDescription>{errorZones instanceof Error ? errorZones.message : "Ocorreu um erro desconhecido."}</AlertDescription>
          </Alert>
        </div>
      </main>
    );
  }

  if (!hasCoordinates) {
    return (
      <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-8">
        <div className="max-w-3xl mx-auto">
          <Alert>
            <Settings className="h-4 w-4" />
            <AlertTitle>Endereço Não Configurado</AlertTitle>
            <AlertDescription>
              Para configurar zonas de entrega baseadas em distância, primeiro configure o endereço e as coordenadas do seu restaurante na página de Configurações.
              <Link to="/settings">
                <Button variant="link" className="p-0 h-auto mt-2">Ir para Configurações</Button>
              </Link>
            </AlertDescription>
          </Alert>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-8">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-2xl font-bold">Taxa de Entrega Dinâmica</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Defina a taxa de entrega com base na distância máxima em quilômetros (km) a partir do centro do seu restaurante.
                </p>
              </div>
              <div className="flex items-center gap-2 bg-muted p-3 rounded-lg">
                <span className="text-sm font-medium">Taxas de Entrega</span>
                <Switch
                  checked={deliveryEnabled}
                  onCheckedChange={toggleDeliveryStatus}
                />
                <span className="text-sm font-medium">{deliveryEnabled ? 'Ativadas' : 'Desativadas'}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...zonesForm}>
              <form onSubmit={zonesForm.handleSubmit(handleZonesSubmit)} className="space-y-6">
                
                {/* Table Header */}
                <div className="grid grid-cols-4 gap-4 p-3 rounded-lg bg-muted/50 font-semibold text-sm text-muted-foreground">
                  <div className="col-span-1">Distância (km)</div>
                  <div className="col-span-1">Valor da taxa (R$)</div>
                  <div className="col-span-1">Tempo mínimo (min)</div>
                  <div className="col-span-1 text-center">Ações</div>
                </div>

                {/* Zone List */}
                {zoneFields.map((field, index) => {
                  return (
                    <div key={field.id} className="grid grid-cols-4 gap-4 items-center p-4 border rounded-lg relative">
                      
                      {/* Distância (max_distance_km) */}
                      <div className="col-span-1">
                        <FormField
                          control={zonesForm.control}
                          name={`zones.${index}.max_distance_km`}
                          render={({ field: distanceField }) => (
                            <FormItem>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  step="0.1" 
                                  placeholder="km" 
                                  className="text-center"
                                  {...distanceField} 
                                  value={distanceField.value === undefined || distanceField.value === null ? '' : String(distanceField.value)}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const numericValue = value === '' ? '' : parseFloat(value.replace(',', '.'));
                                    distanceField.onChange(numericValue);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Valor da taxa (delivery_fee) */}
                      <div className="col-span-1">
                        <FormField
                          control={zonesForm.control}
                          name={`zones.${index}.delivery_fee`}
                          render={({ field: feeField }) => (
                            <FormItem>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  step="0.01" 
                                  placeholder="R$" 
                                  className="text-center"
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
                      
                      {/* Tempo mínimo (min_delivery_time_minutes) */}
                      <div className="col-span-1">
                        <FormField
                          control={zonesForm.control}
                          name={`zones.${index}.min_delivery_time_minutes`}
                          render={({ field: minTimeField }) => (
                            <FormItem>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  placeholder="min" 
                                  className="text-center"
                                  {...minTimeField} 
                                  value={minTimeField.value === undefined || minTimeField.value === null ? '' : String(minTimeField.value)}
                                  onChange={(e) => minTimeField.onChange(e.target.value)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Ações */}
                      <div className="col-span-1 flex justify-center gap-2">
                        <Button 
                          type="button" 
                          variant="destructive" 
                          size="icon" 
                          onClick={() => removeZone(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {/* Campos de Latitude/Longitude escondidos, mas necessários para o schema */}
                      <div className="hidden">
                        <FormField control={zonesForm.control} name={`zones.${index}.center_latitude`} render={({ field }) => (<Input type="hidden" {...field} />)} />
                        <FormField control={zonesForm.control} name={`zones.${index}.center_longitude`} render={({ field }) => (<Input type="hidden" {...field} />)} />
                      </div>
                    </div>
                  );
                })}

                {/* Mensagem de Atenção */}
                <div className="mt-8 text-sm">
                  <p className="font-bold mb-1">Atenção!</p>
                  <p className="text-muted-foreground">
                    Com a taxa dinâmica habilitada, você pode adicionar cobrar a taxa de entrega de acordo com a distância do local de entrega. Exemplo: até 2km cobrar R$4,00.
                  </p>
                </div>

                {/* Botões de Ação */}
                <div className="flex justify-end gap-4 pt-6 border-t">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => navigate('/settings')}
                  >
                    Redefinir local da loja
                  </Button>
                  <Button 
                    type="button" 
                    className={cn(
                      "bg-pink-500 hover:bg-pink-600 text-white",
                      zonesMutation.isPending && "opacity-70 cursor-not-allowed"
                    )}
                    onClick={handleNewZone}
                    disabled={zonesMutation.isPending}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Adicionar taxa dinâmica
                  </Button>
                  <Button 
                    type="submit" 
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={zonesMutation.isPending}
                  >
                    {zonesMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default Delivery;