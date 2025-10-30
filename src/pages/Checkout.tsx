import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
import { Terminal, MapPin, Truck, Store, CreditCard, ArrowLeft, DollarSign, Smartphone, Package, Loader2, Clock, Search } from 'lucide-react';
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
import { ZipCodeInput } from '@/components/ZipCodeInput';
import { CpfCnpjInput } from '@/components/CpfCnpjInput';
import { geocodeAddress, calculateDeliveryFee } from '@/utils/location';
import { LocationPickerMap } from '@/components/LocationPickerMap';

type Customer = Tables<'customers'>;
type PaymentMethod = Tables<'payment_methods'>;
type DeliveryZone = Tables<'delivery_zones'>;
type Restaurant = Tables<'restaurants'>;

const cleanPhoneNumber = (phone: string) => phone.replace(/\D/g, '');
const cleanZipCode = (zipCode: string) => zipCode.replace(/\D/g, '');
const cleanCpfCnpj = (doc: string) => doc.replace(/\D/g, '');

const checkoutSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório.'),
  phone: z.string().min(1, 'Telefone é obrigatório.').transform(cleanPhoneNumber).refine(val => val.length >= 10, {
    message: 'O telefone deve ter pelo menos 10 dígitos (incluindo DDD).',
  }),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  delivery_option: z.enum(['delivery', 'pickup'], {
    required_error: 'Selecione uma opção de entrega.',
  }),
  street: z.string().optional().default(''),
  number: z.string().optional().default(''),
  complement: z.string().optional().default(''),
  neighborhood: z.string().optional().default(''),
  city: z.string().optional().default(''),
  zip_code: z.string().optional().default('').transform(cleanZipCode).refine(val => val.length === 8 || val.length === 0, {
    message: 'CEP inválido. Deve conter 8 dígitos.',
  }),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
  payment_method_id: z.string().min(1, 'Selecione uma forma de pagamento.'),
  notes: z.string().optional(),
  cpf_cnpj: z.string().optional().default('').transform(cleanCpfCnpj).refine(val => val.length === 0 || val.length === 11 || val.length === 14, {
    message: 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.',
  }),
  change_for: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === '') return null;
      return String(val).replace(',', '.');
    },
    z.number({ invalid_type_error: 'O troco deve ser um número.' }).optional().nullable(),
  ),
}).superRefine((data, ctx) => {
  if (data.delivery_option === 'delivery') {
    if (data.street.trim() === '') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Rua é obrigatória.', path: ['street'] });
    if (data.number.trim() === '') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Número é obrigatório.', path: ['number'] });
    if (data.neighborhood.trim() === '') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Bairro é obrigatório.', path: ['neighborhood'] });
    if (data.city.trim() === '') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cidade é obrigatória.', path: ['city'] });
    if (data.zip_code.length !== 8) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'CEP é obrigatório e deve ter 8 dígitos.', path: ['zip_code'] });
  }
  
  const isCashPayment = data.payment_method_id === 'Dinheiro'; 
  
  if (isCashPayment && data.change_for !== null && data.change_for !== undefined) {
    if (data.change_for <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'O valor do troco deve ser positivo.', path: ['change_for'] });
    }
  }
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

const fetchDeliveryStatus = async (restaurantId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('delivery_enabled')
    .eq('id', restaurantId)
    .single();

  if (error) throw new Error(`Erro ao buscar status de entrega: ${error.message}`);
  return data.delivery_enabled ?? true;
};

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
  const deliveryEnabled = await fetchDeliveryStatus(restaurantId);

  const [methodsResult, zonesResult] = await Promise.all([
    supabase.from('payment_methods').select('*').eq('restaurant_id', restaurantId).eq('is_active', true).order('name', { ascending: true }),
    supabase.from('delivery_zones').select('*').eq('restaurant_id', restaurantId).eq('is_active', true).order('max_distance_km', { ascending: true }),
  ]);

  if (methodsResult.error) throw new Error(`Erro ao buscar métodos de pagamento: ${methodsResult.error.message}`);
  if (zonesResult.error) throw new Error(`Erro ao buscar zonas de entrega: ${zonesResult.error.message}`);

  const filteredMethods = methodsResult.data.filter(method => method.name !== 'Pagamento Online');

  return {
    restaurant: restaurantData,
    paymentMethods: filteredMethods as PaymentMethod[],
    deliveryZones: zonesResult.data as DeliveryZone[],
    deliveryEnabled,
  };
};

