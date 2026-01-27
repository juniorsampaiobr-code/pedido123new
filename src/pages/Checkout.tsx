import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, Enums, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useCart } from '@/hooks/use-cart';
import { useMercadoPagoPublicKey } from '@/hooks/use-mercado-pago-settings';
import { geocodeAddress, calculateDeliveryFee } from '@/utils/location';
import { useAuthStatus } from '@/hooks/use-auth-status';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MapPin, Phone, Mail, CreditCard, DollarSign, Truck, Loader2, User, RefreshCw, AlertCircle, LogOut, User as UserIcon, Save, CheckCircle, Terminal, ArrowLeft } from 'lucide-react';
import { ZipCodeInput } from '@/components/ZipCodeInput';
import { PhoneInput } from '@/components/PhoneInput';
import { CustomerProfileModal } from '@/components/CustomerProfileModal';
import { MercadoPagoPayment } from '@/components/MercadoPagoPayment';
import { CpfCnpjInput } from '@/components/CpfCnpjInput';
import { ClientLocationMap } from '@/components/ClientLocationMap';
import { OnlinePaymentWarningModal } from '@/components/OnlinePaymentWarningModal';
import { cn } from '@/lib/utils';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, } from '@/components/ui/form';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';

// --- Tipos ---
type Restaurant = Tables<'restaurants'>;
type Customer = Tables<'customers'> & { complement?: string | null };
type DeliveryZone = Tables<'delivery_zones'>;
type PaymentMethod = Tables<'payment_methods'>;
type CartItem = {
  product: Tables<'products'>;
  quantity: number;
  notes: string;
  subtotal: number;
};

