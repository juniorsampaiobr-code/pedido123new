import { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/hooks/use-cart';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, MapPin, Truck, Store, CreditCard, ArrowLeft, DollarSign, Smartphone, Package } from 'lucide-react';
import { Tables, TablesInsert, Enums } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { PhoneInput } from '@/components/PhoneInput';
import { ZipCodeInput } from '@/components/ZipCodeInput'; // Importando o novo componente

type Customer = Tables<'customers'>;
type PaymentMethod = Tables<'payment_methods'>;
type DeliveryZone = Tables<'delivery_zones'>;

// Helper function to clean phone number
const cleanPhoneNumber = (phone: string) => phone.replace(/\D/g, '');
// Helper function to clean zip code
const cleanZipCode = (zipCode: string) => zipCode.replace(/\D/g, '');

// --- Schemas ---

const checkoutSchema = z.object({
  // Customer Details
  name: z.string().min(1, 'Nome é obrigatório.'),
  phone: z.string().min(1, 'Telefone é obrigatório.').transform(cleanPhoneNumber).refine(val => val.length >= 10, {
    message: 'O telefone deve ter pelo menos 10 dígitos (incluindo DDD).',
  }),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  
  // Delivery/Pickup
  delivery_option: z.enum(['delivery', 'pickup'], {
    required_error: 'Selecione uma opção de entrega.',
  }),
  
  // Delivery Address (Required if delivery_option is 'delivery')
  street: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  zip_code: z.string().optional().transform(cleanZipCode).refine(val => val.length === 8 || val.length === 0, {
    message: 'CEP inválido. Deve conter 8 dígitos.',
  }),
  
  // Payment
  payment_method_id: z.string().min(1, 'Selecione uma forma de pagamento.'),
  notes: z.string().optional(),
  
  // Change for cash payment
  change_for: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number().optional().nullable(),
  ),
}).superRefine((data, ctx) => {
  // Delivery address validation
  if (data.delivery_option === 'delivery') {
    if (!data.street || data.street.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Rua é obrigatória.', path: ['street'] });
    }
    if (!data.number || data.number.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Número é obrigatório.', path: ['number'] });
    }
    if (!data.neighborhood || data.neighborhood.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Bairro é obrigatório.', path: ['neighborhood'] });
    }
    if (!data.city || data.city.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cidade é obrigatória.', path: ['city'] });
    }
    if (!data.zip_code || data.zip_code.length !== 8) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'CEP é obrigatório e deve ter 8 dígitos.', path: ['zip_code'] });
    }
  }
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

// --- Data Fetching ---

const fetchInitialData = async () => {
  const { data: restaurantData, error: restaurantError } = await supabase
    .from('restaurants')
    .select('id, name, address, phone, email, street, number, neighborhood, city, zip_code, latitude, longitude')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (restaurantError) throw new Error(`Erro ao buscar restaurante: ${restaurantError.message}`);
  if (!restaurantData) throw new Error('Nenhum restaurante ativo encontrado.');

  const restaurantId = restaurantData.id;

  const [methodsResult, zonesResult] = await Promise.all([
    supabase
      .from('payment_methods')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('delivery_zones')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('minimum_order', { ascending: true }), // minimum_order holds max_distance_km
  ]);

  if (methodsResult.error) throw new Error(`Erro ao buscar métodos de pagamento: ${methodsResult.error.message}`);
  if (zonesResult.error) throw new Error(`Erro ao buscar zonas de entrega: ${zonesResult.error.message}`);

  return {
    restaurant: restaurantData,
    paymentMethods: methodsResult.data as PaymentMethod[],
    deliveryZones: zonesResult.data as DeliveryZone[],
  };
};

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

const OrderSummary = ({ subtotal, deliveryFee, total, items }: ReturnType<typeof useCart>) => (
  <Card className="sticky top-4">
    <CardHeader>
      <CardTitle className="text-xl">Seu Pedido</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
        {items.map(item => (
          <div key={item.id} className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {item.quantity}x {item.name}
              {item.notes && <span className="block text-xs italic">({item.notes})</span>}
            </span>
            <span className="font-medium">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price * item.quantity)}
            </span>
          </div>
        ))}
      </div>
      
      <Separator />
      
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span className="font-medium">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Taxa de Entrega:</span>
          <span className="font-medium text-primary">
            {deliveryFee > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deliveryFee) : 'Grátis'}
          </span>
        </div>
      </div>
      
      <Separator />
      
      <div className="flex justify-between text-lg font-bold">
        <span>Total:</span>
        <span className="text-primary">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}
        </span>
      </div>
    </CardContent>
  </Card>
);

// --- Main Component ---

