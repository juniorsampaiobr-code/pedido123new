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
import { Switch } from '@/components/ui/switch';
import { toast } from "sonner";
import { CreditCard, Key, ExternalLink, DollarSign, Smartphone, Package, Store } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';

type PaymentMethod = Tables<'payment_methods'>;
type PaymentSettings = Tables<'payment_settings'>;

// --- Schemas ---

const credentialsSchema = z.object({
  mercado_pago_public_key: z.string().optional(),
  mercado_pago_access_token: z.string().optional(),
});

type CredentialsFormValues = z.infer<typeof credentialsSchema>;

const methodsSchema = z.object({
  methods: z.array(z.object({
    id: z.string(),
    is_active: z.boolean(),
  })),
});

type MethodsFormValues = z.infer<typeof methodsSchema>;

// --- Data Fetching & Mock Data ---

const fetchRestaurantId = async () => {
  const { data, error } = await supabase.from('restaurants').select('id').limit(1).single();
  if (error) throw new Error(error.message);
  return data.id;
};

const fetchPaymentSettings = async (restaurantId: string): Promise<PaymentSettings | null> => {
  const { data, error } = await supabase
    .from('payment_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data || null;
};

const fetchPaymentMethods = async (restaurantId: string): Promise<PaymentMethod[]> => {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
};

const DEFAULT_METHODS = [
  { name: 'Dinheiro', description: 'Pagamento em dinheiro na entrega', icon: DollarSign },
  { name: 'PIX', description: 'Pagamento via PIX', icon: Smartphone },
  { name: 'Pagamento Online', description: 'Pagamento online via cartão de crédito ou PIX', icon: CreditCard },
  { name: 'Pagamento com cartão na entrega', description: 'Aceita pagamento com cartão de débito ou crédito na entrega', icon: Package },
];

// Helper function to map icon name string back to Lucide component
const getIconComponent = (iconName: string) => {
  switch (iconName) {
    case 'DollarSign': return DollarSign;
    case 'Smartphone': return Smartphone;
    case 'CreditCard': return CreditCard;
    case 'Package': return Package;
    default: return Store;
  }
};

// --- Components ---

interface PaymentMethodItemProps {
  method: PaymentMethod;
  index: number;
  control: any;
  icon: React.ElementType;
}

const PaymentMethodItem = ({ method, index, control, icon: Icon }: PaymentMethodItemProps) => {
  return (
    <div className="flex items-center justify-between py-4 border-b last:border-b-0">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold">{method.name}</p>
          <p className="text-sm text-muted-foreground">{method.description}</p>
        </div>
      </div>
      <FormField
        control={control}
        name={`methods.${index}.is_active`}
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );
};

// --- Main Page ---

const Payments = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);

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
  const { data: restaurantId, isLoading: isLoadingRestaurantId } = useQuery<string>({
    queryKey: ['restaurantId'],
    queryFn: fetchRestaurantId,
    enabled: !!user,
  });

  // 3. Busca de Credenciais e Métodos
  const { data: settings, isLoading: isLoadingSettings } = useQuery<PaymentSettings | null>({
    queryKey: ['paymentSettings', restaurantId],
    queryFn: () => fetchPaymentSettings(restaurantId!),
    enabled: !!restaurantId,
  });

  const { data: methods, isLoading: isLoadingMethods, refetch: refetchMethods } = useQuery<PaymentMethod[]>({
    queryKey: ['paymentMethods', restaurantId],
    queryFn: () => fetchPaymentMethods(restaurantId!),
    enabled: !!restaurantId,
  });

  // 4. Formulário de Credenciais (Mercado Pago)
  const credentialsForm = useForm<CredentialsFormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: {
      mercado_pago_public_key: '',
      mercado_pago_access_token: '',
    },
    mode: 'onBlur',
  });

  // Sincroniza dados de settings com o formulário de credenciais
  useEffect(() => {
    if (settings) {
      credentialsForm.reset({
        mercado_pago_public_key: settings.mercado_pago_public_key || '',
        mercado_pago_access_token: '', // Sempre limpa o token por segurança
      });
    }
  }, [settings, credentialsForm]);


  const credentialsMutation = useMutation({
    mutationFn: async (data: CredentialsFormValues) => {
      if (!restaurantId) throw new Error('ID do restaurante não disponível.');
      
      // Chamada ao Edge Function para salvar a chave pública e verificar o token
      const response = await supabase.functions.invoke('save-mp-credentials', {
        body: JSON.stringify({
          restaurant_id: restaurantId,
          public_key: data.mercado_pago_public_key,
          access_token: data.mercado_pago_access_token,
        }),
      });

      if (response.error) throw new Error(response.error.message);
      
      const result = response.data as { message: string, token_verified: boolean };
      
      if (!result.token_verified) {
        toast.warning("Chave pública salva, mas o Access Token fornecido não corresponde ao segredo configurado. Verifique o token.");
      }
      
      return result;
    },
    onSuccess: () => {
      toast.success('Credenciais do Mercado Pago salvas com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] });
      credentialsForm.reset({ mercado_pago_access_token: '' }); // Limpa o campo do token
    },
    onError: (err) => {
      // Captura o erro lançado pela mutationFn, que pode ser 'ID do restaurante não disponível.'
      toast.error(`Erro ao salvar credenciais: ${err.message}`);
    },
  });

  const handleCredentialsSubmit = (data: CredentialsFormValues) => {
    credentialsMutation.mutate(data);
  };

  // 5. Formulário de Métodos de Pagamento
  
  // Função para garantir que os métodos padrão existam no banco de dados
  const ensureDefaultMethods = useMutation({
    mutationFn: async (restaurantId: string) => {
      const existingMethods = await fetchPaymentMethods(restaurantId);
      const existingNames = new Set(existingMethods.map(m => m.name));
      
      const methodsToInsert: TablesInsert<'payment_methods'>[] = DEFAULT_METHODS
        .filter(defaultMethod => !existingNames.has(defaultMethod.name))
        .map(defaultMethod => ({
          restaurant_id: restaurantId,
          name: defaultMethod.name,
          description: defaultMethod.description,
          icon: defaultMethod.icon.displayName, // Usamos o nome do ícone como string
          is_active: true,
        }));

      if (methodsToInsert.length > 0) {
        const { error } = await supabase.from('payment_methods').insert(methodsToInsert);
        if (error) throw new Error(error.message);
        await refetchMethods(); // Refetch para atualizar a lista
      }
    },
    onError: (err) => {
      console.error("Erro ao garantir métodos padrão:", err);
    }
  });

  useEffect(() => {
    if (restaurantId && methods && methods.length === 0 && !isLoadingMethods) {
      ensureDefaultMethods.mutate(restaurantId);
    }
  }, [restaurantId, methods, isLoadingMethods, ensureDefaultMethods]);


  const methodsForm = useForm<MethodsFormValues>({
    resolver: zodResolver(methodsSchema),
    defaultValues: { methods: [] },
    mode: 'onBlur',
  });

  // Sincroniza dados de methods com o formulário de métodos
  useEffect(() => {
    if (methods && methods.length > 0) {
      methodsForm.reset({
        methods: methods.map(m => ({ id: m.id, is_active: m.is_active ?? true })),
      });
    }
  }, [methods, methodsForm]);


  const updateMethodsMutation = useMutation({
    mutationFn: async (data: MethodsFormValues) => {
      const updates = data.methods.map(method => 
        supabase.from('payment_methods')
          .update({ is_active: method.is_active })
          .eq('id', method.id)
      );
      
      const results = await Promise.all(updates);
      
      const errors = results.filter(r => r.error).map(r => r.error?.message).join(', ');
      if (errors) throw new Error(errors);
    },
    onSuccess: () => {
      toast.success('Configurações de métodos de pagamento salvas!');
      queryClient.invalidateQueries({ queryKey: ['paymentMethods'] });
    },
    onError: (err) => {
      toast.error(`Erro ao salvar métodos: ${err.message}`);
    },
  });

  const handleMethodsSubmit = (data: MethodsFormValues) => {
    updateMethodsMutation.mutate(data);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (!user || isLoadingRestaurantId) {
    return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }
  
  if (!restaurantId) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Card className="max-w-md text-center">
          <CardHeader>
            <CardTitle>Restaurante Não Encontrado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Não foi possível carregar o ID do restaurante. Por favor, verifique se o seu restaurante está configurado corretamente na página de Configurações.
            </p>
            <Link to="/settings">
              <Button className="mt-4">Ir para Configurações</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDataLoading = isLoadingSettings || isLoadingMethods;

  return (
    <div className="flex min-h-screen bg-muted/40">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="border-b bg-background sticky top-0 z-40">
          <div className="container max-w-none mx-auto px-8 h-16 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <CreditCard className="h-6 w-6" />
              <h1 className="text-xl font-semibold">Pagamentos</h1>
            </div>
            <Button variant="outline" onClick={handleSignOut}>
              Sair
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-8">
          <div className="max-w-3xl mx-auto space-y-8">
            
            {/* Credenciais Mercado Pago */}
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="h-6 w-6 text-primary" />
                    Credenciais Mercado Pago
                  </div>
                  <a 
                    href="https://www.mercadopago.com.br/developers/panel/credentials" 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      Pegue sua credencial do mercado pago aqui! <ExternalLink className="h-4 w-4 ml-2" />
                    </Button>
                  </a>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Configure suas chaves de API do Mercado Pago
                </p>
              </CardHeader>
              <CardContent>
                {isDataLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-12 w-full mt-4" />
                  </div>
                ) : (
                  <Form {...credentialsForm}>
                    <form onSubmit={credentialsForm.handleSubmit(handleCredentialsSubmit)} className="space-y-4">
                      
                      {/* Public Key */}
                      <FormField
                        control={credentialsForm.control}
                        name="mercado_pago_public_key"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Public Key</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" 
                                className="h-12"
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">Chave pública para identificação da aplicação</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Access Token */}
                      <FormField
                        control={credentialsForm.control}
                        name="mercado_pago_access_token"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Access Token</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="password"
                                placeholder="TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" 
                                className="h-12"
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">Token de acesso para processar pagamentos (mantido em segredo)</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button 
                        type="submit" 
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-lg mt-6"
                        disabled={credentialsMutation.isPending}
                      >
                        {credentialsMutation.isPending ? 'Salvando...' : 'Salvar Credenciais'}
                      </Button>
                    </form>
                  </Form>
                )}
              </CardContent>
            </Card>

            {/* Métodos de Pagamento */}
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold">Métodos de Pagamento</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Configure os métodos de pagamento aceitos pelo seu estabelecimento
                </p>
              </CardHeader>
              <CardContent>
                {isDataLoading || ensureDefaultMethods.isPending ? (
                  <div className="space-y-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between py-4 border-b last:border-b-0">
                        <div className="flex items-center gap-4">
                          <Skeleton className="h-10 w-10 rounded-md" />
                          <div>
                            <Skeleton className="h-4 w-32 mb-1" />
                            <Skeleton className="h-3 w-48" />
                          </div>
                        </div>
                        <Skeleton className="h-6 w-10 rounded-full" />
                      </div>
                    ))}
                    <Skeleton className="h-12 w-full mt-4" />
                  </div>
                ) : (
                  <Form {...methodsForm}>
                    <form onSubmit={methodsForm.handleSubmit(handleMethodsSubmit)} className="space-y-4">
                      {methodsForm.watch('methods').map((method, index) => {
                        const dbMethod = methods?.find(m => m.id === method.id);
                        const Icon = dbMethod?.icon ? getIconComponent(dbMethod.icon) : Store;
                        
                        return (
                          <PaymentMethodItem
                            key={method.id}
                            method={dbMethod!}
                            index={index}
                            control={methodsForm.control}
                            icon={Icon}
                          />
                        );
                      })}
                      
                      <Button 
                        type="submit" 
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-lg mt-6"
                        disabled={updateMethodsMutation.isPending}
                      >
                        {updateMethodsMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
                      </Button>
                    </form>
                  </Form>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Payments;