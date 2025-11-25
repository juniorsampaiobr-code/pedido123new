import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { MapPin, Phone, Mail, CreditCard, DollarSign, Truck, Loader2, User, RefreshCw, AlertCircle, LogOut, User as UserIcon, Save, CheckCircle, Terminal } from 'lucide-react';
import { ZipCodeInput } from '@/components/ZipCodeInput';
import { PhoneInput } from '@/components/PhoneInput';
import { CustomerProfileModal } from '@/components/CustomerProfileModal';
import { MercadoPagoPayment } from '@/components/MercadoPagoPayment';
import { CpfCnpjInput } from '@/components/CpfCnpjInput';
import { ClientLocationMap } from '@/components/ClientLocationMap';
import { cn } from '@/lib/utils';

// --- Tipos ---
type Restaurant = Tables<'restaurants'>;
type Customer = Tables<'customers'>;
type DeliveryZone = Tables<'delivery_zones'>;
type PaymentMethod = Tables<'payment_methods'>;
type CartItem = {
  product: Tables<'products'>;
  quantity: number;
  notes: string;
  subtotal: number;
};

// --- Schemas ---
const addressSchema = z.object({
  zip_code: z.string().min(1, 'CEP é obrigatório.').transform(val => val.replace(/\D/g, '')).refine(val => val.length === 8, {
    message: 'CEP deve ter 8 dígitos.',
  }),
  street: z.string().min(1, 'Rua é obrigatória.'),
  number: z.string().min(1, 'Número é obrigatório.'),
  neighborhood: z.string().min(1, 'Bairro é obrigatório.'),
  city: z.string().min(1, 'Cidade é obrigatória.'),
});

type AddressFormValues = z.infer<typeof addressSchema>;

// NOVO SCHEMA SIMPLIFICADO: Aceita string (vazia ou preenchida)
const checkoutSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório.'),
  phone: z.string().min(1, 'Telefone é obrigatório.').transform(val => val.replace(/\D/g, '')).refine(val => val.length >= 10, {
    message: 'O telefone deve ter pelo menos 10 dígitos.',
  }),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  cpf_cnpj: z.string().optional().default('').transform(val => val.replace(/\D/g, '')).refine(val => val.length === 0 || val.length === 11 || val.length === 14, {
    message: 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.',
  }),
  delivery_option: z.enum(['delivery', 'pickup'], { required_error: 'Selecione uma opção de entrega.' }),
  notes: z.string().optional(),
  payment_method_id: z.string().min(1, 'Selecione um método de pagamento.'),
  // Agora é apenas uma string opcional. A validação de número e valor será feita manualmente.
  change_for: z.string().optional(), 
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

// --- Funções de Fetch ---

// AGORA RECEBE O ID DO RESTAURANTE
const fetchRestaurantData = async (restaurantId: string): Promise<Restaurant> => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, name, address, phone, email, street, number, neighborhood, city, zip_code, latitude, longitude, delivery_enabled')
    .eq('id', restaurantId) // Busca pelo ID específico
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
  return data || null;
};

// --- Componente Principal ---