const getIconComponent = (iconName: string) => {
  switch (iconName) {
    case 'DollarSign': return DollarSign;
    case 'Smartphone': return Smartphone;
    case 'CreditCard': return CreditCard;
    case 'Package': return Package;
    default: return Store;
  }
};

const OrderSummary = ({ subtotal, deliveryFee, total, items }: ReturnType<typeof useCart>) => (
  <Card className="sticky top-4">
    <CardHeader><CardTitle className="text-xl">Seu Pedido</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
        {items.map(item => (
          <div key={item.id} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{item.quantity}x {item.name}{item.notes && <span className="block text-xs italic">({item.notes})</span>}</span>
            <span className="font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price * item.quantity)}</span>
          </div>
        ))}
      </div>
      <Separator />
      <div className="space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal:</span><span className="font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}</span></div>
        <div className="flex justify-between"><span>Taxa de Entrega:</span><span className="font-medium text-primary">{deliveryFee > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deliveryFee) : 'Grátis'}</span></div>
      </div>
      <Separator />
      <div className="flex justify-between text-lg font-bold"><span>Total:</span><span className="text-primary">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}</span></div>
    </CardContent>
  </Card>
);

const Checkout = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cart = useCart();
  const { items, subtotal, deliveryFee, total, setDeliveryFee, clearCart } = cart;
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isCalculatingFee, setIsCalculatingFee] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [deliveryTime, setDeliveryTime] = useState<{ minTime: number, maxTime: number } | null>(null);
  const [searchCep, setSearchCep] = useState('');
  const [searchNumber, setSearchNumber] = useState('');
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [addressInputMode, setAddressInputMode] = useState<'search' | 'manual'>('search');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['checkoutInitialData'],
    queryFn: fetchInitialData,
  });

  const restaurant = data?.restaurant;
  const paymentMethods = data?.paymentMethods || [];
  const deliveryZones = data?.deliveryZones || [];
  const deliveryEnabled = data?.deliveryEnabled ?? true;

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      name: '', phone: '', email: '', delivery_option: 'delivery', street: '', number: '', complement: '', neighborhood: '', city: '', zip_code: '', payment_method_id: '', notes: '', cpf_cnpj: '', change_for: null, latitude: null, longitude: null,
    },
    mode: 'onBlur',
  });

  const deliveryOption = form.watch('delivery_option');
  const selectedPaymentMethodId = form.watch('payment_method_id');
  const selectedPaymentMethod = paymentMethods.find(m => m.id === selectedPaymentMethodId);
  const isOnlinePayment = selectedPaymentMethod?.name === 'Pagamento online: Pix/Cartão';
  const isCashPayment = selectedPaymentMethod?.name === 'Dinheiro';
  
  const lat = form.watch('latitude');
  const lng = form.watch('longitude');
  const addressFields = form.watch(['street', 'number', 'complement', 'neighborhood', 'city', 'zip_code']);
  
  const isDeliverySelected = deliveryOption === 'delivery';

  const addressTrigger = JSON.stringify({ 
    mode: addressInputMode, 
    fields: addressFields, 
    lat, 
    lng, 
    deliveryOption 
  });

  const markerPosition = useMemo((): [number, number] => {
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      return [lat, lng];
    }
    if (restaurant?.latitude && restaurant?.longitude) {
      return [restaurant.latitude, restaurant.longitude];
    }
    return [-23.55052, -46.633308];
  }, [lat, lng, restaurant]);

  const updateAddressFields = useCallback((address: any) => {
    form.setValue('street', address.road || address.logradouro || '', { shouldValidate: true });
    form.setValue('number', address.house_number || searchNumber || '', { shouldValidate: true });
    form.setValue('complement', address.suburb || '', { shouldValidate: true });
    form.setValue('neighborhood', address.suburb || address.bairro || '', { shouldValidate: true });
    form.setValue('city', address.city || address.localidade || '', { shouldValidate: true });
    form.setValue('zip_code', address.postcode || address.cep || '', { shouldValidate: true });
  }, [form, searchNumber]);

  const handleAddressSearch = async () => {
    const cleanedCep = searchCep.replace(/\D/g, '');
    if (cleanedCep.length !== 8) {
      toast.warning("Por favor, digite um CEP válido.");
      return;
    }
    setIsSearchingCep(true);
    const loadingToast = toast.loading("Buscando endereço...");

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanedCep}/json/`);
      if (!response.ok) throw new Error("Falha na busca do CEP.");
      
      const data = await response.json();
      if (data.erro) {
        toast.error("CEP não encontrado.");
        return;
      }

      form.setValue('street', data.logradouro, { shouldValidate: true });
      form.setValue('number', searchNumber, { shouldValidate: true });
      form.setValue('complement', '', { shouldValidate: true });
      form.setValue('neighborhood', data.bairro, { shouldValidate: true });
      form.setValue('city', data.localidade, { shouldValidate: true });
      form.setValue('zip_code', data.cep, { shouldValidate: true });

      const fullAddressForGeocode = `${data.logradouro}, ${searchNumber || '1'}, ${data.localidade}, ${data.uf}`;
      const coords = await geocodeAddress(fullAddressForGeocode);
      
      if (coords) {
        form.setValue('latitude', coords[0], { shouldValidate: true });
        form.setValue('longitude', coords[1], { shouldValidate: true });
        setShowMap(true);
        toast.success("Endereço encontrado e mapa atualizado!");
      } else {
        form.setValue('latitude', null, { shouldValidate: true });
        form.setValue('longitude', null, { shouldValidate: true });
        toast.warning("Endereço encontrado, mas não foi possível obter as coordenadas. Ajuste o pino no mapa manualmente.");
      }

    } catch (err: any) {
      toast.error(`Erro na busca: ${err.message}`);
    } finally {
      setIsSearchingCep(false);
      toast.dismiss(loadingToast);
    }
  };

  const handleMapLocationChange = useCallback(async (newLat: number, newLng: number) => {
    form.setValue('latitude', newLat, { shouldValidate: true });
    form.setValue('longitude', newLng, { shouldValidate: true });

    const loadingToast = toast.loading("Atualizando endereço...");
    try {
      const reverseUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}&addressdetails=1`;
      const response = await fetch(reverseUrl);
      if (!response.ok) throw new Error("Falha ao obter detalhes do endereço.");

      const data = await response.json();
      if (data.address) {
        updateAddressFields(data.address);
        toast.success("Endereço atualizado a partir do mapa.");
      }
    } catch (err: any) {
      toast.error(`Erro ao buscar endereço: ${err.message}`);
    } finally {
      toast.dismiss(loadingToast);
    }
  }, [form, updateAddressFields]);

  useEffect(() => {
    if (!isCashPayment) {
      form.setValue('change_for', null, { shouldValidate: true }); 
    }
  }, [isCashPayment, form]);

  useEffect(() => {
    if (deliveryOption === 'pickup') {
        setDeliveryFee(0);
        setDeliveryError(null);
        setDeliveryTime(null);
        form.setValue('latitude', null);
        form.setValue('longitude', null);
        setShowMap(false);
    }

    if (isDeliverySelected) {
        form.setValue('latitude', null);
        form.setValue('longitude', null);
        setShowMap(false);

        if (addressInputMode === 'manual') {
            setSearchCep('');
            setSearchNumber('');
        }
        if (addressInputMode === 'search') {
            form.setValue('street', '');
            form.setValue('number', '');
            form.setValue('complement', '');
            form.setValue('neighborhood', '');
            form.setValue('city', '');
            form.setValue('zip_code', '');
        }
    }
  }, [deliveryOption, addressInputMode, isDeliverySelected, form, setDeliveryFee]);

  useEffect(() => {
    if (paymentMethods.length > 0 && !selectedPaymentMethodId) {
      form.setValue('payment_method_id', paymentMethods[0].id);
    }
  }, [paymentMethods, selectedPaymentMethodId, form]);

  useEffect(() => {
    const calculateFee = async () => {
      if (!deliveryEnabled) {
        setDeliveryFee(0);
        setDeliveryError(null);
        setDeliveryTime(null);
        return;
      }

      if (deliveryOption === 'pickup' || !restaurant?.latitude || !restaurant?.longitude) {
        setDeliveryFee(0);
        setDeliveryError(null);
        setDeliveryTime(null);
        return;
      }

      setIsCalculatingFee(true);
      setDeliveryError(null);

      let customerCoords: [number, number] | null = null;
      
      if (lat && lng) {
        customerCoords = [lat, lng];
      } else {
        const [street, number, complement, neighborhood, city, zipCode] = addressFields;
        const cleanedZip = cleanZipCode(zipCode);
        const isAddressComplete = street && number && neighborhood && city && cleanedZip.length === 8;
        
        if (isAddressComplete) {
          const fullAddress = `${street}, ${number} ${complement}, ${neighborhood}, ${city}, ${zipCode}`;
          customerCoords = await geocodeAddress(fullAddress);
          
          if (customerCoords) {
            form.setValue('latitude', customerCoords[0]);
            form.setValue('longitude', customerCoords[1]);
            setShowMap(true);
          }
        }
      }

      if (customerCoords) {
        const restaurantCoords: [number, number] = [restaurant.latitude, restaurant.longitude];
        const feeResult = calculateDeliveryFee(customerCoords, restaurantCoords, deliveryZones);

        if (feeResult) {
          setDeliveryFee(feeResult.fee);
          setDeliveryError(null);
          setDeliveryTime({ minTime: feeResult.minTime, maxTime: feeResult.maxTime });
        } else {
          setDeliveryFee(0);
          setDeliveryError("Seu endereço está fora da nossa área de entrega.");
          setDeliveryTime(null);
        }
      } else {
        setDeliveryFee(0);
        setDeliveryTime(null);
        
        const [street, number, complement, neighborhood, city, zipCode] = addressFields;
        const isAddressAttempted = street && number && neighborhood && city && cleanZipCode(zipCode).length === 8;
        
        if (isDeliverySelected && isAddressAttempted) {
          setDeliveryError("Não foi possível localizar seu endereço para calcular a taxa. Por favor, verifique o endereço ou ajuste o pino no mapa.");
          
          if (restaurant?.latitude && restaurant?.longitude) {
            form.setValue('latitude', restaurant.latitude);
            form.setValue('longitude', restaurant.longitude);
            setShowMap(true);
          }
        } else {
          setDeliveryError(null);
        }
      }
      setIsCalculatingFee(false);
    };

    const timeoutId = setTimeout(() => {
      calculateFee();
    }, 500); 

    return () => clearTimeout(timeoutId);
  }, [addressTrigger, restaurant, deliveryZones, form, setDeliveryFee, isDeliverySelected, lat, lng, addressInputMode, addressFields, deliveryEnabled]);

  useEffect(() => {
    if (items.length === 0 && !isProcessingPayment) {
      const timer = setTimeout(() => {
        toast.info('Seu carrinho está vazio. Adicione itens para continuar.');
        navigate('/menu');
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [items.length, navigate, isProcessingPayment]);

  const orderMutation = useMutation({
    mutationFn: async (formData: CheckoutFormValues) => {
      if (!restaurant) throw new Error('Dados do restaurante indisponíveis.');
      if (formData.delivery_option === 'delivery' && deliveryError) throw new Error(deliveryError);

      const addressParts = [
        formData.street,
        formData.number,
        formData.complement ? `(${formData.complement})` : null,
        formData.neighborhood,
        formData.city,
        formData.zip_code,
      ].filter(Boolean).join(', ');

      const deliveryAddress = formData.delivery_option === 'delivery' ? addressParts : 'Retirada no Local';

      let customerId: string;
      const cleanedPhone = cleanPhoneNumber(formData.phone);
      const { data: existingCustomer } = await supabase.from('customers').select('id').eq('phone', cleanedPhone).limit(1).single();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const { data: newCustomer, error: customerError } = await supabase.from('customers').insert({
          name: formData.name, phone: cleanedPhone, email: formData.email || null,
          address: deliveryAddress,
          latitude: formData.latitude, longitude: formData.longitude,
        }).select('id').single();
        if (customerError) throw new Error(`Erro ao criar cliente: ${customerError.message}`);
        customerId = newCustomer.id;
      }

      const orderStatus = isOnlinePayment ? 'pending_payment' : 'pending';
      
      const { data: newOrder, error: orderError } = await supabase.from('orders').insert({
        restaurant_id: restaurant.id, customer_id: customerId, status: orderStatus as Enums<'order_status'>,
        total_amount: total, delivery_fee: deliveryFee, notes: formData.notes,
        delivery_address: deliveryAddress,
      }).select('id').single();

      if (orderError) throw new Error(`Erro ao criar pedido: ${orderError.message}`);
      const orderId = newOrder.id;

      const itemsInsert: TablesInsert<'order_items'>[] = items.map(item => ({
        order_id: orderId, product_id: item.product_id, quantity: item.quantity,
        unit_price: item.price, subtotal: item.price * item.quantity, notes: item.notes,
      }));
      const { error: itemsError } = await supabase.from('order_items').insert(itemsInsert);
      if (itemsError) throw new Error(`Erro ao adicionar itens do pedido: ${itemsError.message}`);

      if (isOnlinePayment) {
        setIsProcessingPayment(true);
        toast.info("Redirecionando para o pagamento online...");
        
        const clientUrl = window.location.origin; 
        
        const { data: preferenceData, error: preferenceError } = await supabase.functions.invoke('create-payment-preference', {
          body: { 
            orderId, 
            items, 
            totalAmount: parseFloat(total.toFixed(2)),
            restaurantName: restaurant.name, 
            clientUrl 
          },
        });

        if (preferenceError) throw new Error(preferenceError.message);
        if (preferenceData.error) throw new Error(preferenceData.error);
        
        window.location.href = preferenceData.init_point;
        return; 
      }

      return orderId;
    },
    onSuccess: (orderId) => {
      if (!isOnlinePayment) {
        toast.success(`Pedido #${orderId.slice(-4)} realizado com sucesso!`);
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        navigate(`/order-success/${orderId}`);
      }
    },
    onError: (err) => {
      let userMessage = "Ocorreu um erro ao finalizar seu pedido. Por favor, tente novamente.";
      const errorMessage = err.message || '';

      if (errorMessage.toLowerCase().includes('access token') || errorMessage.toLowerCase().includes('credentials')) {
        userMessage = "Ocorreu um problema com a configuração de pagamento do restaurante. Por favor, entre em contato com o estabelecimento.";
      } else if (errorMessage.toLowerCase().includes('mercado pago error')) {
        const mpError = errorMessage.split('Mercado Pago Error:')[1];
        userMessage = `Erro do processador de pagamento: ${mpError || 'Tente novamente.'}`;
      } else if (errorMessage.toLowerCase().includes('fora da nossa área de entrega')) {
        userMessage = "Seu endereço está fora da nossa área de entrega.";
      }

      toast.error("Falha ao processar", {
        description: userMessage,
      });
      setIsProcessingPayment(false);
    },
  });

  const onSubmit = (data: CheckoutFormValues) => {
    if (isCashPayment) {
      const changeFor = data.change_for;
      if (changeFor !== null && changeFor !== undefined) {
        if (changeFor < total) {
          toast.error(`O valor do troco (R$ ${changeFor.toFixed(2).replace('.', ',')}) deve ser maior ou igual ao total do pedido (R$ ${total.toFixed(2).replace('.', ',')}).`);
          return;
        }
      }
    }
    orderMutation.mutate(data);
  };
  
  const onValidationFail = (errors: any) => {
    if (Object.keys(errors).length > 0) {
      toast.error('Por favor, preencha todos os campos obrigatórios e corrija os erros.');
    }
  };

  if (items.length === 0 && !isProcessingPayment) return <div className="flex h-screen items-center justify-center">Redirecionando...</div>;
  if (isLoading) return <div className="container mx-auto p-4 max-w-6xl"><Skeleton className="h-10 w-48 mb-6" /><div className="grid lg:grid-cols-3 gap-8"><div className="lg:col-span-2 space-y-6"><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div><div className="lg:col-span-1"><Skeleton className="h-96 w-full sticky top-4" /></div></div></div>;
  if (isError) return <div className="container mx-auto p-4 max-w-6xl"><Alert variant="destructive"><Terminal className="h-4 w-4" /><AlertTitle>Erro de Conexão</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Não foi possível carregar os dados."}</AlertDescription></Alert></div>;

  const isSubmitting = orderMutation.isPending || isProcessingPayment || isCalculatingFee;
  const isDeliveryValid = !isDeliverySelected || (!deliveryError && deliveryFee >= 0);
  const isSubmitButtonEnabled = !isSubmitting && isDeliveryValid;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 max-w-6xl flex items-center">
          <Link to="/menu"><Button variant="ghost" size="icon" className="mr-4"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <h1 className="text-2xl font-bold">Finalizar Pedido</h1>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit, onValidationFail)} className="space-y-6">
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
                                <FormLabel className="font-normal flex-1 cursor-pointer">Delivery</FormLabel>
                              </FormItem>
                              <FormItem className="flex items-center space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer">
                                <FormControl>
                                  <RadioGroupItem value="pickup" />
                                </FormControl>
                                <Store className="h-5 w-5 text-primary" />
                                <FormLabel className="font-normal flex-1 cursor-pointer">Retirada no Local</FormLabel>
                              </FormItem>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} 
                    />
                    
                    {isDeliverySelected && (
                      <div className="space-y-4 pt-4 border-t">
                        <h3 className="font-semibold flex items-center gap-2">
                          <MapPin className="h-4 w-4" /> Endereço de Entrega *
                        </h3>
                        
                        <RadioGroup 
                          value={addressInputMode} 
                          onValueChange={(value) => setAddressInputMode(value as 'search' | 'manual')} 
                          className="flex gap-4"
                        >
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <RadioGroupItem value="search" id="r-search" />
                            </FormControl>
                            <Label htmlFor="r-search" className="cursor-pointer">Buscar por CEP</Label>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <RadioGroupItem value="manual" id="r-manual" />
                            </FormControl>
                            <Label htmlFor="r-manual" className="cursor-pointer">Digitar Manualmente</Label>
                          </FormItem>
                        </RadioGroup>

                        {addressInputMode === 'search' && (
                          <div className="space-y-2">
                            <Label>Buscar Endereço por CEP e Número</Label>
                            <div className="flex gap-2">
                              <ZipCodeInput 
                                placeholder="Digite o CEP" 
                                value={searchCep} 
                                onChange={(e) => setSearchCep(e.target.value)} 
                              />
                              <Input 
                                placeholder="Número" 
                                value={searchNumber} 
                                onChange={(e) => setSearchNumber(e.target.value)} 
                              />
                              <Button 
                                type="button" 
                                onClick={handleAddressSearch} 
                                disabled={isSearchingCep}
                              >
                                {isSearchingCep ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-4">
                          <FormField 
                            control={form.control} 
                            name="street" 
                            render={({ field }) => (
                              <FormItem className="col-span-2">
                                <FormLabel>Rua *</FormLabel>
                                <Input {...field} disabled={addressInputMode === 'search'} />
                              </FormItem>
                            )} 
                          />
                          <FormField 
                            control={form.control} 
                            name="number" 
                            render={({ field }) => (
                              <FormItem className="col-span-1">
                                <FormLabel>Número *</FormLabel>
                                <Input {...field} disabled={addressInputMode === 'search'} />
                              </FormItem>
                            )} 
                          />
                        </div>
                        <FormField 
                          control={form.control} 
                          name="complement" 
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Complemento (Opcional)</FormLabel>
                              <Input placeholder="Apto, Bloco, Casa, etc." {...field} disabled={false} />
                            </FormItem>
                          )} 
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <FormField 
                            control={form.control} 
                            name="neighborhood" 
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Bairro *</FormLabel>
                                <Input {...field} disabled={addressInputMode === 'search'} />
                              </FormItem>
                            )} 
                          />
                          <FormField 
                            control={form.control} 
                            name="city" 
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Cidade *</FormLabel>
                                <Input {...field} disabled={addressInputMode === 'search'} />
                              </FormItem>
                            )} 
                          />
                        </div>
                        <FormField 
                          control={form.control} 
                          name="zip_code" 
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>CEP *</FormLabel>
                              <ZipCodeInput {...field} disabled={addressInputMode === 'search'} />
                            </FormItem>
                          )} 
                        />
                        
                        {showMap && (
                          <div className="space-y-2">
                            <LocationPickerMap 
                              center={markerPosition} 
                              markerPosition={markerPosition} 
                              onLocationChange={handleMapLocationChange} 
                              isInteractive={false} 
                            />
                            {(lat !== null && lng !== null) && (
                              <div className="text-xs text-muted-foreground flex justify-between">
                                <span>Latitude: {lat?.toFixed(6)}</span>
                                <span>Longitude: {lng?.toFixed(6)}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {isCalculatingFee && (
                          <Alert>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <AlertTitle>Calculando Taxa...</AlertTitle>
                            <AlertDescription>Aguarde enquanto calculamos a taxa de entrega para o seu endereço.</AlertDescription>
                          </Alert>
                        )}
                        {deliveryError && (
                          <Alert variant="destructive">
                            <Terminal className="h-4 w-4" />
                            <AlertTitle>Erro de Entrega</AlertTitle>
                            <AlertDescription>{deliveryError}</AlertDescription>
                          </Alert>
                        )}
                        {deliveryFee > 0 && !isCalculatingFee && (
                          <Alert className="mt-4">
                            <Truck className="h-4 w-4" />
                            <AlertTitle>Taxa de Entrega Aplicada</AlertTitle>
                            <AlertDescription>Taxa: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deliveryFee)}</AlertDescription>
                          </Alert>
                        )}
                        {!deliveryEnabled && (
                          <Alert className="mt-4">
                            <Truck className="h-4 w-4" />
                            <AlertTitle>Taxas de Entrega Desativadas</AlertTitle>
                            <AlertDescription>No momento, as taxas de entrega estão desativadas. A entrega será gratuita.</AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
                
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
                              onValueChange={(value) => {
                                field.onChange(value);
                                const newMethod = paymentMethods.find(m => m.id === value);
                                if (newMethod?.name !== 'Dinheiro') {
                                  form.setValue('change_for', null, { shouldValidate: true });
                                }
                              }} 
                              defaultValue={field.value} 
                              className="flex flex-col space-y-2"
                            >
                              {paymentMethods.map(method => { 
                                const Icon = getIconComponent(method.icon || 'Store'); 
                                return (
                                  <FormItem key={method.id} className="flex items-center space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer">
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
                    
                    {(isOnlinePayment) && (
                      <div className="space-y-4 pt-4 border-t">
                        <h3 className="font-semibold flex items-center gap-2">
                          <CreditCard className="h-4 w-4" /> Detalhes Adicionais
                        </h3>
                        <FormField 
                          control={form.control} 
                          name="cpf_cnpj" 
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>CPF/CNPJ (para a nota)</FormLabel>
                              <CpfCnpjInput {...field} />
                              <FormMessage />
                            </FormItem>
                          )} 
                        />
                      </div>
                    )}
                    
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
                
                <div className="lg:hidden sticky bottom-0 bg-card p-4 border-t shadow-2xl">
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-lg" 
                    disabled={!isSubmitButtonEnabled}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...
                      </>
                    ) : (
                      `Finalizar Pedido - ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}`
                    )}
                  </Button>
                </div>
                <div className="hidden lg:block">
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-lg" 
                    disabled={!isSubmitButtonEnabled}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...
                      </>
                    ) : (
                      `Finalizar Pedido - ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}`
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
          <div className="lg:col-span-1 hidden lg:block">
            <OrderSummary {...cart} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Checkout;