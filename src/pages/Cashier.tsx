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
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from "sonner";
import { Wallet, DollarSign, TrendingUp, Calendar, Terminal } from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type CashRegister = Tables<'cash_register'>;

const openCashierSchema = z.object({
  opening_balance: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'O saldo deve ser um número.' }).min(0, 'O saldo inicial não pode ser negativo.')
  ),
});

type OpenCashierFormValues = z.infer<typeof openCashierSchema>;

const closeCashierSchema = z.object({
  closing_balance: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'O saldo deve ser um número.' }).min(0, 'O saldo final não pode ser negativo.')
  ),
  notes: z.string().optional(),
});

type CloseCashierFormValues = z.infer<typeof closeCashierSchema>;

// --- Data Fetching Functions ---

const fetchCurrentCashier = async (restaurantId: string): Promise<CashRegister | null> => {
  // Busca o último registro de caixa que ainda não foi fechado (closed_at IS NULL)
  const { data, error } = await supabase
    .from('cash_register')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .is('closed_at', null)
    .order('opened_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found
    throw new Error(`Erro ao buscar caixa: ${error.message}`);
  }
  
  return data || null;
};

// Mock function for sales today (to be replaced by actual order calculation later)
const fetchSalesToday = async (): Promise<number> => {
  // TODO: Implement actual sales calculation based on orders created since cashier opened
  return 0.00; 
};

// --- Components ---

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
}

const StatCard = ({ title, value, icon: Icon }: StatCardProps) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">
        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
      </div>
    </CardContent>
  </Card>
);

// --- Main Page ---

const Cashier = () => {
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

  // 3. Busca do Caixa Atual e Vendas
  const { data: currentCashier, isLoading: isLoadingCashier, isError: isErrorCashier, error: errorCashier } = useQuery<CashRegister | null>({
    queryKey: ['currentCashier', restaurantId],
    queryFn: () => fetchCurrentCashier(restaurantId!),
    enabled: !!restaurantId,
  });

  const { data: salesToday = 0, isLoading: isLoadingSales } = useQuery<number>({
    queryKey: ['salesToday', currentCashier?.opened_at],
    queryFn: fetchSalesToday,
    enabled: !!currentCashier,
  });

  const currentBalance = (currentCashier?.opening_balance || 0) + salesToday;
  const isCashierOpen = !!currentCashier;

  // 4. Formulários
  const openForm = useForm<OpenCashierFormValues>({
    resolver: zodResolver(openCashierSchema),
    defaultValues: { opening_balance: 0 },
  });

  const closeForm = useForm<CloseCashierFormValues>({
    resolver: zodResolver(closeCashierSchema),
    defaultValues: { 
      closing_balance: currentBalance,
      notes: '',
    },
    values: { // Update default value when currentBalance changes
      closing_balance: currentBalance,
      notes: '',
    }
  });

  // 5. Mutações
  const openMutation = useMutation({
    mutationFn: async (data: OpenCashierFormValues) => {
      if (!restaurantId || !user) throw new Error('Dados de usuário ou restaurante indisponíveis.');
      
      const insertData: TablesInsert<'cash_register'> = {
        restaurant_id: restaurantId,
        opening_balance: data.opening_balance,
        opened_by: user.id,
      };

      const { error } = await supabase.from('cash_register').insert(insertData);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Caixa aberto com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['currentCashier'] });
      openForm.reset({ opening_balance: 0 });
    },
    onError: (err) => {
      toast.error(`Erro ao abrir caixa: ${err.message}`);
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (data: CloseCashierFormValues) => {
      if (!currentCashier?.id || !user) throw new Error('Nenhum caixa aberto para fechar.');
      
      const updateData: TablesUpdate<'cash_register'> = {
        closed_at: new Date().toISOString(),
        closed_by: user.id,
        closing_balance: data.closing_balance,
        notes: data.notes,
      };

      const { error } = await supabase
        .from('cash_register')
        .update(updateData)
        .eq('id', currentCashier.id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Caixa fechado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['currentCashier'] });
      closeForm.reset();
    },
    onError: (err) => {
      toast.error(`Erro ao fechar caixa: ${err.message}`);
    },
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (!user) {
    return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }

  const isDataLoading = isLoadingCashier || !restaurantId;

  return (
    <div className="flex min-h-screen bg-muted/40">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="border-b bg-background sticky top-0 z-40">
          <div className="container max-w-none mx-auto px-8 h-16 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Wallet className="h-6 w-6" />
              <h1 className="text-xl font-semibold">Caixa</h1>
            </div>
            <Button variant="outline" onClick={handleSignOut}>
              Sair
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-6">
          {isErrorCashier && (
            <Alert variant="destructive">
              <Terminal className="h-4 w-4" />
              <AlertTitle>Erro ao carregar caixa</AlertTitle>
              <AlertDescription>{errorCashier instanceof Error ? errorCashier.message : "Ocorreu um erro desconhecido."}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            {isDataLoading ? (
              <>
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </>
            ) : (
              <>
                <StatCard
                  title="Saldo Inicial"
                  value={currentCashier?.opening_balance || 0}
                  icon={DollarSign}
                />
                <StatCard
                  title="Vendas Hoje"
                  value={salesToday}
                  icon={TrendingUp}
                />
                <StatCard
                  title="Saldo Atual"
                  value={currentBalance}
                  icon={Calendar}
                />
              </>
            )}
          </div>

          <Card className="max-w-3xl mx-auto">
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Controle de Caixa</CardTitle>
              <p className={`text-sm font-medium ${isCashierOpen ? 'text-green-600' : 'text-destructive'}`}>
                Caixa está {isCashierOpen ? 'aberto' : 'fechado'}
              </p>
              {isCashierOpen && (
                <p className="text-xs text-muted-foreground">
                  Aberto em: {new Date(currentCashier.opened_at).toLocaleString('pt-BR')}
                </p>
              )}
            </CardHeader>
            <CardContent>
              {isDataLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-1/3" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full mt-4" />
                </div>
              ) : isCashierOpen ? (
                // Form for closing the cashier
                <form onSubmit={closeForm.handleSubmit((data) => closeMutation.mutate(data))} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="closing_balance">Saldo Final (R$)</Label>
                    <Input
                      id="closing_balance"
                      type="number"
                      step="0.01"
                      {...closeForm.register('closing_balance', { valueAsNumber: true })}
                      className="h-12 text-lg"
                    />
                    {closeForm.formState.errors.closing_balance && (
                      <p className="text-destructive text-sm">{closeForm.formState.errors.closing_balance.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações (Opcional)</Label>
                    <Input
                      id="notes"
                      {...closeForm.register('notes')}
                      className="h-12"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground h-12 text-lg"
                    disabled={closeMutation.isPending}
                  >
                    {closeMutation.isPending ? 'Fechando...' : 'Fechar Caixa'}
                  </Button>
                </form>
              ) : (
                // Form for opening the cashier
                <form onSubmit={openForm.handleSubmit((data) => openMutation.mutate(data))} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="opening_balance">Saldo Inicial (R$)</Label>
                    <Input
                      id="opening_balance"
                      type="number"
                      step="0.01"
                      {...openForm.register('opening_balance', { valueAsNumber: true })}
                      className="h-12 text-lg"
                    />
                    {openForm.formState.errors.opening_balance && (
                      <p className="text-destructive text-sm">{openForm.formState.errors.opening_balance.message}</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-lg"
                    disabled={openMutation.isPending}
                  >
                    {openMutation.isPending ? 'Abrindo...' : 'Abrir Caixa'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
};

export default Cashier;