const Checkout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams(); // NOVO: Para ler query params
  const queryClient = useQueryClient();
  const { items, totalAmount: cartSubtotal, clearCart } = useCart();
  const { data: user, isLoading: isLoadingAuth } = useAuthStatus();
  const { data: mpPublicKey } = useMercadoPagoPublicKey();
  
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState(0);
  // deliveryTime agora armazena [min, max] em minutos
  const [deliveryTime, setDeliveryTime] = useState<[number, number] | null>(null); 
  const [isDeliveryAreaValid, setIsDeliveryAreaValid] = useState(true);
  const [customerCoords, setCustomerCoords] = useState<[number, number] | null>(null);
  const [isMercadoPagoOpen, setIsMercadoPagoOpen] = useState(false);
  const [mpPreferenceId, setMpPreferenceId] = useState<string | null>(null);
  const [mpInitPoint, setMpInitPoint] = useState<string | null>(null);
  
  // NOVO ESTADO: Rastreia se o endereço foi salvo/validado
  const [isAddressSaved, setIsAddressSaved] = useState(false);
  
  // NOVO: Obtém o ID do restaurante do estado de navegação OU dos query params (fallback)
  const restaurantIdFromState = location.state?.restaurantId as string | undefined;
  const restaurantIdFromQuery = searchParams.get('restaurantId') as string | undefined;
  const restaurantId = restaurantIdFromState || restaurantIdFromQuery;


  // DEBUG: Loga o status do usuário
  useEffect(() => {
      console.log("LOG: Checkout - User Status:", user ? `Logged in as ${user.email}` : 'Anonymous');
  }, [user]);

  // Fetch de dados essenciais
  const { data: restaurant, isLoading: isLoadingRestaurant, isError: isErrorRestaurant, error: errorRestaurant, refetch: refetchRestaurant } = useQuery<Restaurant>({
    queryKey: ['checkoutRestaurantData', restaurantId], // Adiciona restaurantId na chave
    queryFn: () => fetchRestaurantData(restaurantId!), // Usa o ID específico
    enabled: !!restaurantId, // Só busca se o ID estiver disponível
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

  // --- Definições de Variáveis e Callbacks (Movidas para o topo) ---
  
  const restaurantCoords: [number, number] | null = useMemo(() => {
    if (restaurant?.latitude && restaurant?.longitude) {
      return [restaurant.latitude, restaurant.longitude];
    }
    return null;
  }, [restaurant]);

  const calculateFee = useCallback(async (zip_code: string, street: string, number: string, city: string, neighborhood: string, lat?: number | null, lng?: number | null) => {
    
    // Tempo padrão de entrega (usado para retirada ou frete grátis)
    const DEFAULT_DELIVERY_TIME: [number, number] = [30, 45]; 
    
    // 1. Lógica de Frete Grátis se a entrega dinâmica estiver desativada
    if (restaurant && restaurant.delivery_enabled === false) {
      // Ainda precisamos geocodificar para validar o endereço e obter as coordenadas
      const fullAddress = `${street}, ${number}, ${neighborhood}, ${city}, ${zip_code}`;
      let coords: { lat: number, lng: number } | null = null;
      
      if (lat && lng) {
          coords = { lat, lng };
      } else {
          setIsGeocoding(true);
          const loadingToast = toast.loading("Validando endereço para frete grátis...");
          coords = await geocodeAddress(fullAddress); 
          setIsGeocoding(false);
          toast.dismiss(loadingToast);
      }
      
      if (!coords) {
        setDeliveryFee(0);
        setDeliveryTime(null);
        setIsDeliveryAreaValid(false);
        toast.error("O endereço está errado ou incompleto, revise todos os campos e clique em salvar endereço.");
        return { coords: null, fee: 0, time: null, isValid: false };
      }
      
      // Se o endereço for válido, a taxa é 0 (frete grátis)
      setCustomerCoords([coords.lat, coords.lng]);
      setDeliveryFee(0);
      setDeliveryTime(DEFAULT_DELIVERY_TIME); // Tempo padrão
      setIsDeliveryAreaValid(true);
      return { coords, fee: 0, time: DEFAULT_DELIVERY_TIME, isValid: true };
    }
    
    // 2. Lógica de Entrega Dinâmica (Se delivery_enabled for true ou null/undefined)
    if (!restaurant || !restaurantCoords) {
      setDeliveryFee(0);
      setIsDeliveryAreaValid(true);
      setDeliveryTime(DEFAULT_DELIVERY_TIME); // Tempo padrão
      return { coords: null, fee: 0, time: DEFAULT_DELIVERY_TIME, isValid: true };
    }

    const fullAddress = `${street}, ${number}, ${neighborhood}, ${city}, ${zip_code}`;
    let coords: { lat: number, lng: number } | null = null;
    
    if (lat && lng) {
        coords = { lat, lng };
    } else {
        setIsGeocoding(true);
        const loadingToast = toast.loading("Calculando taxa de entrega...");
        coords = await geocodeAddress(fullAddress); 
        setIsGeocoding(false);
        toast.dismiss(loadingToast);
    }

    if (!coords) {
      setDeliveryFee(0);
      setDeliveryTime(null);
      setIsDeliveryAreaValid(false);
      toast.error("O endereço está errado ou incompleto, revise todos os campos e clique em salvar endereço.");
      return { coords: null, fee: 0, time: null, isValid: false };
    }

    setCustomerCoords([coords.lat, coords.lng]);

    if (deliveryZones && deliveryZones.length > 0) {
      const feeResult = calculateDeliveryFee(
        [coords.lat, coords.lng],
        restaurantCoords,
        deliveryZones
      );

      if (feeResult) {
        setDeliveryFee(feeResult.fee);
        setDeliveryTime([feeResult.minTime, feeResult.maxTime]);
        setIsDeliveryAreaValid(true);
        return { coords, fee: feeResult.fee, time: [feeResult.minTime, feeResult.maxTime], isValid: true };
      } else {
        setDeliveryFee(0);
        setDeliveryTime(null);
        setIsDeliveryAreaValid(false);
        toast.error("Endereço fora da área de entrega.");
        return { coords, fee: 0, time: null, isValid: false };
      }
    } else {
      // Se não há zonas configuradas, mas a entrega está habilitada, cobramos 0 e usamos o tempo padrão
      setDeliveryFee(0);
      setDeliveryTime(DEFAULT_DELIVERY_TIME);
      setIsDeliveryAreaValid(true);
      return { coords, fee: 0, time: DEFAULT_DELIVERY_TIME, isValid: true };
    }
  }, [restaurant, restaurantCoords, deliveryZones]);

  // --- Form Setup ---
  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      cpf_cnpj: '',
      delivery_option: 'delivery',
      notes: '',
      payment_method_id: '',
      change_for: '', // Definindo como string vazia
    },
    mode: 'onBlur',
  });
  
  const addressForm = useForm<AddressFormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      zip_code: '',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
    },
    mode: 'onBlur',
  });
  
  // Watchers
  const deliveryOption = form.watch('delivery_option');
  const selectedPaymentMethodId = form.watch('payment_method_id');
  const selectedPaymentMethod = paymentMethods?.find(m => m.id === selectedPaymentMethodId);
  const isOnlinePayment = selectedPaymentMethod?.name?.includes('online');
  const isCashPayment = selectedPaymentMethod?.name?.includes('Dinheiro');
  const totalAmount = cartSubtotal + deliveryFee;
  
  // Watchers para o formulário de endereço
  const addressFields = addressForm.watch(['zip_code', 'street', 'number', 'city', 'neighborhood']);
  
  // Se a opção de entrega mudar para 'pickup', o endereço é considerado salvo
  useEffect(() => {
    const DEFAULT_PICKUP_TIME: [number, number] = [15, 30]; // Tempo padrão para retirada
    
    if (deliveryOption === 'pickup') {
      setDeliveryFee(0);
      setIsDeliveryAreaValid(true);
      setIsAddressSaved(true);
      setDeliveryTime(DEFAULT_PICKUP_TIME); // Define tempo de retirada
    } else {
      // Se mudar para 'delivery', o endereço precisa ser salvo novamente
      setIsAddressSaved(false);
      setDeliveryTime(null); // Limpa o tempo até o endereço ser salvo
    }
  }, [deliveryOption]);


  // 1. Preencher formulário com dados do cliente logado ou do user_metadata
  useEffect(() => {
    if (customer) {
      // Caso 1: Cliente já tem um registro na tabela 'customers'
      let street = '';
      let number = '';
      let neighborhood = '';
      let city = '';
      let zip_code = '';

      if (customer.address) {
        const parts = customer.address.split(', ').map(p => p.trim());
        
        // Tentativa de parsear o endereço salvo (Rua, Número, Bairro, Cidade, CEP)
        if (parts.length >= 5) {
          street = parts[0];
          number = parts[1];
          neighborhood = parts[2];
          city = parts[3];
          zip_code = parts[4];
        } else if (parts.length >= 4) {
          // Fallback para formatos mais simples
          street = parts[0];
          neighborhood = parts[1];
          city = parts[2];
          zip_code = parts[3];
        }
      }

      form.reset({
        ...form.getValues(),
        name: customer.name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        cpf_cnpj: customer.cpf_cnpj || '',
        change_for: '', // Garante que o campo de troco é resetado para string vazia
      });
      
      addressForm.reset({
        zip_code: zip_code,
        street: street,
        number: number,
        neighborhood: neighborhood,
        city: city,
      });
      
      // Se o cliente tem um endereço salvo, consideramos ele validado inicialmente
      if (customer.address && customer.latitude && customer.longitude) {
          setCustomerCoords([customer.latitude, customer.longitude]);
          setIsAddressSaved(true);
          // Tenta calcular a taxa de entrega imediatamente se o endereço for válido
          calculateFee(zip_code, street, number, city, neighborhood, customer.latitude, customer.longitude);
      }

    } else if (user && !isLoadingCustomer) {
      // Caso 2: Usuário logado, mas sem registro na tabela 'customers'.
      const userMetadata = user.user_metadata;
      
      form.reset({
        ...form.getValues(),
        name: (userMetadata.full_name as string) || '',
        phone: (userMetadata.phone as string) || '',
        email: user.email || '',
        cpf_cnpj: (userMetadata.cpf_cnpj as string) || '',
        change_for: '', // Garante que o campo de troco é resetado para string vazia
      });
    }
  }, [customer, form, user, isLoadingCustomer, addressForm, calculateFee]);

  // 3. Lógica de Troco (Validação manual)
  const changeForString = form.watch('change_for');
  
  useEffect(() => {
    if (isCashPayment && changeForString && changeForString.trim() !== '') {
      const cleanedValue = changeForString.replace(',', '.');
      const changeForValue = parseFloat(cleanedValue);
      
      if (isNaN(changeForValue)) {
        form.setError('change_for', { message: 'O troco deve ser um número válido.' });
      } else if (changeForValue < totalAmount) {
        form.setError('change_for', { message: `O troco deve ser maior ou igual ao total do pedido (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}).` });
      } else {
        form.clearErrors('change_for');
      }
    } else {
      form.clearErrors('change_for');
    }
  }, [isCashPayment, changeForString, totalAmount, form]);
  
  // 4. Mutação para salvar APENAS o endereço (chamada pelo botão Salvar Endereço)
  const saveAddressMutation = useMutation({
    mutationFn: async (data: AddressFormValues & { lat: number, lng: number, fee: number, time: [number, number] | null }): Promise<Customer> => {
      const userAuth = await supabase.auth.getUser();
      const userId = userAuth.data.user?.id;
      
      if (!customer?.id && !userId) throw new Error('ID do cliente ou usuário não encontrado.');
      
      // Endereço completo formatado: Rua, Número, Bairro, Cidade, CEP
      const fullAddress = `${data.street}, ${data.number}, ${data.neighborhood}, ${data.city}, ${data.zip_code}`;
      
      const addressPayload: TablesInsert<'customers'> = {
        user_id: user?.id || null,
        name: form.getValues('name'), // Usa o nome atual do formulário principal
        phone: form.getValues('phone'), // Usa o telefone atual do formulário principal
        email: form.getValues('email') || null,
        cpf_cnpj: form.getValues('cpf_cnpj') || null,
        address: fullAddress,
        latitude: data.lat,
        longitude: data.lng,
      };

      if (customer?.id) {
        // Atualiza cliente existente
        const { data: updatedCustomer, error: updateError } = await supabase
          .from('customers')
          .update(addressPayload as TablesUpdate<'customers'>)
          .eq('id', customer.id)
          .select()
          .single();
        if (updateError) throw updateError;
        return updatedCustomer;
      } else if (userId) {
        // Cria novo cliente vinculado ao user_id
        const { data: newCustomer, error: insertError } = await supabase
          .from('customers')
          .insert(addressPayload)
          .select()
          .single();
        if (insertError) throw insertError;
        return newCustomer;
      } else {
        // Cliente anônimo: não salvamos o endereço no DB, apenas validamos
        // Retorna um objeto Customer mockado para prosseguir
        return { id: 'anonymous', user_id: null, name: addressPayload.name, phone: addressPayload.phone, email: addressPayload.email, address: fullAddress, created_at: '', updated_at: '', latitude: data.lat, longitude: data.lng, cpf_cnpj: addressPayload.cpf_cnpj };
      }
    },
    onSuccess: (newCustomer, variables) => {
      // Se for anônimo, não invalida o cache, mas atualiza o estado local
      if (newCustomer.id !== 'anonymous') {
        queryClient.invalidateQueries({ queryKey: ['checkoutCustomerData'] });
      }
      
      setDeliveryFee(variables.fee);
      setDeliveryTime(variables.time);
      setIsDeliveryAreaValid(variables.isValid);
      setIsAddressSaved(true);
      setCustomerCoords([variables.lat, variables.lng]); // Atualiza as coordenadas do cliente
      toast.success('Endereço salvo e taxa de entrega calculada!');
    },
    onError: (err) => {
      toast.error(`Erro ao salvar endereço: ${err.message}`);
      setIsAddressSaved(false);
    }
  });
  
  const handleSaveAddress = async () => {
    if (deliveryOption === 'pickup') return;
    
    const isValid = await addressForm.trigger();
    if (!isValid) {
      toast.error("Preencha todos os campos obrigatórios do endereço.");
      return;
    }
    
    const data = addressForm.getValues();
    
    // 1. Calcula a taxa e obtém as coordenadas
    const feeResult = await calculateFee(data.zip_code, data.street, data.number, data.city, data.neighborhood);
    
    if (!feeResult.isValid) {
        setIsAddressSaved(false);
        return;
    }
    
    if (!feeResult.coords) {
        toast.error("Não foi possível obter as coordenadas para salvar o endereço.");
        setIsAddressSaved(false);
        return;
    }
    
    // 2. Salva o endereço no DB (se logado) ou apenas valida (se anônimo)
    saveAddressMutation.mutate({ 
        ...data, 
        lat: feeResult.coords.lat, 
        lng: feeResult.coords.lng,
        fee: feeResult.fee,
        time: feeResult.time,
        isValid: feeResult.isValid,
    });
  };

  // --- Mutações de Pedido (Inalteradas, mas dependem do customerId) ---

  const createCustomerMutation = useMutation({
    mutationFn: async (data: CheckoutFormValues): Promise<Customer> => {
      const userAuth = await supabase.auth.getUser();
      const userId = userAuth.data.user?.id;
      
      const cleanedPhone = data.phone.replace(/\D/g, '');
      const cleanedCpfCnpj = data.cpf_cnpj?.replace(/\D/g, '') || null;
      
      const customerPayload: TablesInsert<'customers'> = {
        user_id: user?.id || null,
        name: data.name,
        phone: cleanedPhone,
        email: data.email || null,
        cpf_cnpj: cleanedCpfCnpj,
        // Endereço e coordenadas são obtidos do estado/addressForm se for delivery
        address: deliveryOption === 'delivery' ? `${addressFields[1]}, ${addressFields[2]}, ${addressFields[4]}, ${addressFields[3]}, ${addressFields[0]}` : null,
        latitude: customerCoords ? customerCoords[0] : null,
        longitude: customerCoords ? customerCoords[1] : null,
      };

      // Se o usuário estiver logado, tenta encontrar/atualizar o cliente
      if (user) {
        if (customer) {
          // Atualiza cliente existente
          const { data: updatedCustomer, error: updateError } = await supabase
            .from('customers')
            .update(customerPayload as TablesUpdate<'customers'>)
            .eq('id', customer.id)
            .select()
            .single();
          if (updateError) throw updateError;
          return updatedCustomer;
        } else {
          // Cria novo cliente vinculado ao user_id
          const { data: newCustomer, error: insertError } = await supabase
            .from('customers')
            .insert(customerPayload)
            .select()
            .single();
          if (insertError) throw insertError;
          return newCustomer;
        }
      } else {
        // Cria cliente anônimo (user_id = null)
        const { data: newCustomer, error: insertError } = await supabase
          .from('customers')
          .insert(customerPayload)
          .select()
          .single();
        if (insertError) throw insertError;
        return newCustomer;
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
      
      // Processa o valor de change_for (agora é uma string)
      let changeForValue: number | null = null;
      if (isCashPayment && data.change_for && data.change_for.trim() !== '') {
        const cleanedValue = data.change_for.replace(',', '.');
        const numValue = parseFloat(cleanedValue);
        
        // A validação de que é um número e é maior que o total já foi feita no useEffect
        if (!isNaN(numValue) && numValue > totalAmount) {
          changeForValue = numValue;
        }
      }
      
      // Determina o tempo de entrega a ser salvo
      const [minTime, maxTime] = deliveryTime || [null, null];
      
      const orderPayload: TablesInsert<'orders'> = {
        restaurant_id: restaurant.id,
        customer_id: customerId,
        status: isOnlinePayment ? 'pending_payment' : 'pending',
        total_amount: totalAmount,
        delivery_fee: deliveryFee,
        // Usa o endereço salvo/validado
        delivery_address: deliveryOption === 'delivery' ? `${addressFields[1]}, ${addressFields[2]}, ${addressFields[4]}, ${addressFields[3]}, ${addressFields[0]}` : null,
        notes: data.notes,
        payment_method_id: data.payment_method_id,
        // O change_for é null se o campo estiver vazio ou inválido
        change_for: changeForValue,
        // NOVO: Salva o tempo de entrega
        min_delivery_time_minutes: minTime,
        max_delivery_time_minutes: maxTime,
      };

      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id')
        .single();

      if (orderError) throw orderError;

      // Inserir itens do pedido
      const orderItemsPayload: TablesInsert<'order_items'>[] = items.map(item => ({
        order_id: newOrder.id,
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.price,
        subtotal: item.subtotal,
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
      // O redirecionamento é tratado no onSubmit
    },
    onError: (err) => {
      toast.error(`Erro ao criar pedido: ${err.message}`);
    }
  });

  // --- Submissão Principal ---

  const onSubmit = async (data: CheckoutFormValues) => {
    console.log("LOG: onSubmit iniciado.");
    console.log("LOG: isOnlinePayment:", isOnlinePayment);
    console.log("LOG: deliveryOption:", deliveryOption);
    console.log("LOG: isAddressSaved:", isAddressSaved);
    console.log("LOG: change_for data:", data.change_for);
    
    // Validação manual do troco antes de prosseguir
    if (isCashPayment && data.change_for && data.change_for.trim() !== '') {
      const cleanedValue = data.change_for.replace(',', '.');
      const changeForValue = parseFloat(cleanedValue);
      
      if (isNaN(changeForValue)) {
        toast.error('O troco deve ser um número válido.');
        return;
      }
      if (changeForValue < totalAmount) {
        form.setError('change_for', { type: 'manual', message: `O troco deve ser maior ou igual ao total do pedido (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}).` });
        return;
      }
    }
    
    if (items.length === 0) {
      toast.error('Seu carrinho está vazio.');
      navigate('/menu');
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
    
    // 1. Cria/Atualiza o cliente (usando os dados pessoais do form principal e o endereço salvo)
    try {
      console.log("LOG: Criando/Atualizando cliente...");
      const newCustomer = await createCustomerMutation.mutateAsync(data);
      customerId = newCustomer.id;
      console.log("LOG: Cliente ID:", customerId);
    } catch (e: any) {
      toast.error(`Falha ao salvar cliente: ${e.message}`);
      return;
    }

    // 2. Cria o pedido
    let orderId: string;
    try {
      console.log("LOG: Criando pedido...");
      orderId = await createOrderMutation.mutateAsync({ customerId, data });
      console.log("LOG: Pedido ID:", orderId);
    } catch (e: any) {
      toast.error(`Falha ao criar pedido: ${e.message}`);
      return;
    }

    // 3. Processa o pagamento (se online) ou redireciona para sucesso
    if (isOnlinePayment) {
      console.log("LOG: Iniciando checkout Mercado Pago...");
      await handleMercadoPagoCheckout(orderId, data);
    } else {
      // Pagamento na entrega ou retirada
      console.log("LOG: Pagamento na entrega/retirada. Redirecionando para sucesso.");
      clearCart();
      navigate(`/order-success/${orderId}`, { replace: true });
    }
  };
  
  // --- Lógica Mercado Pago ---
  
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
      console.log("LOG: Chamando Edge Function create-payment-preference...");
      const { data: mpData, error: mpError } = await supabase.functions.invoke('create-payment-preference', {
        body: {
          orderId: orderId,
          items: itemsPayload,
          totalAmount: totalAmount,
          restaurantName: restaurant.name,
          clientUrl: clientUrl,
          customerEmail: data.email || user?.email || 'cliente@anonimo.com',
          customerCpfCnpj: data.cpf_cnpj,
        },
      });

      if (mpError) throw mpError;
      
      const { init_point } = mpData as { init_point: string };
      
      console.log("LOG: Preferência MP criada. init_point:", init_point);
      
      setMpPreferenceId(orderId);
      setMpInitPoint(init_point);
      setIsMercadoPagoOpen(true); // Abre o modal APENAS se a preferência for criada
      
      toast.dismiss(loadingToastId);
      
    } catch (error: any) {
      console.error("Erro ao criar preferência MP:", error);
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

  // --- Renderização ---

  // Se o ID do restaurante não estiver disponível, mostra erro/loading
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
    useEffect(() => { navigate(`/menu/${restaurantId}`); }, [navigate, restaurantId]);
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
  
  // Bloqueia o checkout se for delivery e o endereço não foi salvo/validado
  const isCheckoutDisabled = isFormSubmitting || isGeocoding || (deliveryOption === 'delivery' && !isAddressSaved);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      {/* Modal de Edição de Perfil do Cliente */}
      <CustomerProfileModal 
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        customer={customer}
      />
      
      {/* Componente de Pagamento Mercado Pago (abre o modal/redirect) */}
      {isMercadoPagoOpen && mpInitPoint && (
        <MercadoPagoPayment 
          preferenceId={mpPreferenceId!}
          initPoint={mpInitPoint}
          onClose={() => setIsMercadoPagoOpen(false)}
        />
      )}

      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Finalizar Pedido</h1>
            {/* NOVO: Nome do Restaurante */}
            <p className="text-lg text-muted-foreground font-medium">{restaurant.name}</p>
          </div>
          {user && (
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setIsProfileModalOpen(true)}
                aria-label="Meu Perfil"
              >
                <UserIcon className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-1" /> Sair
              </Button>
            </div>
          )}
        </div>
        
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Coluna 1 & 2: Formulário de Checkout */}
          <div className="lg:col-span-2 space-y-6">
            
            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  Seus Dados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-muted-foreground">
                    {user 
                      ? `Logado como ${user.email}. ${customer ? 'Perfil de cliente encontrado.' : 'Preencha os dados para criar seu perfil de cliente.'}` 
                      : 'Você está fazendo um pedido anônimo.'
                    }
                  </p>
                </div>
                <form onSubmit={form.handleSubmit(onSubmit)} id="checkout-form">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome Completo *</Label>
                      <Input id="name" {...form.register('name')} />
                      {form.formState.errors.name && <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone *</Label>
                      <Controller
                        name="phone"
                        control={form.control}
                        render={({ field }) => <PhoneInput id="phone" {...field} />}
                      />
                      {form.formState.errors.phone && <p className="text-destructive text-sm">{form.formState.errors.phone.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email (Opcional)</Label>
                      <Input id="email" type="email" {...form.register('email')} />
                      {form.formState.errors.email && <p className="text-destructive text-sm">{form.formState.errors.email.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cpf_cnpj">CPF/CNPJ (Opcional)</Label>
                      <Controller
                        name="cpf_cnpj"
                        control={form.control}
                        render={({ field }) => <CpfCnpjInput id="cpf_cnpj" {...field} />}
                      />
                      {form.formState.errors.cpf_cnpj && <p className="text-destructive text-sm">{form.formState.errors.cpf_cnpj.message}</p>}
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
            
            {/* Opção de Entrega */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  Opção de Entrega
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Controller
                  name="delivery_option"
                  control={form.control}
                  render={({ field }) => (
                    <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-2 gap-4">
                      <Label htmlFor="delivery" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary cursor-pointer">
                        <RadioGroupItem value="delivery" id="delivery" className="sr-only" />
                        <Truck className="mb-3 h-6 w-6" />
                        Entrega
                      </Label>
                      <Label htmlFor="pickup" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary cursor-pointer">
                        <RadioGroupItem value="pickup" id="pickup" className="sr-only" />
                        <MapPin className="mb-3 h-6 w-6" />
                        Retirada no Local
                      </Label>
                    </RadioGroup>
                  )}
                />
              </CardContent>
            </Card>

            {/* Endereço de Entrega (se delivery_option for 'delivery') */}
            {deliveryOption === 'delivery' && (
              <Card className={cn(!isAddressSaved && "border-destructive ring-2 ring-destructive/50")}>
                <CardHeader>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    Endereço de Entrega
                    {isAddressSaved && <CheckCircle className="h-5 w-5 text-green-500 ml-2" />}
                    {!isAddressSaved && <AlertCircle className="h-5 w-5 text-destructive ml-2" />}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Preencha e salve o endereço para calcular a taxa de entrega.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Aviso se a entrega dinâmica estiver desativada, mas o frete for grátis */}
                  {restaurant.delivery_enabled === false && (
                    <Alert variant="default" className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 text-blue-700">
                      <Truck className="h-4 w-4" />
                      <AlertTitle>Frete Grátis Ativo</AlertTitle>
                      <AlertDescription>As taxas de entrega dinâmica estão desativadas. O frete será R$ 0,00.</AlertDescription>
                    </Alert>
                  )}
                  
                  <form onSubmit={(e) => { e.preventDefault(); handleSaveAddress(); }} id="address-form" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2 md:col-span-1">
                        <Label htmlFor="zip_code">CEP *</Label>
                        <Controller
                          name="zip_code"
                          control={addressForm.control}
                          render={({ field }) => <ZipCodeInput id="zip_code" {...field} />}
                        />
                        {addressForm.formState.errors.zip_code && <p className="text-destructive text-sm">{addressForm.formState.errors.zip_code.message}</p>}
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="street">Rua *</Label>
                        <Input id="street" {...addressForm.register('street')} />
                        {addressForm.formState.errors.street && <p className="text-destructive text-sm">{addressForm.formState.errors.street.message}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="number">Número *</Label>
                        <Input id="number" {...addressForm.register('number')} />
                        {addressForm.formState.errors.number && <p className="text-destructive text-sm">{addressForm.formState.errors.number.message}</p>}
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="neighborhood">Bairro *</Label>
                        <Input id="neighborhood" {...addressForm.register('neighborhood')} />
                        {addressForm.formState.errors.neighborhood && <p className="text-destructive text-sm">{addressForm.formState.errors.neighborhood.message}</p>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade *</Label>
                        <Input id="city" {...addressForm.register('city')} />
                      {addressForm.formState.errors.city && <p className="text-destructive text-sm">{addressForm.formState.errors.city.message}</p>}
                    </div>
                    
                    <Button 
                        type="submit" 
                        className="w-full h-10 text-base mt-4"
                        disabled={saveAddressMutation.isPending || isGeocoding} // Não desabilita se delivery_enabled for false
                    >
                        {saveAddressMutation.isPending || isGeocoding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        Salvar Endereço e Calcular Taxa
                    </Button>
                  </form>
                  
                  {isGeocoding && (
                    <Alert className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <AlertTitle>Calculando Taxa de Entrega...</AlertTitle>
                    </Alert>
                  )}
                  
                  {/* Mensagens de status da entrega */}
                  {isAddressSaved && !isGeocoding && (
                    <>
                      {/* Caso 1: Entrega Dinâmica ATIVA e Fora da Área */}
                      {restaurant.delivery_enabled !== false && !isDeliveryAreaValid && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Fora da Área de Entrega</AlertTitle>
                          <AlertDescription>Seu endereço está fora da área de cobertura do restaurante.</AlertDescription>
                        </Alert>
                      )}
                      
                      {/* Caso 2: Entrega Dinâmica ATIVA e Dentro da Área (ou Frete Grátis ATIVO) */}
                      {(restaurant.delivery_enabled === false || (isDeliveryAreaValid && deliveryTime)) && (
                        <Alert variant="default" className="bg-green-50 dark:bg-green-900/20 border-green-200 text-green-700">
                          <Truck className="h-4 w-4" />
                          <AlertTitle>Entrega Disponível</AlertTitle>
                          <AlertDescription>
                            Taxa de entrega: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deliveryFee)}. 
                            Tempo estimado: {deliveryTime ? `${deliveryTime[0]} - ${deliveryTime[1]}` : '30 - 45'} minutos.
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  )}
                  
                  {/* Mapa do Cliente após salvar o endereço */}
                  {isAddressSaved && customerCoords && (
                    <div className="mt-6">
                      <ClientLocationMap 
                        latitude={customerCoords[0]} 
                        longitude={customerCoords[1]} 
                        address={`${addressFields[1]}, ${addressFields[2]} - ${addressFields[4]}, ${addressFields[3]}, ${addressFields[0]}`} 
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Método de Pagamento */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Método de Pagamento *
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Controller
                  name="payment_method_id"
                  control={form.control}
                  render={({ field }) => (
                    <RadioGroup onValueChange={field.onChange} value={field.value} className="space-y-3">
                      {paymentMethods?.map(method => {
                        const isMpOnline = method.name?.includes('online') && !mpPublicKey;
                        
                        return (
                          <Label 
                            key={method.id} 
                            htmlFor={method.id} 
                            className={cn(
                              "flex items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary cursor-pointer",
                              isMpOnline && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <div className="flex items-center space-x-3">
                              <RadioGroupItem value={method.id} id={method.id} disabled={isMpOnline} />
                              <div>
                                <p className="font-medium">{method.name}</p>
                                <p className="text-xs text-muted-foreground">{method.description}</p>
                                {isMpOnline && (
                                  <p className="text-xs text-destructive mt-1">Pagamento online indisponível (Chave Pública não configurada).</p>
                                )}
                              </div>
                            </div>
                          </Label>
                        );
                      })}
                    </RadioGroup>
                  )}
                />
                {form.formState.errors.payment_method_id && <p className="text-destructive text-sm mt-2">{form.formState.errors.payment_method_id.message}</p>}
              </CardContent>
            </Card>
            
            {/* Troco (se for dinheiro) */}
            {isCashPayment && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    Troco
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label htmlFor="change_for">Precisa de troco para quanto? (Opcional)</Label>
                    <Input 
                      id="change_for" 
                      type="number" 
                      step="0.01" 
                      placeholder={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}
                      // REMOVENDO valueAsNumber: true para garantir que o valor vazio seja tratado como string vazia
                      {...form.register('change_for')} 
                    />
                    {/* Exibe erro específico do Zod, se houver */}
                    {form.formState.errors.change_for?.message && (
                      <p className="text-destructive text-sm">{form.formState.errors.change_for.message}</p>
                    )}
                    {/* Exibe erro manual de validação de valor */}
                    {form.formState.errors.change_for?.type === 'manual' && (
                      <p className="text-destructive text-sm">{form.formState.errors.change_for.message}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Observações */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  Observações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notas para o restaurante (Opcional)</Label>
                  <Textarea id="notes" {...form.register('notes')} rows={3} placeholder="Ex: Entregar na portaria, sem pimenta, etc." />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Coluna 3: Resumo do Pedido */}
          <div className="lg:col-span-1 space-y-6 sticky top-4 self-start">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-2xl">Resumo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                  {items.map((item) => (
                    <div key={item.product.id} className="flex justify-between text-sm">
                      <span className="truncate max-w-[70%]">{item.quantity}x {item.product.name}</span>
                      <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
                
                <Separator />
                
                <div className="space-y-1">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Taxa de Entrega</span>
                    <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deliveryFee)}</span>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex justify-between font-bold text-xl">
                  <span>Total</span>
                  <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}</span>
                </div>
                
                <Button 
                  type="submit" 
                  form="checkout-form"
                  className="w-full h-12 text-lg"
                  disabled={isCheckoutDisabled}
                >
                  {isCheckoutDisabled ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    isOnlinePayment ? 'Pagar e Finalizar' : 'Confirmar Pedido'
                  )}
                </Button>
                
                {deliveryOption === 'delivery' && !isAddressSaved && (
                    <Alert variant="destructive" className="mt-3">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">Salve o endereço acima para continuar.</AlertDescription>
                    </Alert>
                )}
                
                {/* CORREÇÃO AQUI: Usando o ID do restaurante para o link do menu */}
                <Link to={`/menu/${restaurant.id}`} className="block text-center text-sm text-muted-foreground hover:underline mt-2">
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