// --- Helpers de Formatação ---
const formatPhoneNumber = (value: string) => {
  if (!value) return '';
  let cleaned = value.replace(/\D/g, '');
  
  if (cleaned.length > 11) cleaned = cleaned.slice(0, 11);
  if (cleaned.length > 0) cleaned = `(${cleaned}`;
  if (cleaned.length > 3) cleaned = `${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
  if (cleaned.length > 10) cleaned = `${cleaned.slice(0, 10)}-${cleaned.slice(10)}`;
  
  return cleaned;
};

const formatCpfCnpj = (value: string) => {
  if (!value) return '';
  let cleaned = value.replace(/\D/g, '');

  if (cleaned.length > 14) cleaned = cleaned.slice(0, 14);

  if (cleaned.length <= 11) {
    // CPF
    if (cleaned.length > 9) cleaned = `${cleaned.slice(0, 9)}-${cleaned.slice(9)}`;
    if (cleaned.length > 6) cleaned = `${cleaned.slice(0, 6)}.${cleaned.slice(6)}`;
    if (cleaned.length > 3) cleaned = `${cleaned.slice(0, 3)}.${cleaned.slice(3)}`;
  } else {
    // CNPJ
    if (cleaned.length > 12) cleaned = `${cleaned.slice(0, 12)}-${cleaned.slice(12)}`;
    if (cleaned.length > 8) cleaned = `${cleaned.slice(0, 8)}/${cleaned.slice(8)}`;
    if (cleaned.length > 5) cleaned = `${cleaned.slice(0, 5)}.${cleaned.slice(5)}`;
    if (cleaned.length > 2) cleaned = `${cleaned.slice(0, 2)}.${cleaned.slice(2)}`;
  }
  return cleaned;
};

// --- Schemas ---
const addressSchema = z.object({
  zip_code: z.string().min(1, 'CEP é obrigatório.'),
  street: z.string().min(1, 'Rua é obrigatória.'),
  number: z.string().min(1, 'Número é obrigatório.'),
  complement: z.string().optional(),
  neighborhood: z.string().min(1, 'Bairro é obrigatório.'),
  city: z.string().min(1, 'Cidade é obrigatória.'),
});

type AddressFormValues = z.infer<typeof addressSchema>;

const checkoutSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório.'),
  phone: z.string().min(1, 'Telefone é obrigatório.').transform(val => val.replace(/\D/g, '')).refine(val => val.length >= 10, {
    message: 'O telefone deve ter pelo menos 10 dígitos.',
  }),
  cpf_cnpj: z.string().min(1, 'CPF/CNPJ é obrigatório.').transform(val => val.replace(/\D/g, '')).refine(val => val.length === 11 || val.length === 14, {
    message: 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.',
  }),
  delivery_option: z.enum(['delivery', 'pickup'], {
    required_error: 'Selecione uma opção de entrega.',
  }),
  notes: z.string().optional(),
  payment_method_id: z.string().min(1, 'Selecione um método de pagamento.'),
  change_for: z.string().optional(),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

// --- Funções de Fetch ---
const fetchRestaurantData = async (restaurantId: string): Promise<Restaurant> => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, name, address, phone, email, street, number, neighborhood, city, zip_code, latitude, longitude, delivery_enabled')
    .eq('id', restaurantId)
    .eq('is_active', true)
    .limit(1)
    .single();
  if (error) throw new Error(`Erro ao buscar restaurante: ${error.message}`);
  if (!data) throw new Error('Restaurante não encontrado ou inativo.');
  return data as Restaurant;
};

const fetchDeliveryZones = async (restaurantId: string): Promise<DeliveryZone[]> => {
  const { data, error } = await supabase
    .from('delivery_zones')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('max_distance_km', { ascending: true });
  if (error) throw new Error(`Erro ao buscar zonas de entrega: ${error.message}`);
  return data;
};

const fetchPaymentMethods = async (restaurantId: string): Promise<PaymentMethod[]> => {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(`Erro ao buscar métodos de pagamento: ${error.message}`);
  return data;
};

const fetchCustomerData = async (userId: string): Promise<Customer | null> => {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data as Customer || null;
};

// --- Componente Principal ---
const Checkout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { items, totalAmount: cartSubtotal, clearCart } = useCart();
  const { data: user, isLoading: isLoadingAuth } = useAuthStatus();
  const [restaurantIdFromState] = useState(location.state?.restaurantId as string | undefined);
  const restaurantIdFromQuery = searchParams.get('restaurantId') as string | undefined;
  const restaurantId = restaurantIdFromState || restaurantIdFromQuery;
  const { data: mpPublicKey } = useMercadoPagoPublicKey(restaurantId);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryTime, setDeliveryTime] = useState<[number, number] | null>(null);
  const [isDeliveryAreaValid, setIsDeliveryAreaValid] = useState(true);
  const [customerCoords, setCustomerCoords] = useState<[number, number] | null>(null);
  const [isMercadoPagoOpen, setIsMercadoPagoOpen] = useState(false);
  const [mpPreferenceId, setMpPreferenceId] = useState<string | null>(null);
  const [mpInitPoint, setMpInitPoint] = useState<string | null>(null);
  const [isAddressSaved, setIsAddressSaved] = useState(false);
  const [isOnlineWarningModalOpen, setIsOnlineWarningModalOpen] = useState(false);
  const [pendingOnlinePaymentId, setPendingOnlinePaymentId] = useState<string | null>(null);
  const [savedAddressString, setSavedAddressString] = useState<string | null>(null);

  // Referência para o timer de inatividade
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: restaurant, isLoading: isLoadingRestaurant, isError: isErrorRestaurant, error: errorRestaurant, refetch: refetchRestaurant } = useQuery<Restaurant>({
    queryKey: ['checkoutRestaurantData', restaurantId],
    queryFn: () => fetchRestaurantData(restaurantId!),
    enabled: !!restaurantId,
    staleTime: Infinity,
  });

  const { data: deliveryZones, isLoading: isLoadingZones } = useQuery<DeliveryZone[]>({
    queryKey: ['checkoutDeliveryZones', restaurantId],
    queryFn: () => fetchDeliveryZones(restaurant!.id),
    enabled: !!restaurant,
    staleTime: Infinity,
  });

  const { data: paymentMethods, isLoading: isLoadingMethods } = useQuery<PaymentMethod[]>({
    queryKey: ['checkoutPaymentMethods', restaurantId],
    queryFn: () => fetchPaymentMethods(restaurant!.id),
    enabled: !!restaurant,
    staleTime: Infinity,
  });

  const { data: customer, isLoading: isLoadingCustomer, refetch: refetchCustomer } = useQuery<Customer | null>({
    queryKey: ['checkoutCustomerData', user?.id],
    queryFn: () => fetchCustomerData(user!.id),
    enabled: !!user,
    staleTime: 0,
  });

  const restaurantCoords: [number, number] | null = useMemo(() => {
    if (restaurant?.latitude && restaurant?.longitude) {
      return [restaurant.latitude, restaurant.longitude];
    }
    return null;
  }, [restaurant]);

  // --- Lógica de Expiração de Sessão (20 minutos fora da aba) ---
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        console.log("Página oculta. Iniciando timer de expiração de 20 minutos...");
        // Inicia o timer de 20 minutos (1.200.000 ms)
        inactivityTimerRef.current = setTimeout(async () => {
          console.log("Timer expirado. Deslogando usuário...");
          
          // Desloga o usuário
          await supabase.auth.signOut();
          
          // Feedback visual
          toast.error("Sessão expirada.", {
            description: "Você ficou fora da página de checkout por mais de 20 minutos. Por favor, identifique-se novamente.",
            duration: 6000,
          });
          
          // Redireciona para o Auth
          navigate('/auth', { 
            state: { 
              from: '/checkout', 
              restaurantId 
            },
            replace: true 
          });
        }, 1200000); // 20 minutos em milissegundos
      } else {
        console.log("Página visível. Cancelando timer de expiração.");
        // Se voltar antes do tempo, cancela o timer
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
          inactivityTimerRef.current = null;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [navigate, restaurantId]);

  const calculateFee = useCallback(async (zip_code: string, street: string, number: string, city: string, neighborhood: string, lat?: number | null, lng?: number | null) => {
    const DEFAULT_DELIVERY_TIME: [number, number] = [30, 45];
    
    if (restaurant && restaurant.delivery_enabled === false) {
      const fullAddress = `${street}, ${number}, ${neighborhood}, ${city}, ${zip_code}`;
      let coords: { lat: number, lng: number } | null = null;
      if (lat && lng) {
        coords = { lat, lng };
      } else {
        coords = await geocodeAddress(fullAddress);
      }
      if (!coords) {
        return { coords: null, fee: 0, time: null, isValid: false };
      }
      if (deliveryZones && deliveryZones.length > 0 && restaurantCoords) {
        const feeResult = calculateDeliveryFee(
          [coords.lat, coords.lng],
          restaurantCoords,
          deliveryZones
        );
        if (feeResult) {
          return { coords, fee: 0, time: [feeResult.minTime, feeResult.maxTime], isValid: true };
        }
      }
      return { coords, fee: 0, time: DEFAULT_DELIVERY_TIME, isValid: true };
    }

    if (!restaurant || !restaurantCoords) {
      return { coords: null, fee: 0, time: DEFAULT_DELIVERY_TIME, isValid: true };
    }

    const fullAddress = `${street}, ${number}, ${neighborhood}, ${city}, ${zip_code}`;
    let coords: { lat: number, lng: number } | null = null;
    if (lat && lng) {
      coords = { lat, lng };
    } else {
      coords = await geocodeAddress(fullAddress);
    }
    if (!coords) {
      return { coords: null, fee: 0, time: null, isValid: false };
    }

    if (deliveryZones && deliveryZones.length > 0) {
      const feeResult = calculateDeliveryFee(
        [coords.lat, coords.lng],
        restaurantCoords,
        deliveryZones
      );
      if (feeResult) {
        return { coords, fee: feeResult.fee, time: [feeResult.minTime, feeResult.maxTime], isValid: true };
      } else {
        return { coords, fee: 0, time: null, isValid: false };
      }
    } else {
      return { coords: null, fee: 0, time: DEFAULT_DELIVERY_TIME, isValid: true };
    }
  }, [restaurant, restaurantCoords, deliveryZones]);

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      name: '',
      phone: '',
      cpf_cnpj: '',
      delivery_option: 'delivery',
      notes: '',
      payment_method_id: '',
      change_for: '',
    },
    mode: 'onBlur',
  });

  const addressForm = useForm<AddressFormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      zip_code: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
    },
    mode: 'onBlur',
  });

  // --- HARD RESET NO MOUNT ---
  useEffect(() => {
    addressForm.reset({
      zip_code: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
    });
    setIsAddressSaved(false);
    setCustomerCoords(null);
    setSavedAddressString(null);
    setDeliveryFee(0);
    setDeliveryTime(null);
    setIsDeliveryAreaValid(true);
  }, []);

  const deliveryOption = form.watch('delivery_option');
  const selectedPaymentMethodId = form.watch('payment_method_id');
  const selectedPaymentMethod = paymentMethods?.find(m => m.id === selectedPaymentMethodId);
  const isOnlinePayment = selectedPaymentMethod?.name?.includes('online');
  const isCashPayment = selectedPaymentMethod?.name?.includes('Dinheiro');
  const totalAmount = cartSubtotal + deliveryFee;

  const addressFields = addressForm.watch(['zip_code', 'street', 'number', 'city', 'neighborhood', 'complement']);

  const currentAddressString = useMemo(() => {
    const [zip_code, street, number, city, neighborhood, complement] = addressFields;
    return `${street}|${number}|${complement || ''}|${neighborhood}|${city}|${zip_code}`;
  }, [addressFields]);

  // --- Realtime Listener para atualização automática das taxas ---
  useEffect(() => {
    if (!restaurantId) return;

    const zonesChannel = supabase.channel('delivery-zones-changes')
      .on(
        'postgres_changes', 
        { event: '*', schema: 'public', table: 'delivery_zones', filter: `restaurant_id=eq.${restaurantId}` }, 
        () => {
          console.log('[Realtime] Zonas de entrega atualizadas. Invalidando query...');
          queryClient.invalidateQueries({ queryKey: ['checkoutDeliveryZones', restaurantId] });
          toast.info("As taxas de entrega foram atualizadas.", { duration: 3000 });
        }
      )
      .subscribe();

    const restaurantChannel = supabase.channel('restaurant-settings-changes')
      .on(
        'postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'restaurants', filter: `id=eq.${restaurantId}` }, 
        () => {
          console.log('[Realtime] Configurações do restaurante atualizadas. Invalidando query...');
          queryClient.invalidateQueries({ queryKey: ['checkoutRestaurantData', restaurantId] });
          toast.info("As configurações da loja foram atualizadas.", { duration: 3000 });
        }
      )
      .subscribe();

    return () => { 
      supabase.removeChannel(zonesChannel); 
      supabase.removeChannel(restaurantChannel);
    };
  }, [restaurantId, queryClient]);

  // --- Efeito para Recalcular Taxa Automaticamente quando Zonas ou Status mudam ---
  useEffect(() => {
    if (isAddressSaved && customerCoords && restaurantCoords && deliveryZones && restaurant) {
      console.log('[Checkout] Recalculando taxa devido a mudanças nos dados...', { deliveryZones });
      
      if (restaurant.delivery_enabled === false) {
        setDeliveryFee(0);
        setIsDeliveryAreaValid(true);
        if (!deliveryTime) setDeliveryTime([30, 45]); 
      } else {
        const feeResult = calculateDeliveryFee(
          customerCoords,
          restaurantCoords,
          deliveryZones
        );

        if (feeResult) {
          console.log('[Checkout] Nova taxa calculada:', feeResult.fee);
          setDeliveryFee(feeResult.fee);
          setDeliveryTime([feeResult.minTime, feeResult.maxTime]);
          setIsDeliveryAreaValid(true);
        } else {
          console.warn('[Checkout] Endereço agora fora da área de entrega.');
          setIsDeliveryAreaValid(false);
          setDeliveryFee(0);
          toast.warning("As zonas de entrega mudaram e seu endereço agora está fora da área de cobertura.");
        }
      }
    }
  }, [deliveryZones, restaurant?.delivery_enabled, customerCoords, restaurantCoords, isAddressSaved]); 

  // --- Efeito de Inicialização (Carregar dados do cliente) ---
  useEffect(() => {
    if (customer) {
      // 1. Dados Pessoais
      form.reset({
        ...form.getValues(),
        name: customer.name || '',
        phone: formatPhoneNumber(customer.phone || ''),
        cpf_cnpj: formatCpfCnpj(customer.cpf_cnpj || ''),
        change_for: '',
      });

      // 2. Dados de Endereço (Preenchimento Automático)
      // Se houver endereço salvo e coordenadas, preenchemos o form e marcamos como salvo.
      // Isso irá disparar o efeito de cálculo de taxa automaticamente.
      if (customer.street && customer.zip_code) {
        addressForm.reset({
          zip_code: customer.zip_code,
          street: customer.street,
          number: customer.number || '',
          complement: customer.complement || '',
          neighborhood: customer.neighborhood || '',
          city: customer.city || '',
        });

        // Se houver coordenadas, configuramos o estado para "Endereço Salvo"
        if (customer.latitude && customer.longitude) {
          setCustomerCoords([Number(customer.latitude), Number(customer.longitude)]);
          setIsAddressSaved(true);
          const addrString = `${customer.street}|${customer.number}|${customer.complement || ''}|${customer.neighborhood}|${customer.city}|${customer.zip_code}`;
          setSavedAddressString(addrString);
        }
      }

    } else if (user && !isLoadingCustomer) {
      // Fallback para metadata do usuário se não houver registro de customer
      const userMetadata = user.user_metadata;
      form.reset({
        ...form.getValues(),
        name: (userMetadata.full_name as string) || '',
        phone: formatPhoneNumber((userMetadata.phone as string) || ''),
        cpf_cnpj: formatCpfCnpj((userMetadata.cpf_cnpj as string) || ''),
        change_for: '',
      });
    }
  }, [customer, user, isLoadingCustomer, form, addressForm]); 

  useEffect(() => {
    if (deliveryOption === 'delivery' && savedAddressString !== null && currentAddressString !== savedAddressString) {
      setIsAddressSaved(false);
      setDeliveryFee(0);
      setDeliveryTime(null);
      setIsDeliveryAreaValid(true);
      setCustomerCoords(null);
    }
  }, [currentAddressString, savedAddressString, deliveryOption]);

  const changeForString = form.watch('change_for');
  useEffect(() => {
    if (isCashPayment && changeForString && changeForString.trim() !== '') {
      const cleanedValue = changeForString.replace(',', '.');
      const changeForValue = parseFloat(cleanedValue);
      if (isNaN(changeForValue)) {
        form.setError('change_for', { message: 'O troco deve ser um número válido.' });
      } else if (changeForValue < totalAmount) {
        form.setError('change_for', {
          message: `O troco deve ser maior ou igual ao total do pedido (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}).`
        });
      } else {
        form.clearErrors('change_for');
      }
    } else {
      form.clearErrors('change_for');
    }
  }, [isCashPayment, changeForString, totalAmount, form]);

  const saveAddressMutation = useMutation({
    mutationFn: async (data: AddressFormValues): Promise<{ customer: Customer | null, feeResult: { coords: { lat: number, lng: number } | null, fee: number, time: [number, number] | null, isValid: boolean } }> => {
      setIsGeocoding(true);
      
      const fullAddress = `${data.street}, ${data.number}${data.complement ? ` - ${data.complement}` : ''}, ${data.neighborhood}, ${data.city}, ${data.zip_code}`;
      const feeResult = await calculateFee(data.zip_code, data.street, data.number, data.city, data.neighborhood);
      setIsGeocoding(false);

      if (!feeResult.isValid) {
        throw new Error(restaurant?.delivery_enabled === false ? "O endereço está errado ou incompleto, revise todos os campos." : "Endereço fora da área de entrega.");
      }

      if (!feeResult.coords) {
        throw new Error("Não foi possível obter as coordenadas para salvar o endereço.");
      }

      const userAuth = await supabase.auth.getUser();
      const userId = userAuth.data.user?.id;

      const contactName = form.getValues('name');
      const contactPhone = form.getValues('phone');
      const contactCpfCnpj = form.getValues('cpf_cnpj');
      
      const cleanedPhone = contactPhone.replace(/\D/g, '');
      const cleanedCpfCnpj = contactCpfCnpj.replace(/\D/g, '');

      if (!contactName || cleanedPhone.length < 10 || !cleanedCpfCnpj || (cleanedCpfCnpj.length !== 11 && cleanedCpfCnpj.length !== 14)) {
          throw new Error("Preencha Nome, Telefone (10+ dígitos) e CPF/CNPJ (11 ou 14 dígitos) nos Seus Dados antes de salvar o endereço.");
      }

      if (!customer?.id && !userId) {
        const mockCustomer: Customer = {
          id: 'anonymous',
          user_id: null,
          name: contactName,
          phone: cleanedPhone,
          email: null,
          address: fullAddress,
          created_at: '',
          updated_at: '',
          latitude: feeResult.coords.lat,
          longitude: feeResult.coords.lng,
          cpf_cnpj: cleanedCpfCnpj,
          street: data.street,
          number: data.number,
          neighborhood: data.neighborhood,
          city: data.city,
          zip_code: data.zip_code,
          complement: data.complement || null
        };
        return { customer: mockCustomer, feeResult };
      }

      const customerContactData = {
        name: contactName,
        phone: cleanedPhone,
        cpf_cnpj: cleanedCpfCnpj || null,
      };

      const addressPayload: any = {
        user_id: user?.id || null,
        ...customerContactData,
        email: user?.email || null,
        address: fullAddress,
        latitude: feeResult.coords.lat,
        longitude: feeResult.coords.lng,
        street: data.street,
        number: data.number,
        neighborhood: data.neighborhood,
        city: data.city,
        zip_code: data.zip_code,
        complement: data.complement || null,
      };

      const selectColumns = '*, street, number, neighborhood, city, zip_code, complement';

      let savedCustomer: Customer;
      if (customer?.id) {
        const { data: updatedCustomer, error: updateError } = await supabase
          .from('customers')
          .update(addressPayload)
          .eq('id', customer.id)
          .select(selectColumns)
          .single();
        if (updateError) throw updateError;
        savedCustomer = updatedCustomer as Customer;
      } else if (userId) {
        const { data: newCustomer, error: insertError } = await supabase
          .from('customers')
          .insert(addressPayload)
          .select(selectColumns)
          .single();
        if (insertError) throw insertError;
        savedCustomer = newCustomer as Customer;
      } else {
        throw new Error('Não foi possível identificar o cliente para salvar.');
      }

      return { customer: savedCustomer, feeResult };
    },
    onSuccess: (result, variables) => {
      const { customer: newCustomer, feeResult } = result;
      if (newCustomer?.id !== 'anonymous') {
        queryClient.invalidateQueries({ queryKey: ['checkoutCustomerData'] });
      }
      setDeliveryFee(feeResult.fee);
      setDeliveryTime(feeResult.time);
      setIsDeliveryAreaValid(feeResult.isValid);
      setIsAddressSaved(true);
      setCustomerCoords([feeResult.coords!.lat, feeResult.coords!.lng]);
      const newAddressString = `${variables.street}|${variables.number}|${variables.complement || ''}|${variables.neighborhood}|${variables.city}|${variables.zip_code}`;
      setSavedAddressString(newAddressString);
      toast.success('Endereço salvo e taxa de entrega calculada!');
    },
    onError: (err) => {
      toast.error(`Erro ao salvar endereço: ${err.message}`);
      setIsDeliveryAreaValid(false);
      setIsAddressSaved(false);
    }
  });

  const handleSaveAddress = (data: AddressFormValues) => {
    form.trigger(['name', 'phone', 'cpf_cnpj']).then(isContactValid => {
        if (isContactValid) {
            saveAddressMutation.mutate(data);
        } else {
            toast.error("Preencha Nome, Telefone e CPF/CNPJ nos Seus Dados antes de salvar o endereço.");
        }
    });
  };

  const createCustomerMutation = useMutation({
    mutationFn: async (data: CheckoutFormValues): Promise<Customer> => {
      const userAuth = await supabase.auth.getUser();
      const userId = userAuth.data.user?.id;
      const cleanedPhone = data.phone.replace(/\D/g, '');
      const cleanedCpfCnpj = data.cpf_cnpj?.replace(/\D/g, '') || null;

      if (!data.name || cleanedPhone.length < 10 || (cleanedCpfCnpj && cleanedCpfCnpj.length !== 11 && cleanedCpfCnpj.length !== 14)) {
          throw new Error("Dados de contato incompletos ou inválidos.");
      }

      const currentAddress = addressForm.getValues();
      
      const fullAddress = deliveryOption === 'delivery' ? 
        `${currentAddress.street}, ${currentAddress.number}${currentAddress.complement ? ` - ${currentAddress.complement}` : ''}, ${currentAddress.neighborhood}, ${currentAddress.city}, ${currentAddress.zip_code}` : 
        null;

      const customerPayload: any = {
        user_id: user?.id || null,
        name: data.name,
        phone: cleanedPhone,
        email: user?.email || null,
        cpf_cnpj: cleanedCpfCnpj,
        address: fullAddress,
        latitude: customerCoords ? customerCoords[0] : null,
        longitude: customerCoords ? customerCoords[1] : null,
        street: addressForm.getValues('street') || null,
        number: addressForm.getValues('number') || null,
        neighborhood: addressForm.getValues('neighborhood') || null,
        city: addressForm.getValues('city') || null,
        zip_code: addressForm.getValues('zip_code') || null,
        complement: addressForm.getValues('complement') || null,
      };
      
      if (!user) {
          customerPayload.email = null;
      }

      const selectColumns = '*, street, number, neighborhood, city, zip_code, complement';

      if (user) {
        if (customer) {
          const { data: updatedCustomer, error: updateError } = await supabase
            .from('customers')
            .update(customerPayload)
            .eq('id', customer.id)
            .select(selectColumns)
            .single();
          if (updateError) throw updateError;
          return updatedCustomer as Customer;
        } else {
          const { data: newCustomer, error: insertError } = await supabase
            .from('customers')
            .insert(customerPayload)
            .select(selectColumns)
            .single();
          if (insertError) throw insertError;
          return newCustomer as Customer;
        }
      } else {
        const { data: newCustomer, error: insertError } = await supabase
          .from('customers')
          .insert(customerPayload)
          .select(selectColumns)
          .single();
        if (insertError) throw insertError;
        return newCustomer as Customer;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkoutCustomerData'] });
    },
    onError: (err) => {
      toast.error(`Erro ao salvar dados do cliente: ${err.message}`);
    }
  });

  const createOrderMutation = useMutation({
    mutationFn: async ({ customerId, data }: { customerId: string, data: CheckoutFormValues }) => {
      if (!restaurant) throw new Error('Dados do restaurante não disponíveis.');

      let changeForValue: number | null = null;
      if (isCashPayment && data.change_for && data.change_for.trim() !== '') {
        const cleanedValue = data.change_for.replace(',', '.');
        const numValue = parseFloat(cleanedValue);
        if (!isNaN(numValue) && numValue > totalAmount) {
          changeForValue = numValue;
        }
      }

      let [minTime, maxTime] = deliveryTime || [null, null];
      if ((deliveryOption === 'delivery' || deliveryOption === 'pickup') && (!minTime || !maxTime)) {
        const fallbackTime = deliveryOption === 'pickup' ? [15, 30] : [30, 45];
        minTime = fallbackTime[0];
        maxTime = fallbackTime[1];
      }

      const currentAddress = addressForm.getValues();

      const deliveryAddress = deliveryOption === 'delivery' ? 
        `${currentAddress.street}, ${currentAddress.number}${currentAddress.complement ? ` - ${currentAddress.complement}` : ''}, ${currentAddress.neighborhood}, ${currentAddress.city}, ${currentAddress.zip_code}` : 
        null;

      const orderPayload: TablesInsert<'orders'> = {
        restaurant_id: restaurant.id,
        customer_id: customerId,
        status: isOnlinePayment ? 'pending_payment' : 'pending',
        total_amount: totalAmount,
        delivery_fee: deliveryFee,
        delivery_address: deliveryAddress,
        notes: data.notes,
        payment_method_id: data.payment_method_id,
        change_for: changeForValue,
        min_delivery_time_minutes: minTime,
        max_delivery_time_minutes: maxTime,
      };

      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id')
        .single();
      if (orderError) throw orderError;

      const orderItemsPayload: TablesInsert<'order_items'>[] = items.map(item => ({
        order_id: newOrder.id,
        product_id: item.product.id,
        quantity: parseFloat(item.quantity.toFixed(3)),
        unit_price: parseFloat(item.product.price.toFixed(2)),
        subtotal: parseFloat(item.subtotal.toFixed(2)),
        notes: item.notes,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItemsPayload);
      if (itemsError) throw itemsError;

      return newOrder.id;
    },
    onSuccess: (orderId) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err) => {
      toast.error(`Erro ao criar pedido: ${err.message}`);
    }
  });

  const onSubmit = async (data: CheckoutFormValues) => {
    if (isCashPayment && data.change_for && data.change_for.trim() !== '') {
      const cleanedValue = data.change_for.replace(',', '.');
      const changeForValue = parseFloat(cleanedValue);
      if (isNaN(changeForValue)) {
        toast.error('O troco deve ser um número válido.');
        return;
      }
      if (changeForValue < totalAmount) {
        form.setError('change_for', {
          type: 'manual',
          message: `O troco deve ser maior ou igual ao total do pedido (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}).`
        });
        return;
      }
    }

    if (items.length === 0) {
      toast.error('Seu carrinho está vazio.');
      navigate(`/menu/${restaurantId}`);
      return;
    }

    if (deliveryOption === 'delivery') {
      if (!isAddressSaved) {
        toast.error('Você deve salvar e validar o endereço de entrega antes de finalizar o pedido.');
        return;
      }
      if (!isDeliveryAreaValid) {
        toast.error('O endereço de entrega está fora da área de cobertura.');
        return;
      }
    }

    let customerId: string;
    try {
      const newCustomer = await createCustomerMutation.mutateAsync(data);
      customerId = newCustomer.id;
    } catch (e: any) {
      toast.error(`Falha ao salvar cliente: ${e.message}`);
      return;
    }

    let orderId: string;
    try {
      orderId = await createOrderMutation.mutateAsync({ customerId, data });
    } catch (e: any) {
      toast.error(`Falha ao criar pedido: ${e.message}`);
      return;
    }

    if (isOnlinePayment) {
      await handleMercadoPagoCheckout(orderId, data);
    } else {
      clearCart();
      navigate(`/order-success/${orderId}`, { replace: true });
    }
  };

  const handleMercadoPagoCheckout = async (orderId: string, data: CheckoutFormValues) => {
    if (!restaurant) return;
    const clientUrl = window.location.origin + window.location.pathname;
    const itemsPayload = items.map(item => ({
      name: item.product.name,
      price: item.product.price,
      quantity: item.quantity,
    }));

    const loadingToastId = toast.loading("Preparando pagamento online...");
    try {
      const { data: mpData, error: mpError } = await supabase.functions.invoke('create-payment-preference', {
        body: {
          orderId: orderId,
          items: itemsPayload,
          totalAmount: totalAmount,
          restaurantName: restaurant.name,
          clientUrl: clientUrl,
          customerEmail: user?.email || 'cliente@anonimo.com',
          customerCpfCnpj: data.cpf_cnpj,
        },
      });
      if (mpError) throw mpError;

      const { init_point } = mpData as { init_point: string };
      setMpPreferenceId(orderId);
      setMpInitPoint(init_point);
      setIsMercadoPagoOpen(true);
      toast.dismiss(loadingToastId);
    } catch (error: any) {
      toast.dismiss(loadingToastId);
      toast.error(`Erro no pagamento online: ${error.message}`);
      setIsMercadoPagoOpen(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Você saiu da sua conta.");
    navigate('/auth', { replace: true });
  };

  const handlePaymentMethodChange = (newMethodId: string, isOnline: boolean, isMpConfigured: boolean) => {
    if (isOnline && isMpConfigured) {
      setPendingOnlinePaymentId(newMethodId);
      setIsOnlineWarningModalOpen(true);
    } else {
      form.setValue('payment_method_id', newMethodId, { shouldValidate: true });
      setPendingOnlinePaymentId(null);
    }
  };

  const handleOnlineWarningConfirm = () => {
    if (pendingOnlinePaymentId) {
      form.setValue('payment_method_id', pendingOnlinePaymentId, { shouldValidate: true });
    }
    setIsOnlineWarningModalOpen(false);
    setPendingOnlinePaymentId(null);
  };

  const handleAddressSelect = useCallback((address: any) => {
    addressForm.setValue('street', address.street);
    addressForm.setValue('neighborhood', address.neighborhood);
    addressForm.setValue('city', address.city);
    addressForm.setValue('zip_code', address.zip_code);
    addressForm.setValue('number', address.number);
    addressForm.setValue('complement', ''); 
    
    toast.info("Endereço encontrado! Verifique o número e clique em Salvar.");
  }, [addressForm]);

  const displayAddress = useMemo(() => {
    const [zip_code, street, number, city, neighborhood, complement] = addressFields;
    if (street && number && neighborhood && city && zip_code) {
      return `${street}, ${number}${complement ? ` - ${complement}` : ''} - ${neighborhood}, ${city}, ${zip_code}`;
    }
    return '';
  }, [addressFields]);

  if (!restaurantId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-lg">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Erro de Rastreamento</AlertTitle>
          <AlertDescription>
            Não foi possível identificar o restaurante para o qual o pedido está sendo feito. Por favor, volte ao menu.
          </AlertDescription>
          <Link to="/"><Button className="mt-3" variant="secondary" size="sm">Voltar</Button></Link>
        </Alert>
      </div>
    );
  }

  if (items.length === 0) {
    useEffect(() => {
      navigate(`/menu/${restaurantId}`);
    }, [navigate, restaurantId]);
    return <LoadingSpinner />;
  }

  if (isLoadingRestaurant || isLoadingZones || isLoadingMethods || isLoadingAuth) {
    return <LoadingSpinner />;
  }

  if (isErrorRestaurant || !restaurant) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-lg">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Erro Crítico</AlertTitle>
          <AlertDescription>
            {errorRestaurant instanceof Error ? errorRestaurant.message : "Não foi possível carregar os dados do restaurante."}
          </AlertDescription>
          <Button onClick={() => refetchRestaurant()} className="mt-3" variant="secondary" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" /> Tentar Novamente
          </Button>
        </Alert>
      </div>
    );
  }

  const isFormSubmitting = createCustomerMutation.isPending || createOrderMutation.isPending || saveAddressMutation.isPending;
  const isCheckoutDisabled = isFormSubmitting || isGeocoding || (deliveryOption === 'delivery' && !isAddressSaved);

  return (
    <div className="min-h-screen bg-background w-full overflow-x-hidden">
      {/* 
        Ajustado padding horizontal (px-3 em vez de px-4) para telas menores 
        para ganhar mais espaço útil
      */}
      <div className="container mx-auto px-3 sm:px-6 py-4 sm:py-8 max-w-5xl space-y-6 sm:space-y-8">
        <CustomerProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          customer={customer}
        />

        <OnlinePaymentWarningModal
          isOpen={isOnlineWarningModalOpen}
          onConfirm={handleOnlineWarningConfirm}
        />

        {isMercadoPagoOpen && mpInitPoint && (
          <MercadoPagoPayment
            preferenceId={mpPreferenceId!}
            initPoint={mpInitPoint}
            onClose={() => setIsMercadoPagoOpen(false)}
          />
        )}

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Link to={`/menu/${restaurantId}`}>
              <Button variant="ghost" size="icon" aria-label="Voltar ao Menu">
                <ArrowLeft className="h-6 w-6" />
              </Button>
            </Link>
            <div className="flex-1 min-w-0">
              {/* Fonte do título reduzida em mobile */}
              <h1 className="text-lg sm:text-3xl font-bold text-foreground">Finalizar Pedido</h1>
              <p className="text-xs sm:text-lg text-muted-foreground font-medium truncate max-w-full">{restaurant.name}</p>
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button variant="outline" size="sm" onClick={() => setIsProfileModalOpen(true)} aria-label="Meu Perfil e Pedidos" className="flex-1 sm:flex-none text-xs sm:text-sm h-8 sm:h-9">
                <UserIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" /> <span className="truncate">Perfil / Pedidos</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout} className="flex-shrink-0 text-xs sm:text-sm h-8 sm:h-9">
                <LogOut className="h-3 w-3 sm:h-4 sm:w-4 mr-1" /> Sair
              </Button>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-6 sm:gap-8 w-full">
          <div className="lg:col-span-2 space-y-6 min-w-0">
            <Card className="w-full overflow-hidden">
              <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                {/* Fonte do CardTitle reduzida em mobile */}
                <CardTitle className="text-base sm:text-xl flex items-center gap-2">
                  <User className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> Seus Dados
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 sm:p-6 sm:pt-0">
                <div className="flex justify-between items-center mb-3 sm:mb-4">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {user ? `Logado como ${user.email}` : 'Pedido anônimo'}
                  </p>
                </div>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} id="checkout-form">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 min-w-0">
                      <div className="space-y-1.5 sm:space-y-2">
                        <Label htmlFor="name" className="text-xs sm:text-sm">Nome Completo *</Label>
                        <Input id="name" {...form.register('name')} className="h-9 sm:h-12 text-sm w-full" />
                        {form.formState.errors.name && <p className="text-destructive text-xs sm:text-sm">{form.formState.errors.name.message}</p>}
                      </div>
                      <div className="space-y-1.5 sm:space-y-2">
                        <Label htmlFor="phone" className="text-xs sm:text-sm">Telefone *</Label>
                        <Controller
                          name="phone"
                          control={form.control}
                          render={({ field }) => <PhoneInput id="phone" {...field} className="h-9 sm:h-12 text-sm w-full" />}
                        />
                        {form.formState.errors.phone && <p className="text-destructive text-xs sm:text-sm">{form.formState.errors.phone.message}</p>}
                      </div>
                      <div className="space-y-1.5 sm:space-y-2">
                        <Label htmlFor="cpf_cnpj" className="text-xs sm:text-sm">CPF/CNPJ *</Label>
                        <Controller
                          name="cpf_cnpj"
                          control={form.control}
                          render={({ field }) => <CpfCnpjInput id="cpf_cnpj" {...field} className="h-9 sm:h-12 text-sm w-full" />}
                        />
                        {form.formState.errors.cpf_cnpj && <p className="text-destructive text-xs sm:text-sm">{form.formState.errors.cpf_cnpj.message}</p>}
                      </div>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card className="w-full overflow-hidden">
              <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                <CardTitle className="text-base sm:text-xl flex items-center gap-2">
                  <Truck className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> Opção de Entrega
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 sm:p-6 sm:pt-0">
                <Controller
                  name="delivery_option"
                  control={form.control}
                  render={({ field }) => (
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="grid grid-cols-2 gap-2 sm:gap-4 min-w-0 w-full"
                    >
                      <Label
                        htmlFor="delivery"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 sm:p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary cursor-pointer text-center w-full max-w-full"
                      >
                        <RadioGroupItem value="delivery" id="delivery" className="sr-only" />
                        <Truck className="mb-1.5 sm:mb-3 h-4 w-4 sm:h-6 sm:w-6 flex-shrink-0" />
                        <span translate="no" className="text-xs sm:text-base break-words w-full">Entrega</span>
                      </Label>
                      <Label
                        htmlFor="pickup"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 sm:p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary cursor-pointer text-center w-full max-w-full"
                      >
                        <RadioGroupItem value="pickup" id="pickup" className="sr-only" />
                        <MapPin className="mb-1.5 sm:mb-3 h-4 w-4 sm:h-6 sm:w-6 flex-shrink-0" />
                        <span translate="no" className="text-xs sm:text-base break-words w-full">Retirada no Local</span>
                      </Label>
                    </RadioGroup>
                  )}
                />
              </CardContent>
            </Card>

            {deliveryOption === 'delivery' && (
              <Card className={cn("w-full overflow-hidden", !isAddressSaved && "border-destructive ring-2 ring-destructive/50")}>
                <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                  <CardTitle className="text-base sm:text-xl flex items-center gap-2">
                    <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> Endereço de Entrega
                    {isAddressSaved && <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 ml-2 flex-shrink-0" />}
                    {!isAddressSaved && <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive ml-2 flex-shrink-0" />}
                  </CardTitle>
                  <p className="text-xs sm:text-sm text-muted-foreground">Preencha e salve para calcular a taxa.</p>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4 px-3 pb-3 sm:p-6 sm:pt-0">
                  {restaurant.delivery_enabled === false && (
                    <Alert variant="default" className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 text-blue-700 p-2 sm:p-4">
                      <Truck className="h-4 w-4" />
                      <AlertTitle className="text-sm font-semibold">Frete Grátis Ativo</AlertTitle>
                      <AlertDescription className="text-xs sm:text-sm">Taxas dinâmicas desativadas. Frete R$ 0,00.</AlertDescription>
                    </Alert>
                  )}

                  <Form {...addressForm}>
                    <form onSubmit={addressForm.handleSubmit(handleSaveAddress)} id="address-form-inner" className="space-y-3 sm:space-y-4" autoComplete="off">
                      <div className="space-y-1.5 sm:space-y-2">
                        <Label htmlFor="address-search" className="text-xs sm:text-sm">Buscar Endereço</Label>
                        <AddressAutocomplete onAddressSelect={handleAddressSelect} disabled={isGeocoding} />
                      </div>

                      <input type="hidden" {...addressForm.register('zip_code')} />
                      <input type="hidden" {...addressForm.register('street')} />
                      <input type="hidden" {...addressForm.register('neighborhood')} />
                      <input type="hidden" {...addressForm.register('city')} />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 min-w-0">
                        <div className="space-y-1.5 sm:space-y-2">
                          <Label htmlFor="number" className="text-xs sm:text-sm">Número *</Label>
                          <Input 
                            id="number" 
                            {...addressForm.register('number')} 
                            placeholder="Nº"
                            className="h-9 sm:h-12 text-sm"
                            autoComplete="off"
                          />
                          {addressForm.formState.errors.number && <p className="text-destructive text-xs sm:text-sm">{addressForm.formState.errors.number.message}</p>}
                        </div>
                        <div className="space-y-1.5 sm:space-y-2">
                          <Label htmlFor="complement" className="text-xs sm:text-sm">Complemento</Label>
                          <Input 
                            id="complement" 
                            {...addressForm.register('complement')} 
                            placeholder="Apto, Bloco..."
                            className="h-9 sm:h-12 text-sm"
                            autoComplete="off"
                          />
                        </div>
                      </div>

                      {addressForm.watch('street') && (
                        <div className="bg-muted p-2 sm:p-3 rounded text-xs sm:text-sm break-words overflow-hidden">
                          <p><strong>Endereço:</strong></p>
                          <p>
                            {addressForm.watch('street')}
                            {addressForm.watch('number') ? `, ${addressForm.watch('number')}` : ''}
                            {addressForm.watch('complement') ? ` - ${addressForm.watch('complement')}` : ''}
                          </p>
                          <p>{addressForm.watch('neighborhood')} - {addressForm.watch('city')}</p>
                        </div>
                      )}

                      <Button
                        type="submit"
                        className="w-full h-auto py-2 text-xs sm:text-base mt-2 whitespace-normal"
                        disabled={saveAddressMutation.isPending || isGeocoding}
                      >
                        {saveAddressMutation.isPending || isGeocoding ? (
                          <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin mr-2" />
                        ) : (
                          <Save className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                        )}
                        Salvar e Calcular
                      </Button>
                    </form>
                  </Form>

                  {isGeocoding && (
                    <Alert className="flex items-center gap-2 p-2 sm:p-4">
                      <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                      <AlertTitle className="text-xs sm:text-sm">Calculando...</AlertTitle>
                    </Alert>
                  )}

                  {isAddressSaved && !isGeocoding && (
                    <>
                      {restaurant.delivery_enabled !== false && !isDeliveryAreaValid && (
                        <Alert variant="destructive" className="p-2 sm:p-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle className="text-sm">Fora da Área</AlertTitle>
                          <AlertDescription className="text-xs">Endereço fora da área de cobertura.</AlertDescription>
                        </Alert>
                      )}

                      {(restaurant.delivery_enabled === false || (isDeliveryAreaValid && deliveryTime)) && (
                        <Alert variant="default" className="bg-green-50 dark:bg-green-900/20 border-green-200 text-green-700 p-2 sm:p-4">
                          <Truck className="h-4 w-4" />
                          <AlertTitle className="text-sm">Entrega Disponível</AlertTitle>
                          <AlertDescription className="text-xs">
                            Taxa: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deliveryFee)}. 
                            Tempo: {deliveryTime ? `${deliveryTime[0]}-${deliveryTime[1]}` : '30-45'} min.
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  )}

                  {isAddressSaved && customerCoords && displayAddress && (
                    <div className="mt-4 w-full overflow-hidden rounded-md border">
                      <ClientLocationMap
                        latitude={customerCoords[0]}
                        longitude={customerCoords[1]}
                        address={displayAddress}
                        className="w-full"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="w-full overflow-hidden">
              <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                <CardTitle className="text-base sm:text-xl flex items-center gap-2">
                  <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> Pagamento *
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 sm:p-6 sm:pt-0">
                <Controller
                  name="payment_method_id"
                  control={form.control}
                  render={({ field }) => (
                    <RadioGroup
                      onValueChange={(newMethodId) => {
                        const method = paymentMethods?.find(m => m.id === newMethodId);
                        const isOnline = method?.name?.includes('online');
                        const isMpConfigured = !!mpPublicKey && mpPublicKey.trim() !== '';
                        handlePaymentMethodChange(newMethodId, !!isOnline, isMpConfigured);
                      }}
                      value={field.value}
                      className="space-y-2 sm:space-y-3 w-full"
                    >
                      {paymentMethods?.map(method => {
                        const isMpOnline = method.name?.includes('online');
                        const isMpConfigured = !!mpPublicKey && mpPublicKey.trim() !== '';
                        const isDisabled = isMpOnline && !isMpConfigured;
                        return (
                          <Label
                            key={method.id}
                            htmlFor={method.id}
                            className={cn(
                              "flex items-center justify-between rounded-md border-2 border-muted bg-popover p-2.5 sm:p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary cursor-pointer w-full max-w-full",
                              isDisabled && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <div className="flex items-center space-x-2 sm:space-x-3 overflow-hidden min-w-0 w-full">
                              <RadioGroupItem value={method.id} id={method.id} disabled={isDisabled} className="flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                {/* IMPORTANTE: Usando whitespace-normal para permitir quebra de texto em nomes longos */}
                                <p className="font-medium text-xs sm:text-base break-words w-full leading-tight whitespace-normal" translate="no">{method.name}</p>
                                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{method.description}</p>
                                {isDisabled && (
                                  <p className="text-[10px] text-destructive mt-0.5">Indisponível no momento.</p>
                                )}
                              </div>
                            </div>
                          </Label>
                        );
                      })}
                    </RadioGroup>
                  )}
                />
                {form.formState.errors.payment_method_id && <p className="text-destructive text-xs sm:text-sm mt-2">{form.formState.errors.payment_method_id.message}</p>}
              </CardContent>
            </Card>

            {isCashPayment && (
              <Card className="w-full overflow-hidden">
                <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                  <CardTitle className="text-base sm:text-xl flex items-center gap-2">
                    <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> Troco
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 sm:p-6 sm:pt-0">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="change_for" className="text-xs sm:text-sm">Precisa de troco para quanto?</Label>
                    <Input
                      id="change_for"
                      type="number"
                      step="0.01"
                      placeholder={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}
                      {...form.register('change_for')}
                      className="h-9 sm:h-12 text-sm w-full"
                    />
                    {form.formState.errors.change_for?.message && (
                      <p className="text-destructive text-xs sm:text-sm">{form.formState.errors.change_for.message}</p>
                    )}
                    {form.formState.errors.change_for?.type === 'manual' && (
                      <p className="text-destructive text-xs sm:text-sm">{form.formState.errors.change_for.message}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="w-full overflow-hidden">
              <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                <CardTitle className="text-base sm:text-xl flex items-center gap-2">
                  <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> Observações
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 sm:p-6 sm:pt-0">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="notes" className="text-xs sm:text-sm">Notas para o restaurante</Label>
                  <Textarea
                    id="notes"
                    {...form.register('notes')}
                    rows={3}
                    placeholder="Ex: Entregar na portaria, sem pimenta..."
                    className="text-sm w-full"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-6 sticky top-4 self-start min-w-0">
            <Card className="shadow-lg w-full overflow-hidden">
              <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                <CardTitle className="text-lg sm:text-2xl">Resumo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 px-3 pb-3 sm:p-6 sm:pt-0">
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                  {items.map((item) => (
                    <div key={item.product.id} className="flex justify-between text-xs sm:text-sm">
                      <span className="truncate max-w-[70%]">{item.quantity}x {item.product.name}</span>
                      <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="space-y-1">
                  <div className="flex justify-between text-xs sm:text-sm text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs sm:text-sm text-muted-foreground">
                    <span>Taxa de Entrega</span>
                    <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deliveryFee)}</span>
                  </div>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-base sm:text-xl">
                  <span>Total</span>
                  <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}</span>
                </div>
                <Button
                  type="submit"
                  form="checkout-form"
                  className="w-full h-10 sm:h-12 text-sm sm:text-lg"
                  disabled={isCheckoutDisabled}
                >
                  {isCheckoutDisabled ? (
                    <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin mr-2" />
                  ) : (
                    isOnlinePayment ? 'Pagar e Finalizar' : 'Confirmar Pedido'
                  )}
                </Button>
                {deliveryOption === 'delivery' && !isAddressSaved && (
                  <Alert variant="destructive" className="mt-3 p-2 sm:p-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">Salve o endereço acima para continuar.</AlertDescription>
                  </Alert>
                )}
                <Link to={`/menu/${restaurant.id}`} className="block text-center text-xs sm:text-sm text-muted-foreground hover:underline mt-2">
                  Voltar ao Cardápio
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;