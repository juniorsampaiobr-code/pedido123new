import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from "sonner";
import { Key, ExternalLink, DollarSign, Smartphone, Package, Store, CreditCard, AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
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
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useOutletContext } from 'react-router-dom';
import { DashboardContextType } from '@/layouts/DashboardLayout'; // Importar o tipo do contexto

type PaymentMethod = Tables<'payment_methods'>;
type PaymentSettings = Tables<'payment_settings'>;

const credentialsSchema = z.object({
  mercado_pago_public_key: z.string().min(1, 'A Public Key é obrigatória.'),
  mercado_pago_access_token: z.string().min(1, 'O Access Token é obrigatório.'),
});

type CredentialsFormValues = z.infer<typeof credentialsSchema>;

const methodsSchema = z.object({
  methods: z.array(z.object({
    id: z.string(),
    is_active: z.boolean(),
  })),
});

type MethodsFormValues = z.infer<typeof methodsSchema>;

// Usar userRestaurantId na função fetch
const fetchPaymentSettings = async (restaurantId: string): Promise<PaymentSettings | null> => {
  const { data, error } = await supabase
    .from('payment_settings')
    .select('*')
    .eq('restaurant_id', restaurantId) // Usar restaurantId
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data;
};

// Usar userRestaurantId na função fetch
const fetchPaymentMethods = async (restaurantId: string): Promise<PaymentMethod[]> => {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('restaurant_id', restaurantId) // Usar restaurantId
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
};

// REMOVENDO checkCredentialsStatus, pois o token agora é salvo no DB

const DEFAULT_METHODS = [
  { name: 'Dinheiro', description: 'Pagamento em dinheiro na entrega', icon: DollarSign },
  { name: 'Pagamento online: Pix/Cartão', description: 'Pagamento online via Mercado Pago (Pix, Cartão de Crédito, etc.)', icon: CreditCard },
  { name: 'Pagamento com cartão na entrega', description: 'Aceita pagamento com cartão de débito ou crédito na entrega', icon: Package },
];

const getIconComponent = (iconName: string) => {
  switch (iconName) {
    case 'DollarSign': return DollarSign;
    case 'Smartphone': return Smartphone;
    case 'CreditCard': return CreditCard;
    case 'Package': return Package;
    default: return Store;
  }
};

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