const Checkout = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cart = useCart();
  const { items, subtotal, deliveryFee, total, setDeliveryFee, clearCart } = cart;

  // Redirect if cart is empty
  useEffect(() => {
    if (items.length === 0) {
      navigate('/menu');
      toast.info('Seu carrinho está vazio. Adicione itens para continuar.');
    }
  }, [items, navigate]);

  // Fetch initial data (Restaurant, Methods, Zones)
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['checkoutInitialData'],
    queryFn: fetchInitialData,
    enabled: items.length > 0,
  });

  const restaurantId = data?.restaurant?.id;
  const paymentMethods = data?.paymentMethods || [];
  const deliveryZones = data?.deliveryZones || [];

  // --- Form Setup ---
  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      delivery_option: 'delivery',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      zip_code: '',
      payment_method_id: '',
      notes: '',
      change_for: null,
    },
    mode: 'onBlur',
  });

  const deliveryOption = form.watch('delivery_option');
  const selectedPaymentMethodId = form.watch('payment_method_id');
  const selectedPaymentMethod = paymentMethods.find(m => m.id === selectedPaymentMethodId);
  const isCashPayment = selectedPaymentMethod?.name === 'Dinheiro';

  // Pre-select first payment method if available
  useEffect(() => {
    if (paymentMethods.length > 0 && !selectedPaymentMethodId) {
      form.setValue('payment_method_id', paymentMethods[0].id);
    }
  }, [paymentMethods, selectedPaymentMethodId, form]);

  // --- Delivery Fee Calculation (Mock based on fixed fee for now) ---
  useEffect(() => {
    // NOTE: For a real app, this would involve geolocation/distance calculation.
    // Since we don't have that, we'll use a fixed fee or the lowest zone fee if delivery is selected.
    if (deliveryOption === 'delivery') {
      // Use the lowest delivery fee from the zones as a placeholder
      const lowestFee = deliveryZones.length > 0 ? deliveryZones[0].delivery_fee : 5.00;
      setDeliveryFee(lowestFee);
    } else {
      setDeliveryFee(0);
    }
  }, [deliveryOption, deliveryZones, setDeliveryFee]);

  // --- Order Submission Mutation ---
  const orderMutation = useMutation({
    mutationFn: async (formData: CheckoutFormValues) => {
      if (!restaurantId) throw new Error('Dados do restaurante indisponíveis.');

      // 1. Find or Create Customer
      let customerId: string;
      const cleanedPhone = cleanPhoneNumber(formData.phone);
      
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', cleanedPhone)
        .limit(1)
        .single();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const customerInsert: TablesInsert<'customers'> = {
          name: formData.name,
          phone: cleanedPhone, // Save cleaned phone number
          email: formData.email || null,
          address: formData.delivery_option === 'delivery' 
            ? `${formData.street}, ${formData.number}, ${formData.neighborhood}, ${formData.city} - ${formData.zip_code}`
            : null,
        };
        const { data: newCustomer, error: customerError } = await supabase
          .from('customers')
          .insert(customerInsert)
          .select('id')
          .single();
        
        if (customerError) throw new Error(`Erro ao criar cliente: ${customerError.message}`);
        customerId = newCustomer.id;
      }

      // 2. Create Order
      const orderInsert: TablesInsert<'orders'> = {
        restaurant_id: restaurantId,
        customer_id: customerId,
        status: 'pending' as Enums<'order_status'>,
        total_amount: total,
        delivery_fee: deliveryFee,
        notes: formData.notes,
        delivery_address: formData.delivery_option === 'delivery' 
          ? `${formData.street}, ${formData.number}, ${formData.neighborhood}, ${formData.city} - ${formData.zip_code}`
          : 'Retirada no Local',
      };

      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert(orderInsert)
        .select('id')
        .single();

      if (orderError) throw new Error(`Erro ao criar pedido: ${orderError.message}`);
      const orderId = newOrder.id;

      // 3. Create Order Items
      const itemsInsert: TablesInsert<'order_items'>[] = items.map(item => ({
        order_id: orderId,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.price,
        subtotal: item.price * item.quantity,
        notes: item.notes,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(itemsInsert);

      if (itemsError) throw new Error(`Erro ao adicionar itens do pedido: ${itemsError.message}`);
      
      return orderId;
    },
    onSuccess: (orderId) => {
      toast.success(`Pedido #${orderId.slice(-4)} realizado com sucesso!`);
      clearCart();
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigate(`/order-success/${orderId}`); // Navegar para uma tela de sucesso
    },
    onError: (err) => {
      toast.error(`Erro ao finalizar pedido: ${err.message}`);
    },
  });

  const onSubmit = (data: CheckoutFormValues) => {
    orderMutation.mutate(data);
  };
  
  const onValidationFail = (errors: any) => {
    // Verifica se há erros de validação e exibe um toast genérico
    if (Object.keys(errors).length > 0) {
      toast.error('Por favor, preencha todos os campos obrigatórios e corrija os erros.');
      console.error("Validation Errors:", errors);
    }
  };

  if (items.length === 0) {
    return null; // Wait for redirect
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 max-w-6xl">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="lg:col-span-1"><Skeleton className="h-96 w-full sticky top-4" /></div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto p-4 max-w-6xl">
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Erro de Conexão</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Não foi possível carregar os dados necessários para o checkout."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 max-w-6xl flex items-center">
          <Link to="/menu">
            <Button variant="ghost" size="icon" className="mr-4">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Finalizar Pedido</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* Left Column: Form */}
          <div className="lg:col-span-2 space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit, onValidationFail)} className="space-y-6">
                
                {/* 1. Detalhes do Cliente */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">1. Seus Dados</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome Completo *</FormLabel>
                          <Input placeholder="Seu nome" {...field} />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Telefone *</FormLabel>
                            <PhoneInput {...field} />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email (Opcional)</FormLabel>
                            <Input placeholder="seu@email.com" {...field} />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* 2. Opção de Entrega */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">2. Entrega</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="delivery_option"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              className="flex flex-col space-y-1"
                            >
                              <FormItem className="flex items-center space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer">
                                <FormControl>
                                  <RadioGroupItem value="delivery" />
                                </FormControl>
                                <Truck className="h-5 w-5 text-primary" />
                                <FormLabel className="font-normal flex-1 cursor-pointer">
                                  Delivery (Entrega em domicílio)
                                </FormLabel>
                              </FormItem>
                              <FormItem className="flex items-center space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer">
                                <FormControl>
                                  <RadioGroupItem value="pickup" />
                                </FormControl>
                                <Store className="h-5 w-5 text-primary" />
                                <FormLabel className="font-normal flex-1 cursor-pointer">
                                  Retirada no Local
                                </FormLabel>
                              </FormItem>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {deliveryOption === 'delivery' && (
                      <div className="space-y-4 pt-4 border-t">
                        <h3 className="font-semibold flex items-center gap-2">
                          <MapPin className="h-4 w-4" /> Endereço de Entrega *
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                          <FormField
                            control={form.control}
                            name="street"
                            render={({ field }) => (
                              <FormItem className="col-span-2">
                                <FormLabel>Rua</FormLabel>
                                <Input {...field} />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="number"
                            render={({ field }) => (
                              <FormItem className="col-span-1">
                                <FormLabel>Número</FormLabel>
                                <Input {...field} />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="neighborhood"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Bairro</FormLabel>
                                <Input {...field} />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="city"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Cidade</FormLabel>
                                <Input {...field} />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={form.control}
                          name="zip_code"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>CEP</FormLabel>
                              <ZipCodeInput {...field} />
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {deliveryFee > 0 && (
                          <Alert className="mt-4">
                            <Truck className="h-4 w-4" />
                            <AlertTitle>Taxa de Entrega Aplicada</AlertTitle>
                            <AlertDescription>
                              Taxa de entrega para esta área: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deliveryFee)}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 3. Pagamento */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">3. Pagamento</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="payment_method_id"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              className="flex flex-col space-y-2"
                            >
                              {paymentMethods.map(method => {
                                const Icon = getIconComponent(method.icon || 'Store');

                                return (
                                  <FormItem 
                                    key={method.id} 
                                    className="flex items-center space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer"
                                  >
                                    <FormControl>
                                      <RadioGroupItem value={method.id} />
                                    </FormControl>
                                    <Icon className="h-5 w-5 text-primary" />
                                    <FormLabel className="font-normal flex-1 cursor-pointer">
                                      {method.name}
                                      <span className="block text-xs text-muted-foreground">{method.description}</span>
                                    </FormLabel>
                                  </FormItem>
                                );
                              })}
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* Troco para pagamento em dinheiro */}
                    {isCashPayment && (
                      <FormField
                        control={form.control}
                        name="change_for"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Precisa de troco para quanto? (R$)</FormLabel>
                            <Input 
                              type="number" 
                              step="0.01" 
                              placeholder={new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(total)}
                              {...field} 
                              value={field.value === null || field.value === undefined ? '' : String(field.value)}
                              onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Notas do Pedido */}
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Observações do Pedido (Opcional)</FormLabel>
                          <Textarea placeholder="Ex: Tocar a campainha duas vezes..." {...field} rows={2} />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Final Button (Mobile/Bottom) */}
                <div className="lg:hidden sticky bottom-0 bg-card p-4 border-t shadow-2xl">
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-lg"
                    disabled={orderMutation.isPending}
                  >
                    {orderMutation.isPending ? 'Finalizando Pedido...' : `Finalizar Pedido - ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}`}
                  </Button>
                </div>
                
                {/* Final Button (Desktop) */}
                <div className="hidden lg:block">
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-lg"
                    disabled={orderMutation.isPending}
                  >
                    {orderMutation.isPending ? 'Finalizando Pedido...' : `Finalizar Pedido - ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}`}
                  </Button>
                </div>
              </form>
            </Form>
          </div>

          {/* Right Column: Summary */}
          <div className="lg:col-span-1 hidden lg:block">
            <OrderSummary {...cart} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Checkout;