import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from "sonner";
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { TimeInput } from '@/components/TimeInput';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useEffect, useState } from 'react';

type BusinessHour = Tables<'business_hours'>;
type BusinessHourInsert = TablesInsert<'business_hours'>;

const DAYS_OF_WEEK = [
  { day_of_week: 0, label: 'Domingo' },
  { day_of_week: 1, label: 'Segunda-feira' },
  { day_of_week: 2, label: 'Terça-feira' },
  { day_of_week: 3, label: 'Quarta-feira' },
  { day_of_week: 4, label: 'Quinta-feira' },
  { day_of_week: 5, label: 'Sexta-feira' },
  { day_of_week: 6, label: 'Sábado' },
];

const hourSchema = z.object({
  id: z.string().optional(),
  day_of_week: z.number().min(0).max(6),
  is_open: z.boolean().default(true),
  open_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)").optional().nullable(),
  close_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)").optional().nullable(),
});

const hoursFormSchema = z.object({
  hours: z.array(hourSchema).refine(data => {
    return data.every(day => 
      !day.is_open || (day.open_time && day.close_time)
    );
  }, {
    message: "Horário de abertura e fechamento são obrigatórios para dias abertos.",
    path: ["hours"],
  }),
});

type HoursFormValues = z.infer<typeof hoursFormSchema>;

const DEFAULT_HOURS: Omit<BusinessHourInsert, 'restaurant_id'>[] = DAYS_OF_WEEK.map(day => ({
  day_of_week: day.day_of_week,
  is_open: true,
  open_time: '09:00',
  close_time: '18:00',
}));

const fetchBusinessHours = async (restaurantId: string): Promise<BusinessHour[]> => {
  const { data, error } = await supabase
    .from('business_hours')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('day_of_week', { ascending: true });

  if (error) throw new Error(`Erro ao buscar horários: ${error.message}`);
  return data;
};

