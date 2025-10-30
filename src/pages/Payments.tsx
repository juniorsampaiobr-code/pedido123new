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
import { Key, ExternalLink, DollarSign, Smartphone, Package, Store, CreditCard } from 'lucide-react';
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

type PaymentMethod = Tables<'payment_methods'>;
type PaymentSettings = Tables<'payment_settings'>;

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
  return data;
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

  const { data: restaurantId, isLoading: isLoadingRestaurantId } = useQuery<string>({
    queryKey: ['restaurantId'],
    queryFn: fetchRestaurantId,
  });

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

  const credentialsForm = useForm<CredentialsFormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: {
      mercado_pago_public_key: '',
      mercado_pago_access_token: '',
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (settings) {
      // Resetar o formulário com os dados mais recentes do banco de dados
      credentialsForm.reset({
        mercado_pago_public_key: settings.mercado_pago_public_key || '',
        mercado_pago_access_token: '', // Sempre limpa o token de acesso por segurança
      });
    }
  }, [settings, credentialsForm]);

  const credentialsMutation = useMutation({
    mutationFn: async (data: CredentialsFormValues) => {
      if (!restaurantId) throw new Error('ID do restaurante não disponível.');
      
      console.log('Invoking save-mp-credentials with data:', data);

      const response = await supabase.functions.invoke('save-mp-credentials', {
        body: JSON.stringify({
          restaurant_id: restaurantId,
          public_key: data.mercado_pago_public_key,
          access_token: data.mercado_pago_access_token,
        }),
      });

      console.log('Response from save-mp-credentials:', response);

      if (response.error) throw new Error(response.error.message);
      
      const result = response.data as { message: string, token_verified: boolean };
      
      if (!result.token_verified) {
        toast.warning("Chave pública salva, mas o Access Token fornecido não corresponde ao segredo configurado. Verifique o token.");
      }
      
      return result;
    },
    onSuccess: () => {
      toast.success('Credenciais do Mercado Pago salvas com sucesso!');
      // Força a revalidação da query para buscar os novos settings e atualizar o formulário
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] });
      // O reset do formulário agora é tratado pelo useEffect que observa 'settings'
    },
    onError: (err) => {
      toast.error(`Erro ao salvar credenciais: ${err.message}`);
    },
  });

  const handleCredentialsSubmit = (data: CredentialsFormValues) => {
    credentialsMutation.mutate(data);
  };

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
    if (restaurantId && methods && methods.length === 0 && !isLoadingMethods) {
      ensureDefaultMethods.mutate(restaurantId);
    }
  }, [restaurantId, methods, isLoadingMethods, ensureDefaultMethods]);

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
      queryClient.invalidateQueries({ queryKey: ['paymentMethods'] });
    },
    onError: (err) => {
      toast.error(`Erro ao salvar métodos: ${err.message}`);
    },
  });

  const handleMethodsSubmit = (data: MethodsFormValues) => {
    updateMethodsMutation.mutate(data);
  };

  if (isLoadingRestaurantId) {
    return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }
  
  if (!restaurantId) {
    return (
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        <Card className="max-w-md text-center mx-auto">
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
      </main>
    );
  }

  const isDataLoading = isLoadingSettings || isLoadingMethods;

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
                  <FormField
                    control={credentialsForm.control}
                    name="mercado_pago_public_key"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Public Key</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" 
                            className="h-12"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Chave pública para identificação da aplicação</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                            placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" 
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
  );
};

export default Payments;