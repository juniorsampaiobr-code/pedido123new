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
import { Plus, Trash2, Terminal } from 'lucide-react';
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
import { useEffect, useState } from 'react';

type DeliveryZone = Tables<'delivery_zones'>;

const zoneSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'O nome do bairro é obrigatório.'),
  delivery_fee: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'Taxa deve ser um número.' }).min(0, 'A taxa não pode ser negativa.')
  ),
});

const zonesFormSchema = z.object({
  zones: z.array(zoneSchema),
});

type ZonesFormValues = z.infer<typeof zonesFormSchema>;

const fetchDeliveryZones = async (restaurantId: string): Promise<DeliveryZone[]> => {
  const { data, error } = await supabase
    .from('delivery_zones')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name', { ascending: true });

  if (error) throw new Error(`Erro ao buscar zonas de entrega: ${error.message}`);
  return data;
};

const Delivery = () => {
  const queryClient = useQueryClient();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  useQuery({
    queryKey: ['restaurantIdForDelivery'],
    queryFn: async () => {
      const { data, error } = await supabase.from('restaurants').select('id').limit(1).single();
      if (error) throw new Error(error.message);
      setRestaurantId(data.id);
      return data.id;
    },
  });

  const { data: deliveryZones, isLoading: isLoadingZones, isError: isErrorZones, error: errorZones } = useQuery<DeliveryZone[]>({
    queryKey: ['deliveryZones', restaurantId],
    queryFn: () => fetchDeliveryZones(restaurantId!),
    enabled: !!restaurantId,
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

  useEffect(() => {
    if (deliveryZones) {
      const formattedZones = deliveryZones.map(zone => ({
        id: zone.id,
        name: zone.name || '',
        delivery_fee: zone.delivery_fee,
      }));
      replace(formattedZones);
    }
  }, [deliveryZones, replace]);

  const zonesMutation = useMutation({
    mutationFn: async (data: ZonesFormValues) => {
      if (!restaurantId) throw new Error('ID do restaurante não disponível.');

      const updates = data.zones.map(zone => ({
        restaurant_id: restaurantId,
        name: zone.name,
        delivery_fee: zone.delivery_fee,
        is_active: true,
        max_distance_km: null, // Not used for neighborhood-based fees
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
      toast.success('Taxas de entrega salvas com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['deliveryZones'] });
    },
    onError: (err) => {
      toast.error(`Erro ao salvar taxas de entrega: ${err.message}`);
    },
  });

  const handleZonesSubmit = (data: ZonesFormValues) => {
    zonesMutation.mutate(data);
  };

  return (
    <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-8">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Taxas de Entrega por Bairro</CardTitle>
            <p className="text-sm text-muted-foreground">
              Defina a taxa de entrega para cada bairro ou região de atendimento.
            </p>
          </CardHeader>
          <CardContent>
            {isLoadingZones || !restaurantId ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-12 w-full mt-4" />
              </div>
            ) : isErrorZones ? (
              <Alert variant="destructive">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Erro ao carregar taxas de entrega</AlertTitle>
                <AlertDescription>{errorZones instanceof Error ? errorZones.message : "Ocorreu um erro desconhecido."}</AlertDescription>
              </Alert>
            ) : (
              <Form {...zonesForm}>
                <form onSubmit={zonesForm.handleSubmit(handleZonesSubmit)} className="space-y-6">
                  
                  {zoneFields.map((field, index) => (
                    <div key={field.id} className="border p-4 rounded-lg space-y-4 relative">
                      <h4 className="font-semibold text-lg">Bairro {index + 1}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={zonesForm.control}
                          name={`zones.${index}.name`}
                          render={({ field: nameField }) => (
                            <FormItem>
                              <FormLabel>Nome do Bairro *</FormLabel>
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
                    })}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Adicionar Novo Bairro
                  </Button>

                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-lg mt-6"
                    disabled={zonesMutation.isPending}
                  >
                    {zonesMutation.isPending ? 'Salvando...' : 'Salvar Taxas de Entrega'}
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