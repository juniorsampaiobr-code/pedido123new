import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from "sonner";
import { Clock, Store, Settings as SettingsIcon } from 'lucide-react';
import { User } from '@supabase/supabase-js';
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
  day_of_week: z.number().min(0).max(6),
  is_open: z.boolean().default(true),
  open_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)").optional(),
  close_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)").optional(),
});

const hoursFormSchema = z.object({
  hours: z.array(hourSchema).refine(data => {
    // Validação: se is_open for true, open_time e close_time são obrigatórios
    return data.every(day => 
      !day.is_open || (day.open_time && day.close_time)
    );
  }, {
    message: "Horário de abertura e fechamento são obrigatórios para dias abertos.",
    path: ["hours"],
  }),
});

type HoursFormValues = z.infer<typeof hoursFormSchema>;

const DEFAULT_HOURS: BusinessHourInsert[] = DAYS_OF_WEEK.map(day => ({
  day_of_week: day.day_of_week,
  is_open: true,
  open_time: '09:00',
  close_time: '18:00',
  restaurant_id: '', // Será preenchido na mutação
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

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

  // 2. Busca do ID do Restaurante
  useQuery({
    queryKey: ['restaurantId'],
    queryFn: async () => {
      const { data, error } = await supabase.from('restaurants').select('id').limit(1).single();
      if (error) throw new Error(error.message);
      setRestaurantId(data.id);
      return data.id;
    },
    enabled: !!user && !restaurantId,
  });

  // 3. Busca dos Horários de Funcionamento
  const { data: fetchedHours, isLoading, isError, error } = useQuery<BusinessHour[]>({
    queryKey: ['businessHours', restaurantId],
    queryFn: () => fetchBusinessHours(restaurantId!),
    enabled: !!restaurantId,
  });

  // 4. Configuração do Formulário
  const form = useForm<HoursFormValues>({
    resolver: zodResolver(hoursFormSchema),
    defaultValues: {
      hours: DEFAULT_HOURS.map(h => ({
        ...h,
        open_time: h.open_time || '09:00',
        close_time: h.close_time || '18:00',
      })),
    },
    mode: 'onBlur',
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "hours",
  });

  // Sincroniza dados buscados com o formulário
  useEffect(() => {
    if (fetchedHours && fetchedHours.length > 0) {
      const sortedHours = fetchedHours.sort((a, b) => a.day_of_week - b.day_of_week);
      
      // Mapeia os dados buscados para o formato do formulário, garantindo que todos os 7 dias estejam presentes
      const formHours = DAYS_OF_WEEK.map(day => {
        const existing = sortedHours.find(h => h.day_of_week === day.day_of_week);
        return {
          day_of_week: day.day_of_week,
          is_open: existing?.is_open ?? false,
          open_time: existing?.open_time || '09:00',
          close_time: existing?.close_time || '18:00',
        };
      });
      replace(formHours);
    } else if (restaurantId && !isLoading) {
      // Se não houver dados, inicializa com os padrões
      replace(DEFAULT_HOURS.map(h => ({ ...h, restaurant_id: restaurantId })));
    }
  }, [fetchedHours, restaurantId, isLoading, replace]);

  // 5. Mutação para Salvar
  const mutation = useMutation({
    mutationFn: async (data: HoursFormValues) => {
      if (!restaurantId) throw new Error('ID do restaurante não disponível.');

      const updates: BusinessHourInsert[] = data.hours.map(h => ({
        restaurant_id: restaurantId,
        day_of_week: h.day_of_week,
        is_open: h.is_open,
        open_time: h.is_open ? h.open_time : null,
        close_time: h.is_open ? h.close_time : null,
      }));

      // 1. Deleta todos os horários existentes para o restaurante
      const { error: deleteError } = await supabase
        .from('business_hours')
        .delete()
        .eq('restaurant_id', restaurantId);

      if (deleteError) throw new Error(`Erro ao limpar horários antigos: ${deleteError.message}`);

      // 2. Insere os novos horários
      const { error: insertError } = await supabase
        .from('business_hours')
        .insert(updates);

      if (insertError) throw new Error(`Erro ao inserir novos horários: ${insertError.message}`);
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (!user) {
    return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }

  const isDataLoading = isLoading || !restaurantId;

  return (
    <div className="flex min-h-screen bg-muted/40">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="border-b bg-background sticky top-0 z-40">
          <div className="container max-w-none mx-auto px-8 h-16 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Clock className="h-6 w-6" />
              <h1 className="text-xl font-semibold">Horários</h1>
            </div>
            <Button variant="outline" onClick={handleSignOut}>
              Sair
            </Button>
          </div>
        </header>

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
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {fields.map((field, index) => {
                      const dayInfo = DAYS_OF_WEEK.find(d => d.day_of_week === field.day_of_week);
                      const isClosed = !form.watch(`hours.${index}.is_open`);

                      return (
                        <div key={field.id}>
                          <div className="flex items-center justify-between py-3">
                            <div className="w-32 font-medium">
                              {dayInfo?.label}
                            </div>
                            
                            <div className="flex items-center gap-4">
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
                                    <FormLabel className="text-sm font-normal w-16 text-right">
                                      {switchField.value ? 'Aberto' : 'Fechado'}
                                    </FormLabel>
                                  </FormItem>
                                )}
                              />

                              <div className={isClosed ? 'opacity-50 pointer-events-none' : 'flex gap-4'}>
                                <FormField
                                  control={form.control}
                                  name={`hours.${index}.open_time`}
                                  render={({ field: timeField }) => (
                                    <FormItem className="flex items-center gap-2">
                                      <FormLabel className="text-sm">Abre:</FormLabel>
                                      <FormControl>
                                        <TimeInput {...timeField} />
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
                                        <TimeInput {...timeField} />
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
      </div>
    </div>
  );
};

export default Hours;