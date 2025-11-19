import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/hooks/use-cart';
import { toast } from 'sonner'; // REINTRODUZINDO TOAST
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, MapPin, Truck, Store, CreditCard, ArrowLeft, DollarSign, Smartphone, Package, Loader2, Clock, Search, Eraser, Save, User, LogOut } from 'lucide-react';
import { Tables, TablesInsert, Enums, TablesUpdate } from '@/integrations/supabase/types';
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
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { MobileOrderSummary } from '@/components/MobileOrderSummary'; 
import { MapLocationSection } from '@/components/MapLocationSection';
import { CustomerProfileModal } from '@/components/CustomerProfileModal'; // Novo import

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
  latitude: z.preprocess(
    (val) => (typeof val === 'string' ? parseFloat(val) : val),
    z.coerce.number().optional().nullable(),
  ),
  longitude: z.preprocess(
    (val) => (typeof val === 'string' ? parseFloat(val) : val),
    z.coerce.number().optional().nullable(),
  ),
  payment_method_id: z.string().min(1, 'Selecione uma forma de pagamento.'),
  notes: z.string().optional(),
  cpf_cnpj: z.string().optional().default('').transform(cleanCpfCnpj).refine(val => val.length === 0 || val.length === 11 || val.length === 14, {
    message: 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.',
  }),
  change_for: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === '') return null;
      const cleaned = String(val).replace(',', '.');
      const num = parseFloat(cleaned);
      return isNaN(num) ? cleaned : num; // Retorna a string se não for um número válido para que z.number() falhe
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
    
    // REQUISITO CRÍTICO: Coordenadas devem estar presentes para delivery
    if (data.latitude === null || data.longitude === null) {
      ctx.addIssue({ 
        code: z.ZodIssueCode.custom, 
        message: 'A localização deve ser salva no mapa para calcular a taxa de entrega.', 
        path: ['latitude'] 
      });
    }
  } else {
    // Se for retirada, garante que os campos de endereço não causem erro de validação
    // e que as coordenadas sejam nulas.
    if (data.latitude !== null || data.longitude !== null) {
        // Limpa as coordenadas se o usuário mudar para retirada
        // Nota: Isso é tratado no useEffect, mas é bom ter uma validação de fallback.
    }
  }
  
  const isCashPayment = data.payment_method_id === 'Dinheiro'; 
  
  if (isCashPayment && data.change_for !== null && data.change_for !== undefined) {
    if (data.change_for <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'O valor do troco deve ser positivo.', path: ['change_for'] });
    }
  }

  // Nova regra: CPF/CNPJ é obrigatório para pagamento online
  const isOnlinePayment = data.payment_method_id === 'Pagamento online: Pix/Cartão';
  if (isOnlinePayment) {
    const cleanedCpfCnpj = cleanCpfCnpj(data.cpf_cnpj || '');
    if (cleanedCpfCnpj.length !== 11 && cleanedCpfCnpj.length !== 14) {
      ctx.addIssue({ 
        code: z.ZodIssueCode.custom, 
        message: 'CPF/CNPJ é obrigatório para pagamento online.', 
        path: ['cpf_cnpj'] 
      });
    }
  }
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

// Função auxiliar para obter a URL base correta, incluindo o basePath do GitHub Pages
const getCorrectClientUrl = () => {
  const origin = window.location.origin; // e.g., https://juniorsampaiobr-code.github.io
  const pathname = window.location.pathname; // e.g., /pedido123new/ ou /
  
  // Extrai o primeiro segmento do pathname, se houver
  const firstPathSegment = pathname.split('/')[1];
  
  // Se o primeiro segmento existir e não for vazio, assume que é o basePath
  if (firstPathSegment) {
      return `${origin}/${firstPathSegment}`;
  }
  
  // Caso contrário, retorna apenas a origin
  return origin;
};

const fetchRestaurantData = async (): Promise<Restaurant> => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, name, address, phone, email, street, number, neighborhood, city, zip_code, latitude, longitude, delivery_enabled')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error) throw new Error(`Erro ao buscar restaurante: ${error.message}`);
  if (!data) throw new Error('Nenhum restaurante ativo encontrado.');
  return data as Restaurant; 
};

const fetchDeliveryStatus = async (restaurantId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('delivery_enabled')
    .eq('id', restaurantId)
    .single();

  if (error) throw new Error(`Erro ao buscar status de entrega: ${error.message}`);
  return data.delivery_enabled ?? true;
};

const fetchPaymentMethods = async (restaurantId: string): Promise<PaymentMethod[]> => {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw new Error(`Erro ao buscar métodos de pagamento: ${error.message}`);
  return data as PaymentMethod[];
};