const Hours = () => {
  const queryClient = useQueryClient();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  const { data: restaurantData, isLoading: isRestaurantLoading } = useQuery({
    queryKey: ['restaurantId'],
    queryFn: async () => {
      const { data, error } = await supabase.from('restaurants').select('id').limit(1).single();
      if (error) throw new Error(error.message);
      setRestaurantId(data.id);
      return data;
    },
  });

  const { data: fetchedHours, isLoading, isError, error } = useQuery<BusinessHour[]>({
    queryKey: ['businessHours', restaurantId],
    queryFn: () => fetchBusinessHours(restaurantId!),
    enabled: !!restaurantId,
  });

  const form = useForm<HoursFormValues>({
    resolver: zodResolver(hoursFormSchema),
    defaultValues: {
      hours: DEFAULT_HOURS,
    },
    mode: 'onBlur',
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "hours",
  });

  useEffect(() => {
    if (fetchedHours && fetchedHours.length > 0) {
      const sortedHours = fetchedHours.sort((a, b) => a.day_of_week - b.day_of_week);
      
      const formHours = DAYS_OF_WEEK.map(day => {
        const existing = sortedHours.find(h => h.day_of_week === day.day_of_week);
        return {
          id: existing?.id,
          day_of_week: day.day_of_week,
          is_open: existing?.is_open ?? true,
          open_time: existing?.open_time || '09:00',
          close_time: existing?.close_time || '18:00',
        };
      });
      
      replace(formHours);
    } else if (restaurantId && !isLoading) {
      // Se não houver horários cadastrados, usar os valores padrão
      replace(DEFAULT_HOURS);
    }
  }, [fetchedHours, restaurantId, isLoading, replace]);

  const mutation = useMutation({
    mutationFn: async (data: HoursFormValues) => {
      if (!restaurantId) throw new Error('ID do restaurante não disponível.');

      // 1. Preparar os dados para upsert (inserção ou atualização)
      const updates = data.hours.map(h => ({
        id: h.id, // Incluir ID se existir
        restaurant_id: restaurantId,
        day_of_week: h.day_of_week,
        is_open: h.is_open,
        // Se estiver fechado, garantir que os horários sejam NULL no banco de dados
        open_time: h.is_open ? h.open_time : null,
        close_time: h.is_open ? h.close_time : null,
      }));

      // 2. Se houver IDs existentes, fazemos um upsert (update ou insert)
      // Como o Supabase não suporta upsert com IDs gerados automaticamente, 
      // e o `business_hours` não tem uma chave única natural além do ID, 
      // vamos usar a estratégia de deletar e inserir se for a primeira vez, 
      // ou atualizar/inserir individualmente se já houver dados.
      
      if (fetchedHours && fetchedHours.length > 0) {
        // Atualizar ou inserir individualmente
        const updatePromises = updates.map(async (update) => {
          if (update.id) {
            // Atualizar registro existente
            const { error } = await supabase
              .from('business_hours')
              .update(update)
              .eq('id', update.id);
            if (error) throw new Error(`Erro ao atualizar horário: ${error.message}`);
          } else {
            // Inserir novo registro (caso algum dia tenha sido perdido ou seja novo)
            const { error } = await supabase
              .from('business_hours')
              .insert(update);
            if (error) throw new Error(`Erro ao inserir horário: ${error.message}`);
          }
        });

        await Promise.all(updatePromises);
      } else {
        // Inserir todos os 7 dias de uma vez (primeira vez)
        const { error } = await supabase
          .from('business_hours')
          .insert(updates as TablesInsert<'business_hours'>[]);
        if (error) throw new Error(`Erro ao inserir horários: ${error.message}`);
      }
    },
    onSuccess: () => {
      toast.success('Horários de funcionamento salvos com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['businessHours'] });
    },
    onError: (err) => {
      toast.error(`Erro ao salvar horários: ${err.message}`);
    },
  });

  const onSubmit = (data: HoursFormValues) => {
    mutation.mutate(data);
  };

  const isDataLoading = isLoading || isRestaurantLoading || !restaurantId;

  return (
    <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-6">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Horário de Funcionamento</CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure os horários de abertura e fechamento para cada dia da semana
          </p>
        </CardHeader>
        <CardContent>
          {isDataLoading ? (
            <div className="space-y-4">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b last:border-b-0">
                  <Skeleton className="h-5 w-24" />
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-8 w-12" />
                    <Skeleton className="h-10 w-32" />
                    <Skeleton className="h-10 w-32" />
                  </div>
                </div>
              ))}
              <Skeleton className="h-12 w-full mt-6" />
            </div>
          ) : isError ? (
            <div className="text-destructive">
              Erro ao carregar horários: {error?.message || "Erro desconhecido"}
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {fields.map((field, index) => {
                  const dayInfo = DAYS_OF_WEEK.find(d => d.day_of_week === field.day_of_week);
                  const isClosed = !form.watch(`hours.${index}.is_open`);

                  return (
                    <div key={field.id}>
                      <div className="flex items-center justify-between py-3">
                        <div className="w-32 font-medium flex-shrink-0">
                          {dayInfo?.label}
                        </div>
                        
                        <div className="flex items-center gap-6">
                          {/* Switch Control Group */}
                          <FormField
                            control={form.control}
                            name={`hours.${index}.is_open`}
                            render={({ field: switchField }) => (
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <Switch
                                    checked={switchField.value}
                                    onCheckedChange={switchField.onChange}
                                  />
                                </FormControl>
                                <FormLabel className="text-sm font-normal w-16 text-left">
                                  {switchField.value ? 'Aberto' : 'Fechado'}
                                </FormLabel>
                              </FormItem>
                            )}
                          />

                          {/* Time Inputs Group */}
                          <div className={isClosed ? 'opacity-50 pointer-events-none flex gap-4' : 'flex gap-4'}>
                            <FormField
                              control={form.control}
                              name={`hours.${index}.open_time`}
                              render={({ field: timeField }) => (
                                <FormItem className="flex items-center gap-2">
                                  <FormLabel className="text-sm">Abre:</FormLabel>
                                  <FormControl>
                                    <TimeInput 
                                      {...timeField} 
                                      value={timeField.value || ''} // Use '' if null/undefined
                                      onChange={(e) => timeField.onChange(e.target.value)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`hours.${index}.close_time`}
                              render={({ field: timeField }) => (
                                <FormItem className="flex items-center gap-2">
                                  <FormLabel className="text-sm">Fecha:</FormLabel>
                                  <FormControl>
                                    <TimeInput 
                                      {...timeField} 
                                      value={timeField.value || ''} // Use '' if null/undefined
                                      onChange={(e) => timeField.onChange(e.target.value)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </div>
                      {index < DAYS_OF_WEEK.length - 1 && <Separator />}
                    </div>
                  );
                })}
                
                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-lg mt-6"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? 'Salvando...' : 'Salvar Horários'}
                </Button>
                {form.formState.errors.hours && (
                  <p className="text-destructive text-sm mt-2">
                    {form.formState.errors.hours.message}
                  </p>
                )}
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default Hours;