const Payments = () => {
  const queryClient = useQueryClient();
  const { userRestaurantId } = useOutletContext<DashboardContextType>(); // Obter restaurantId do contexto

  // Usar userRestaurantId no queryKey e na função fetch
  const { data: settings, isLoading: isLoadingSettings } = useQuery<PaymentSettings | null>({
    queryKey: ['paymentSettings', userRestaurantId],
    queryFn: () => fetchPaymentSettings(userRestaurantId!), // Usar userRestaurantId
    enabled: !!userRestaurantId, // Só busca se userRestaurantId estiver disponível
  });

  // Usar userRestaurantId no queryKey e na função fetch
  const { data: methods, isLoading: isLoadingMethods, refetch: refetchMethods } = useQuery<PaymentMethod[]>({
    queryKey: ['paymentMethods', userRestaurantId],
    queryFn: () => fetchPaymentMethods(userRestaurantId!), // Usar userRestaurantId
    enabled: !!userRestaurantId, // Só busca se userRestaurantId estiver disponível
  });

  // REMOVENDO QUERY DE STATUS DE CREDENCIAIS

  const credentialsForm = useForm<CredentialsFormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: {
      mercado_pago_public_key: '',
      mercado_pago_access_token: '', // Não preenche mais com o token global
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (settings) {
      credentialsForm.reset({
        mercado_pago_public_key: settings.mercado_pago_public_key || '',
        // Preenche o Access Token com o valor salvo no DB
        mercado_pago_access_token: settings.mercado_pago_access_token || '', 
      });
    }
  }, [settings, credentialsForm]);

  const credentialsMutation = useMutation({
    mutationFn: async (data: CredentialsFormValues) => {
      if (!userRestaurantId) throw new Error('ID do restaurante não disponível.'); // Usar userRestaurantId
      
      // Chama a Edge Function para salvar ambas as chaves no DB
      const response = await supabase.functions.invoke('save-mp-credentials', {
        body: JSON.stringify({
          restaurant_id: userRestaurantId, // Usar userRestaurantId
          public_key: data.mercado_pago_public_key,
          access_token: data.mercado_pago_access_token,
        }),
      });

      if (response.error) throw new Error(response.error.message);
      
      return response.data as { message: string, token_verified: boolean };
    },
    onSuccess: (result) => {
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ['paymentSettings', userRestaurantId] }); // Usar userRestaurantId
      // Invalida a chave pública do frontend para forçar o recarregamento
      queryClient.invalidateQueries({ queryKey: ['mercadoPagoPublicKey'] }); 
    },
    onError: (err) => {
      toast.error(`Erro ao salvar credenciais: ${err.message}`);
    },
  });

  const handleCredentialsSubmit = (data: CredentialsFormValues) => {
    credentialsMutation.mutate(data);
  };

  const ensureDefaultMethods = useMutation({
    mutationFn: async (restaurantId: string) => { // Usar restaurantId como parâmetro
      const existingMethods = await fetchPaymentMethods(restaurantId); // Usar restaurantId
      const existingNames = new Set(existingMethods.map(m => m.name));
      
      const methodsToInsert: TablesInsert<'payment_methods'>[] = DEFAULT_METHODS
        .filter(defaultMethod => !existingNames.has(defaultMethod.name))
        .map(defaultMethod => ({
          restaurant_id: restaurantId, // Usar restaurantId
          name: defaultMethod.name,
          description: defaultMethod.description,
          icon: defaultMethod.icon.displayName,
          is_active: true,
        }));

      if (methodsToInsert.length > 0) {
        const { error } = await supabase.from('payment_methods').insert(methodsToInsert);
        if (error) throw new Error(error.message);
        await refetchMethods();
      }
    },
    onError: (err) => {
      console.error("Erro ao garantir métodos padrão:", err);
    }
  });

  useEffect(() => {
    if (userRestaurantId && methods && methods.length === 0 && !isLoadingMethods) { // Usar userRestaurantId
      ensureDefaultMethods.mutate(userRestaurantId); // Usar userRestaurantId
    }
  }, [userRestaurantId, methods, isLoadingMethods, ensureDefaultMethods]); // Usar userRestaurantId

  const methodsForm = useForm<MethodsFormValues>({
    resolver: zodResolver(methodsSchema),
    defaultValues: { methods: [] },
    mode: 'onBlur',
  });

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
      queryClient.invalidateQueries({ queryKey: ['paymentMethods', userRestaurantId] }); // Usar userRestaurantId
    },
    onError: (err) => {
      toast.error(`Erro ao salvar métodos: ${err.message}`);
    },
  });

  const handleMethodsSubmit = (data: MethodsFormValues) => {
    updateMethodsMutation.mutate(data);
  };

  // Se não tiver userRestaurantId, mostra um erro ou carregando
  if (!userRestaurantId) {
    return (
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        <Card className="max-w-md text-center mx-auto">
          <CardHeader>
            <CardTitle>Erro de Configuração</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              ID do restaurante não encontrado. Por favor, recarregue a página.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const isDataLoading = isLoadingSettings || isLoadingMethods;
  const isMpConfigured = !!settings?.mercado_pago_public_key && !!settings?.mercado_pago_access_token;

  return (
    <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="h-6 w-6 text-primary" />
                Credenciais Mercado Pago
              </div>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Configure suas chaves de API do Mercado Pago para aceitar pagamentos online.
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
                <form onSubmit={credentialsForm.handleSubmit(handleCredentialsSubmit)} className="space-y-6">
                  <Alert variant={isMpConfigured ? "default" : "destructive"}>
                    {isMpConfigured ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4" />}
                    <AlertTitle>
                      {isMpConfigured ? "Pagamento Online Configurado!" : "Ação Necessária: Credenciais Incompletas!"}
                    </AlertTitle>
                    <AlertDescription>
                      {isMpConfigured ? "As chaves pública e de acesso foram salvas. O pagamento online está ativo." : "Por favor, insira suas chaves de Public Key e Access Token de Produção do Mercado Pago para ativar o pagamento online."}
                      <ol className="list-decimal list-inside mt-2 space-y-1">
                        <li>
                          <a href="https://www.mercadopago.com.br/developers/panel/credentials" target="_blank" rel="noopener noreferrer" className="font-bold underline">
                            Obtenha suas credenciais de Produção
                          </a> no painel do Mercado Pago.
                        </li>
                      </ol>
                    </AlertDescription>
                  </Alert>

                  <FormField
                    control={credentialsForm.control}
                    name="mercado_pago_public_key"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Public Key *</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" 
                            className="h-12"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Esta chave é pública e usada no checkout do cliente.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={credentialsForm.control}
                    name="mercado_pago_access_token"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Access Token *</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="password"
                            placeholder="Cole seu Access Token aqui" 
                            className="h-12"
                          />
                        </FormControl>
                        <p className="text-xs text-destructive font-semibold">
                          AVISO DE SEGURANÇA: Este token é secreto e será salvo no banco de dados. Garanta que seu RLS esteja ativo.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-lg mt-6"
                    disabled={credentialsMutation.isPending || !userRestaurantId} // Usar userRestaurantId
                  >
                    {credentialsMutation.isPending ? 'Salvando...' : 'Salvar Credenciais'}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Métodos de Pagamento</CardTitle>
            <p className="text-sm text-muted-foreground">
              Ative ou desative os métodos de pagamento aceitos pelo seu estabelecimento.
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
                    disabled={updateMethodsMutation.isPending || !userRestaurantId} // Usar userRestaurantId
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
  );
};

export default Payments;