const fetchDeliveryZones = async (restaurantId: string): Promise<DeliveryZone[]> => {
  const { data, error } = await supabase
    .from('delivery_zones')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('max_distance_km', { ascending: true });

  if (error) throw new Error(`Erro ao buscar zonas de entrega: ${error.message}`);
  return data as DeliveryZone[];
};

// NOVO: Função para buscar dados do cliente logado
const fetchCustomerData = async (): Promise<Customer | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  // 1. Tenta buscar o registro do cliente na tabela 'customers'
  const { data: customerData, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (customerError && customerError.code !== 'PGRST116') { // PGRST116 = No rows found
    throw new Error(`Erro ao buscar dados do cliente: ${customerError.message}`);
  }
  
  // 2. Se o registro 'customers' existir, retorna ele
  if (customerData) {
    return customerData;
  }
  
  // 3. Se o registro 'customers' não existir (primeiro acesso após signup), 
  // cria um objeto Customer temporário usando os dados do user metadata.
  const userMetadata = user.user_metadata;
  
  // Nota: O telefone e nome completo são salvos no metadata durante o signup (ver src/pages/Auth.tsx)
  const fallbackCustomer: Customer = {
    id: user.id, // Usamos o user.id como ID temporário, embora o ID real seja gerado no insert
    user_id: user.id,
    name: userMetadata.full_name || '',
    phone: userMetadata.phone || '',
    email: user.email || '',
    address: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    latitude: null,
    longitude: null,
    cpf_cnpj: null,
  };
  
  return fallbackCustomer;
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
  const baseUrl = getCorrectClientUrl();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cart = useCart();
  const { items, subtotal, deliveryFee, total, setDeliveryFee, clearCart } = cart;
  const [searchParams] = useSearchParams();
  
  // Estados de controle de fluxo essenciais
  const [isCalculatingFee, setIsCalculatingFee] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [deliveryTime, setDeliveryTime] = useState<{ minTime: number, maxTime: number } | null>(null);
  const [geocodingError, setGeocodingError] = useState<string | null>(null);
  const isGeocodingInProgressRef = React.useRef(false);
  const [isHandlingMpReturn, setIsHandlingMpReturn] = useState(false); 
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false); // Novo estado do modal
  
  // Status de retorno do Mercado Pago na URL
  const paymentStatus = searchParams.get('status');
  const externalReference = searchParams.get('external_reference'); // Este é o orderId
  const hasMpParams = searchParams.has('collection_id') || searchParams.has('external_reference');
  
  // --- Lógica de Redirecionamento e Limpeza de URL ---
  useEffect(() => {
    if (externalReference) {
      const isPaymentCompleted = paymentStatus === 'approved' || paymentStatus === 'failure' || paymentStatus === 'pending';

      if (isPaymentCompleted) {
        // 1. Payment flow completed (success/failure/pending status received)
        // Redirect to OrderSuccess to handle final status and tracking
        navigate(`/order-success/${externalReference}?status=${paymentStatus}`, { replace: true });
        return;
      } else if (hasMpParams) {
        // 2. Payment flow cancelled/abandoned (external_reference present, but status=null)
        // Clear the URL parameters and stay on checkout
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash.split('?')[0]);
        setIsHandlingMpReturn(false); // Stop loading state, allow form to render
      }
    } else {
      setIsHandlingMpReturn(false);
    }
  }, [externalReference, paymentStatus, hasMpParams, navigate]);

  // 1. Fetch Restaurant Data (to get ID and coordinates)
  const { data: restaurant, isLoading: isLoadingRestaurant, isError: isErrorRestaurant, error: errorRestaurant } = useQuery<Restaurant>({
    queryKey: ['checkoutRestaurantData'],
    queryFn: fetchRestaurantData,
  });

  // 2. Fetch Delivery Status (separate query, easily invalidated)
  const { data: deliveryEnabled, isLoading: isLoadingDeliveryStatus } = useQuery<boolean | undefined>({
    queryKey: ['deliveryStatus', restaurant?.id],
    queryFn: () => fetchDeliveryStatus(restaurant!.id),
    enabled: !!restaurant?.id,
  });

  // 3. Fetch Payment Methods
  const { data: paymentMethods = [], isLoading: isLoadingMethods } = useQuery<PaymentMethod[]>({
    queryKey: ['checkoutPaymentMethods', restaurant?.id],
    queryFn: () => fetchPaymentMethods(restaurant!.id),
    enabled: !!restaurant?.id,
  });

  // 4. Fetch Delivery Zones
  const { data: deliveryZones = [], isLoading: isLoadingZones } = useQuery<DeliveryZone[]>({
    queryKey: ['checkoutDeliveryZones', restaurant?.id],
    queryFn: () => fetchDeliveryZones(restaurant!.id),
    enabled: !!restaurant?.id,
  });
  
  // 5. Fetch Customer Data (Novo)
  const { data: customer, isLoading: isLoadingCustomer } = useQuery<Customer | null>({
    queryKey: ['checkoutCustomerData'],
    queryFn: fetchCustomerData,
    staleTime: 0,
  });

  const isLoading = isLoadingRestaurant || isLoadingDeliveryStatus || isLoadingMethods || isLoadingZones || isLoadingCustomer;
  const isError = isErrorRestaurant;
  const error = errorRestaurant;

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      name: '', phone: '', email: '', delivery_option: 'delivery', street: '', number: '', complement: '', neighborhood: '', city: '', zip_code: '', payment_method_id: '', notes: '', cpf_cnpj: '', change_for: null, latitude: null, longitude: null,
    },
    mode: 'onBlur',
  });

  // Efeito para preencher o formulário com dados do cliente logado
  useEffect(() => {
    if (customer) {
      // Limpa o telefone de qualquer máscara para o valor do formulário
      const cleanedPhone = cleanPhoneNumber(customer.phone || '');
      
      // Carrega dados do localStorage primeiro para manter o endereço
      const savedData = localStorage.getItem('checkoutFormData');
      let localAddressData = {};
      if (savedData) {
        try {
          localAddressData = JSON.parse(savedData);
        } catch (e) {
          console.error("Failed to parse local storage data", e);
        }
      }
      
      form.reset({
        ...form.getValues(), // Mantém valores atuais (como payment_method_id)
        ...localAddressData, // Sobrescreve com endereço salvo localmente
        name: customer.name || '',
        phone: cleanedPhone,
        email: customer.email || '',
        cpf_cnpj: customer.cpf_cnpj || '',
      });
    }
  }, [customer, form]);

  const deliveryOption = form.watch('delivery_option');
  const selectedPaymentMethodId = form.watch('payment_method_id');
  const selectedPaymentMethod = paymentMethods.find(m => m.id === selectedPaymentMethodId);
  const isOnlinePayment = selectedPaymentMethod?.name === 'Pagamento online: Pix/Cartão';
  const isCashPayment = selectedPaymentMethod?.name === 'Dinheiro';
  
  const lat = form.watch('latitude');
  const lng = form.watch('longitude');
  
  // Usando useMemo para garantir que addressFields só mude se os valores internos mudarem
  const addressFields = form.watch(['street', 'number', 'neighborhood', 'city', 'zip_code']);
  
  const isDeliverySelected = deliveryOption === 'delivery';

  // Novo trigger estável: usa apenas os campos de endereço e o status de entrega
  const addressTrigger = useMemo(() => JSON.stringify({ 
    deliveryOption,
    deliveryEnabled,
    lat, // Incluindo lat/lng no trigger para recalcular a taxa quando o mapa é movido
    lng,
  }), [deliveryOption, deliveryEnabled, lat, lng]);

  const markerPosition = useMemo((): [number, number] => {
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      return [lat, lng];
    }
    if (restaurant?.latitude && restaurant?.longitude) {
      return [restaurant.latitude, restaurant.longitude];
    }
    return [-23.55052, -46.633308];
  }, [lat, lng, restaurant]);
  
  // Chave para forçar a recriação do mapa quando as coordenadas mudam após o salvamento
  const mapKey = useMemo(() => {
    // Se as coordenadas são nulas, usamos um valor padrão baseado apenas na opção de entrega
    if (lat === null || lng === null) {
      return `map-${deliveryOption}-null`;
    }
    // Se as coordenadas são válidas, usamos elas na chave
    return `map-${deliveryOption}-${lat.toFixed(6)}-${lng.toFixed(6)}`;
  }, [isDeliverySelected, deliveryOption, lat, lng]);


  const updateAddressFields = useCallback((address: any) => {
    // Normaliza os dados de endereço da geocodificação reversa
    const street = address.road || address.logradouro || '';
    const number = address.house_number || '';
    const neighborhood = address.suburb || address.bairro || '';
    const city = address.city || address.localidade || '';
    const zip_code = address.postcode || address.cep || '';
    
    form.setValue('street', street, { shouldValidate: true });
    form.setValue('number', number || '', { shouldValidate: true });
    form.setValue('complement', address.suburb || '', { shouldValidate: true });
    form.setValue('neighborhood', neighborhood, { shouldValidate: true });
    form.setValue('city', city, { shouldValidate: true });
    form.setValue('zip_code', zip_code, { shouldValidate: true });
    
  }, [form]);

  const handleMapLocationChange = useCallback(async (newLat: number, newLng: number) => {
    // 1. Atualiza as coordenadas no formulário
    form.setValue('latitude', newLat, { shouldValidate: true });
    form.setValue('longitude', newLng, { shouldValidate: true });
    
    // 2. Tenta fazer a geocodificação reversa para preencher os campos
    const reverseUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}&addressdetails=1`;
    const response = await fetch(reverseUrl);
    if (response.ok) {
      const data = await response.json();
      if (data.address) {
        updateAddressFields(data.address);
        // toast.info("Endereço preenchido a partir do mapa."); // Removido toast
      }
    }
  }, [form, updateAddressFields]);
  
  const handleClearAddress = useCallback(() => {
    form.setValue('street', '', { shouldValidate: true });
    form.setValue('number', '', { shouldValidate: true });
    form.setValue('complement', '', { shouldValidate: true });
    form.setValue('neighborhood', '', { shouldValidate: true });
    form.setValue('city', '', { shouldValidate: true });
    form.setValue('zip_code', '', { shouldValidate: true });
    form.setValue('latitude', null, { shouldValidate: true });
    form.setValue('longitude', null, { shouldValidate: true });
    setDeliveryFee(0);
    setDeliveryError(null);
    setDeliveryTime(null);
    toast.info("Endereço limpo."); // Reintroduzindo toast
    localStorage.removeItem('checkoutFormData');
  }, [form, setDeliveryFee]);

  // --- Lógica de Persistência Local ---
  const saveFormDataLocally = useCallback((data: CheckoutFormValues) => {
    try {
      const dataToSave = {
        name: data.name,
        phone: data.phone,
        email: data.email,
        delivery_option: data.delivery_option,
        street: data.street,
        number: data.number,
        complement: data.complement,
        neighborhood: data.neighborhood,
        city: data.city,
        zip_code: data.zip_code,
        latitude: data.latitude,
        longitude: data.longitude,
      };
      localStorage.setItem('checkoutFormData', JSON.stringify(dataToSave));
    } catch (e) {
      console.error("Failed to save form data to local storage", e);
    }
  }, []);

  const loadFormDataLocally = useCallback(() => {
    try {
      const savedData = localStorage.getItem('checkoutFormData');
      if (savedData) {
        const data = JSON.parse(savedData);
        // Aplica os dados salvos, mas garante que o delivery_option seja 'delivery' se for o padrão
        form.reset({
          ...form.getValues(),
          ...data,
          delivery_option: data.delivery_option || 'delivery',
        });
      }
    } catch (e) {
      console.error("Failed to load form data from local storage", e);
    }
  }, [form]);

  // Efeito para carregar dados ao montar
  useEffect(() => {
    loadFormDataLocally();
  }, [loadFormDataLocally]);

  // Efeito para salvar dados sempre que campos importantes mudam
  useEffect(() => {
    const subscription = form.watch((value) => {
      saveFormDataLocally(value as CheckoutFormValues);
    });
    return () => subscription.unsubscribe();
  }, [form, saveFormDataLocally]);
  // --- Fim da Lógica de Persistência Local ---

  const handleSaveAddress = () => {
    if (isGeocodingInProgressRef.current) {
      return;
    }
    
    setGeocodingError(null);
    isGeocodingInProgressRef.current = true;
    
    const loadingToastId = toast.loading("Buscando endereço e coordenadas...");

    Promise.resolve().then(async () => {
      try {
        const currentData = form.getValues();
        const [street, number, neighborhood, city, zipCode] = [currentData.street, currentData.number, currentData.neighborhood, currentData.city, currentData.zip_code];
        const cleanedZip = cleanZipCode(zipCode);
        const isAddressComplete = street && number && neighborhood && city && cleanedZip.length === 8;

        if (!isAddressComplete) {
          console.log("LOG: Validação de endereço incompleto falhou.");
          form.trigger(['street', 'number', 'neighborhood', 'city', 'zip_code', 'zip_code']);
          toast.error("Preencha todos os campos de endereço obrigatórios.");
          return;
        }

        console.log("LOG: Iniciando geocodificação para:", `${street}, ${number}, ${neighborhood}, ${city}, ${zipCode}`);
        const fullAddress = `${street}, ${number}, ${neighborhood}, ${city}, ${zipCode}`;
        const coords = await geocodeAddress(fullAddress);

        if (coords) {
          console.log("LOG: Geocodificação bem-sucedida. Coordenadas:", coords);
          form.setValue('latitude', coords.lat, { shouldValidate: true }); // Força validação aqui
          form.setValue('longitude', coords.lng, { shouldValidate: true }); // Força validação aqui
          saveFormDataLocally(form.getValues());
          toast.success("Endereço e mapa atualizados com sucesso!");
        } else {
          console.log("LOG: Geocodificação falhou ou retornou coordenadas inválidas.");
          setGeocodingError("Endereço não encontrado. Por favor, verifique se está correto e tente novamente.");
          form.setValue('latitude', null, { shouldValidate: true }); // Limpa coordenadas se falhar
          form.setValue('longitude', null, { shouldValidate: true });
          toast.warning("Endereço não encontrado. Ajuste manualmente no mapa ou verifique os dados.");
        }

      } catch (e: any) {
        console.error("LOG: Erro capturado durante a geocodificação:", e);
        setGeocodingError(`Erro ao buscar coordenadas: ${e.message}`);
        form.setValue('latitude', null, { shouldValidate: true });
        form.setValue('longitude', null, { shouldValidate: true });
        toast.error(`Erro na busca: ${e.message}`);
      } finally {
        isGeocodingInProgressRef.current = false;
        toast.dismiss(loadingToastId);
      }
    }).catch((e) => {
      console.error("LOG: Erro nao capturado:", e);
      isGeocodingInProgressRef.current = false;
      toast.dismiss(loadingToastId);
    });
  };

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
        // Ao mudar para retirada, limpamos as coordenadas
        form.setValue('latitude', null, { shouldValidate: true });
        form.setValue('longitude', null, { shouldValidate: true });
    }
  }, [deliveryOption, isDeliverySelected, form, setDeliveryFee, lat, lng]);

  useEffect(() => {
    if (paymentMethods.length > 0 && !selectedPaymentMethodId) {
      form.setValue('payment_method_id', paymentMethods[0].id);
    }
  }, [paymentMethods, selectedPaymentMethodId, form]);

  // Efeito para validar CPF/CNPJ imediatamente ao selecionar pagamento online
  useEffect(() => {
    if (isOnlinePayment) {
       // Força a revalidação do campo cpf_cnpj quando o método de pagamento muda para online
       form.trigger('cpf_cnpj');
    } else {
       // Limpa o erro se não for mais pagamento online
       form.clearErrors('cpf_cnpj');
    }
  }, [isOnlinePayment, form]);

  useEffect(() => {
    const calculateFee = async () => {
      // 1. Condições de saída imediata (sem taxa)
      if (deliveryOption === 'pickup' || !restaurant?.latitude || !restaurant?.longitude) {
        setDeliveryFee(0);
        setDeliveryError(null);
        setDeliveryTime(null);
        return;
      }
      
      // Se ainda estiver carregando o status, aguarda.
      if (isLoadingDeliveryStatus) {
        return;
      }

      // 2. Se deliveryEnabled for false (entrega gratuita), a taxa é zero.
      if (deliveryEnabled === false) {
        setDeliveryFee(0);
        setDeliveryError(null);
        setDeliveryTime(null);
        setIsCalculatingFee(false);
        return;
      }
      
      // --- Início do cálculo de taxa dinâmica (apenas se deliveryEnabled for true) ---

      setIsCalculatingFee(true);
      setDeliveryError(null);

      let customerCoords: [number, number] | null = null;
      
      // 3. Tenta obter coordenadas
      if (lat && lng) {
        // Se já temos lat/lng (do mapa ou de uma geocodificação anterior), usamos
        customerCoords = [lat, lng];
      } else {
        // Se não temos lat/lng, a taxa não pode ser calculada.
        setDeliveryFee(0);
        setDeliveryTime(null);
        setIsCalculatingFee(false);
        return;
      }

      // 4. Calcula a taxa se as coordenadas forem encontradas
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
      }
      setIsCalculatingFee(false);
    };

    const timeoutId = setTimeout(() => {
      calculateFee();
    }, 500); 

    return () => clearTimeout(timeoutId);
  }, [addressTrigger, restaurant, deliveryZones, form, setDeliveryFee, isDeliverySelected, lat, lng, deliveryEnabled, isLoadingDeliveryStatus]);

  const orderMutation = useMutation({
    mutationFn: async (formData: CheckoutFormValues) => {
      if (!restaurant) throw new Error('Dados do restaurante indisponíveis.');
      // Se for delivery e houver erro de área, lançamos o erro antes de tentar criar o pedido
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
      const cleanedCpfCnpj = cleanCpfCnpj(formData.cpf_cnpj || '');
      
      // --- Get current user ID ---
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id || null;
      
      // NOVO REQUISITO: Bloquear se o usuário não estiver logado
      if (!currentUserId) {
        throw new Error('Autenticação necessária. Por favor, faça login para finalizar o pedido.');
      }
      // ---------------------------
      
      // 1. Tenta encontrar cliente existente pelo user_id (já que agora exigimos login)
      const { data: existingCustomer } = await supabase.from('customers').select('id, user_id, name, cpf_cnpj').eq('user_id', currentUserId).limit(1).single();

      if (existingCustomer) {
        customerId = existingCustomer.id;
        
        // 1b. Prepara dados para atualização
        const updateData: TablesUpdate<'customers'> = { 
          name: formData.name,
          phone: cleanedPhone, // Atualiza o telefone
          email: formData.email || null, // Atualiza o email
          cpf_cnpj: cleanedCpfCnpj || null, // Atualiza o CPF/CNPJ
        };
        
        // Se o cliente existir e estiver vinculado ao usuário logado, atualizamos.
        const { error: updateError } = await supabase.from('customers').update(updateData).eq('id', customerId);
        if (updateError) {
            throw new Error(`Erro ao atualizar cliente existente: ${updateError.message}`);
        }
      } else {
        // 2. Cria novo cliente (INSERT) - Isso só deve acontecer se o trigger falhou ou o usuário é novo
        const insertData: TablesInsert<'customers'> = {
          name: formData.name, 
          phone: cleanedPhone, email: formData.email || null,
          address: deliveryAddress,
          latitude: formData.latitude, longitude: formData.longitude,
          cpf_cnpj: cleanedCpfCnpj || null, 
          user_id: currentUserId, 
        };
        
        const { data: newCustomer, error: customerError } = await supabase.from('customers').insert(insertData).select('id').single();
        if (customerError) {
            throw new Error(`Erro ao criar cliente: ${customerError.message}`);
        }
        customerId = newCustomer.id;
      }

      const orderStatus: Enums<'order_status'> = isOnlinePayment ? 'pending_payment' : 'pending';
      
      const { data: newOrder, error: orderError } = await supabase.from('orders').insert({
        restaurant_id: restaurant.id, customer_id: customerId, status: orderStatus,
        total_amount: total, delivery_fee: deliveryFee, notes: formData.notes,
        delivery_address: deliveryAddress,
        payment_method_id: formData.payment_method_id, // Salva o método de pagamento
        change_for: isCashPayment ? formData.change_for : null, // Salva o troco
      }).select('id').single();

      if (orderError) throw new Error(`Erro ao criar pedido: ${orderError.message}`);

      // 3. Insere os itens do carrinho
      const orderItems = items.map(item => {
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.price);
        const itemData: any = {
          order_id: newOrder.id,
          product_id: item.product_id,
          quantity: quantity,
          unit_price: unitPrice,
          subtotal: quantity * unitPrice,
        };
        // Apenas adicionar notes se houver valor
        if (item.notes && item.notes.trim()) {
          itemData.notes = item.notes.trim();
        }
        return itemData;
      });

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      
      if (itemsError) {
        console.error("LOG: Erro ao inserir com product_id, tentando sem product_id:", itemsError);
        const orderItemsWithoutProductId = items.map(item => {
          const quantity = Number(item.quantity);
          const unitPrice = Number(item.price);
          return {
            order_id: newOrder.id,
            // Removendo product_id para tentar contornar erro de FK se o produto foi deletado
            quantity: quantity,
            unit_price: unitPrice,
            subtotal: quantity * unitPrice,
            notes: item.notes && item.notes.trim() ? item.notes.trim() : null,
          };
        });
        const { error: itemsErrorRetry } = await supabase.from('order_items').insert(orderItemsWithoutProductId);
        if (itemsErrorRetry) throw new Error(`Erro ao adicionar itens do pedido: ${itemsErrorRetry.message}`);
      }

      return { orderId: newOrder.id, orderStatus };
    },
    onSuccess: (data) => {
      const targetPath = data.orderStatus === 'pending_payment' ? `/payment/${data.orderId}` : `/order-success/${data.orderId}`;
      
      // CRÍTICO: Limpar o formulário e o cache local antes de navegar
      form.reset();
      localStorage.removeItem('checkoutFormData');
      
      // Usando navigate com um delay maior para permitir que o DOM comece a desmontar
      setTimeout(() => {
        navigate(targetPath, { replace: true });
      }, 100); // Aumentado para 100ms
    },
    onError: (error) => {
      console.error("LOG: Erro ao processar pedido:", error);
      // Usando toast para feedback
      toast.error("Falha ao finalizar pedido.", {
        description: error.message || "Ocorreu um erro desconhecido. Verifique o console para detalhes.",
        duration: 10000,
      });
    },
  });

  const onSubmit = async (data: CheckoutFormValues) => {
    // Força a validação final antes de chamar a mutação
    const isValid = await form.trigger();
    if (!isValid) {
        // Se a validação falhar, o React Hook Form já exibe as mensagens de erro.
        onValidationFail(form.formState.errors);
        return;
    }

    // Se for delivery e houver erro de área, bloqueia a submissão
    if (data.delivery_option === 'delivery' && deliveryError) {
        toast.error("Não é possível finalizar o pedido.", {
          description: deliveryError,
        });
        return;
    }

    orderMutation.mutate(data);
  };

  const onValidationFail = (errors: any) => {
    console.error("Validation errors:", errors);
    const firstErrorField = Object.keys(errors)[0];
    if (firstErrorField) {
      toast.error("Preencha todos os campos obrigatórios.", {
        description: `Erro no campo: ${firstErrorField}.`,
      });
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair.", { description: error.message });
    } else {
      toast.success("Você saiu da sua conta.");
      // Limpa o cache do cliente e redireciona para a autenticação
      queryClient.invalidateQueries({ queryKey: ['checkoutCustomerData'] });
      navigate("/auth", { replace: true });
    }
  };

  const isSubmitting = orderMutation.isPending || isCalculatingFee;
  const isDeliveryValid = !isDeliverySelected || (!deliveryError && deliveryFee >= 0);
  
  // Verifica se as coordenadas estão salvas no modo delivery
  const isLocationSaved = !isDeliverySelected || (lat !== null && lng !== null);
  
  // O botão só é habilitado se:
  // 1. Não estiver submetendo/calculando
  // 2. A entrega for válida (sem erro de área)
  // 3. A localização estiver salva (lat/lng preenchidos) OU não for delivery
  const isSubmitButtonEnabled = !isSubmitting && isDeliveryValid && isLocationSaved;

  // Efeito para redirecionar se o carrinho estiver vazio
  useEffect(() => {
    if (items.length === 0 && !orderMutation.isPending && !isHandlingMpReturn) {
      // Adiciona um pequeno delay para garantir que o estado de renderização seja capturado
      const timer = setTimeout(() => {
        navigate("/menu", { replace: true });
      }, 100); 
      return () => clearTimeout(timer);
    }
  }, [items.length, orderMutation.isPending, isHandlingMpReturn, navigate]);

  // Removendo a div de "Redirecionando..." e confiando no useEffect acima
  if (items.length === 0 && !orderMutation.isPending && !isHandlingMpReturn) return <LoadingSpinner />;
  
  if (isLoading || isHandlingMpReturn) return <LoadingSpinner />;
  if (isError) return (
    <div className="container mx-auto p-4 max-w-6xl">
      <Alert variant="destructive">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Erro de Conexão</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Não foi possível carregar os dados."}</AlertDescription>
      </Alert>
    </div>
  );

  return (
    <>
      <CustomerProfileModal 
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        customer={customer}
      />
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4 max-w-6xl flex items-center justify-between">
            <div className="flex items-center">
              <Link to="/menu">
                <Button variant="ghost" size="icon" className="mr-4">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">Finalizar Pedido</h1>
            </div>
            {customer && (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => setIsProfileModalOpen(true)}
                  aria-label="Editar Perfil"
                >
                  <User className="h-5 w-5" />
                </Button>
                <Button 
                  variant="destructive" 
                  size="icon" 
                  onClick={handleLogout}
                  aria-label="Sair da Conta"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            )}
          </div>
        </header>
        
        {/* NOVO: Resumo do Pedido para Mobile (Expansível) */}
        <div><MobileOrderSummary /></div>

        <main className="container mx-auto px-4 py-8 max-w-6xl pb-24 lg:pb-8"> {/* Aumentando o padding bottom para o botão fixo */}
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
                                  <FormLabel className={cn("font-normal flex-1 cursor-pointer")}>
                                    Delivery
                                    {deliveryEnabled === false && <span className="block text-xs text-muted-foreground"> (Taxa de entrega desativada, entrega gratuita)</span>}
                                  </FormLabel>
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
                          <div className="flex justify-between items-center">
                            <h3 className="font-semibold flex items-center gap-2">
                              <MapPin className="h-4 w-4" /> Endereço de Entrega *
                            </h3>
                            <div className="flex gap-2">
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                onClick={(e) => { e.preventDefault(); handleSaveAddress(); }}
                                disabled={isCalculatingFee || isGeocodingInProgressRef.current}
                              >
                                <Save className="h-4 w-4 mr-2" /> {isCalculatingFee || isGeocodingInProgressRef.current ? 'Buscando...' : 'Salvar Endereço'}
                              </Button>
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                onClick={handleClearAddress}
                              >
                                <Eraser className="h-4 w-4 mr-2" /> Limpar
                              </Button>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4">
                            <FormField 
                              control={form.control} 
                              name="street" 
                              render={({ field }) => (
                                <FormItem className="col-span-2">
                                  <FormLabel>Rua *</FormLabel>
                                  <Input 
                                    {...field} 
                                  />
                                  <FormMessage />
                                </FormItem>
                              )} 
                            />
                            <FormField 
                              control={form.control} 
                              name="number" 
                              render={({ field }) => (
                                <FormItem className="col-span-1">
                                  <FormLabel>Número *</FormLabel>
                                  <Input {...field} />
                                  <FormMessage />
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
                                <FormMessage />
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
                                  <Input 
                                    {...field} 
                                  />
                                  <FormMessage />
                                </FormItem>
                              )} 
                            />
                            <FormField 
                              control={form.control} 
                              name="city" 
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Cidade *</FormLabel>
                                  <Input 
                                    {...field} 
                                  />
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
                                <FormLabel>CEP *</FormLabel>
                                <ZipCodeInput 
                                  {...field} 
                                />
                                <FormMessage />
                              </FormItem>
                            )} 
                          />
                          
                          {/* O mapa é exibido APENAS se a localização estiver salva */}
                          {isDeliverySelected && isLocationSaved && (
                            <div>
                              <MapLocationSection 
                                mapKey={mapKey} // Usando a chave mais específica
                                markerPosition={markerPosition}
                                onLocationChange={handleMapLocationChange}
                                updateAddressFields={updateAddressFields}
                                restaurant={restaurant} 
                              />
                            </div>
                          )}
                          
                          {isCalculatingFee && deliveryEnabled !== false && (
                            <Alert>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <AlertTitle>Calculando Taxa...</AlertTitle>
                              <AlertDescription>Aguarde enquanto calculamos a taxa de entrega para o seu endereço.</AlertDescription>
                            </Alert>
                          )}
                          {deliveryError && deliveryEnabled !== false && (
                            <Alert variant="destructive">
                              <Terminal className="h-4 w-4" />
                              <AlertTitle>Erro de Entrega</AlertTitle>
                              <AlertDescription>{deliveryError}</AlertDescription>
                            </Alert>
                          )}
                          {deliveryFee > 0 && !isCalculatingFee && deliveryEnabled !== false && (
                            <Alert className="mt-4">
                              <Truck className="h-4 w-4" />
                              <AlertTitle>Taxa de Entrega Aplicada</AlertTitle>
                              <AlertDescription>Taxa: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deliveryFee)}</AlertDescription>
                            </Alert>
                          )}
                          {/* Alerta de Erro de Geocodificação */}
                          {geocodingError && (
                              <Alert variant="destructive" className="mt-4">
                                  <Terminal className="h-4 w-4" />
                                  <AlertTitle>Erro ao Buscar Endereço</AlertTitle>
                                  <AlertDescription>{geocodingError}</AlertDescription>
                              </Alert>
                          )}
                          {/* Alerta de Requisito de Localização (se não estiver salvo) */}
                          {isDeliverySelected && !isLocationSaved && !geocodingError && (
                              <Alert variant="destructive">
                                  <MapPin className="h-4 w-4" />
                                  <AlertTitle>Localização Obrigatória</AlertTitle>
                                  <AlertDescription>
                                      Clique em "Salvar Endereço" para confirmar a localização no mapa e calcular a taxa de entrega.
                                  </AlertDescription>
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
                                  // Força a revalidação do CPF/CNPJ ao mudar o método de pagamento
                                  if (newMethod?.name === 'Pagamento online: Pix/Cartão') {
                                    form.trigger('cpf_cnpj');
                                  } else {
                                    form.clearErrors('cpf_cnpj');
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
                                      <div className="flex-1">
                                        <FormLabel className="font-normal cursor-pointer">{method.name}</FormLabel>
                                        {method.description && <p className="text-sm text-muted-foreground">{method.description}</p>}
                                      </div>
                                    </FormItem>
                                  );
                                })}
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} 
                      />

                      {isCashPayment && (
                        <FormField 
                          control={form.control} 
                          name="change_for" 
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Troco para (Opcional)</FormLabel>
                              <Input 
                                type="number" 
                                placeholder="Ex: 50.00" 
                                {...field} 
                                value={field.value || ''}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              />
                              <FormMessage />
                            </FormItem>
                          )} 
                        />
                      )}

                      {isOnlinePayment && (
                        <FormField 
                          control={form.control} 
                          name="cpf_cnpj" 
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>CPF/CNPJ *</FormLabel>
                              <CpfCnpjInput {...field} />
                              <FormMessage />
                            </FormItem>
                          )} 
                        />
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-xl">4. Observações</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FormField 
                        control={form.control} 
                        name="notes" 
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Observações do Pedido (Opcional)</FormLabel>
                            <Textarea placeholder="Ex: Sem cebola, sem alface..." {...field} />
                            <FormMessage />
                          </FormItem>
                        )} 
                      />
                    </CardContent>
                  </Card>

                  <div className="flex gap-4">
                    <Link to="/menu" className="flex-1">
                      <Button type="button" variant="outline" className="w-full">
                        Voltar ao Menu
                      </Button>
                    </Link>
                    <Button 
                      type="submit" 
                      className="flex-1" 
                      disabled={!isSubmitButtonEnabled}
                      size="lg"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        'Confirmar Pedido'
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
            
            <div className="hidden lg:block">
              <OrderSummary subtotal={subtotal} deliveryFee={deliveryFee} total={total} items={items} />
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default Checkout;