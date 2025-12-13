import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/PhoneInput';
import { CpfCnpjInput } from '@/components/CpfCnpjInput'; // Importando CpfCnpjInput
import { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { User, Save, Loader2, Mail, Store, Phone, CreditCard } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';

type Profile = Tables<'profiles'>;
type Restaurant = Tables<'restaurants'>;

// Tipo de dados combinados para o fetch
interface AdminProfileData {
  profile: Profile;
  restaurant: Restaurant | null;
}

const cleanPhoneNumber = (phone: string) => phone.replace(/\D/g, '');
const cleanCpfCnpj = (doc: string) => doc.replace(/\D/g, '');

const profileSchema = z.object({
  full_name: z.string().min(1, 'Nome é obrigatório.'),
  phone: z.string().min(1, 'Telefone é obrigatório.').transform(cleanPhoneNumber).refine(val => val.length >= 10, {
    message: 'O telefone deve ter pelo menos 10 dígitos (incluindo DDD).',
  }),
  store_name: z.string().min(1, 'O nome da loja é obrigatório.'),
  // NOVO CAMPO: CPF/CNPJ
  cpf_cnpj: z.string().min(1, 'CPF/CNPJ é obrigatório.').transform(cleanCpfCnpj).refine(val => val.length === 11 || val.length === 14, {
    message: 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.',
  }),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface AdminProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
}

const fetchAdminProfile = async (userId: string): Promise<AdminProfileData> => {
  // 1. Buscar Perfil
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .limit(1)
    .single();

  if (profileError && profileError.code !== 'PGRST116') {
    throw new Error(`Erro ao buscar perfil: ${profileError.message}`);
  }
  
  // Se o perfil não existir, cria um objeto Profile padrão
  const profile: Profile = profileData || { id: userId, full_name: null, phone: null, avatar_url: null, created_at: null, updated_at: null };

  // 2. Buscar Restaurante (Nome da Loja)
  const { data: restaurantData, error: restaurantError } = await supabase
    .from('restaurants')
    .select('*')
    .eq('owner_user_id', userId)
    .limit(1)
    .single();
    
  if (restaurantError && restaurantError.code !== 'PGRST116') {
    console.warn("Erro ao buscar restaurante vinculado ao usuário:", restaurantError.message);
  }

  return { profile, restaurant: restaurantData || null };
};

export const AdminProfileModal = ({ isOpen, onClose, userId }: AdminProfileModalProps) => {
  const queryClient = useQueryClient();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userCpfCnpj, setUserCpfCnpj] = useState<string | null>(null); // NOVO: Estado para CPF/CNPJ

  const { data: profileData, isLoading } = useQuery<AdminProfileData>({
    queryKey: ['adminProfile', userId],
    queryFn: () => fetchAdminProfile(userId!),
    enabled: !!userId && isOpen,
    staleTime: 0,
  });
  
  // Efeito para carregar o email e CPF/CNPJ do user_metadata
  useEffect(() => {
    if (isOpen) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUserEmail(session?.user?.email || null);
        // NOVO: Carrega CPF/CNPJ do user_metadata
        setUserCpfCnpj(session?.user?.user_metadata?.cpf_cnpj as string || null);
      });
    }
  }, [isOpen]);


  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: '',
      phone: '',
      store_name: '',
      cpf_cnpj: '', // Novo default
    },
  });

  useEffect(() => {
    if (profileData) {
      // Preenche o formulário com os dados do perfil, restaurante e CPF/CNPJ do estado local
      form.reset({
        full_name: profileData.profile.full_name || '',
        phone: profileData.profile.phone || '',
        store_name: profileData.restaurant?.name || '',
        cpf_cnpj: userCpfCnpj || '', // Usa o CPF/CNPJ carregado do user_metadata
      });
    }
  }, [profileData, form, userCpfCnpj]); // Depende de userCpfCnpj

  const mutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      if (!userId) throw new Error('ID do usuário não encontrado.');
      
      // 1. Atualizar Perfil (full_name, phone)
      const profileUpdateData: TablesUpdate<'profiles'> = {
        full_name: data.full_name,
        phone: data.phone,
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdateData)
        .eq('id', userId);

      if (profileError) throw new Error(`Erro ao atualizar perfil: ${profileError.message}`);
      
      // 2. Atualizar Restaurante (store_name -> name E phone -> phone)
      if (profileData?.restaurant?.id) {
        const restaurantUpdateData: TablesUpdate<'restaurants'> = {
          name: data.store_name,
          phone: data.phone,
        };
        
        const { error: restaurantError } = await supabase
          .from('restaurants')
          .update(restaurantUpdateData)
          .eq('id', profileData.restaurant.id);
          
        if (restaurantError) throw new Error(`Erro ao atualizar nome/telefone da loja: ${restaurantError.message}`);
      }
      
      // 3. Atualizar CPF/CNPJ no user_metadata (onde ele é armazenado para administradores)
      const { error: authUpdateError } = await supabase.auth.updateUser({
          data: {
              cpf_cnpj: data.cpf_cnpj,
          }
      });
      
      if (authUpdateError) throw new Error(`Erro ao atualizar CPF/CNPJ: ${authUpdateError.message}`);
    },
    onSuccess: (_, variables) => {
      toast.success('Perfil e nome da loja atualizados com sucesso!');
      
      // Atualiza o estado local do CPF/CNPJ para refletir a mudança imediatamente
      setUserCpfCnpj(variables.cpf_cnpj); 
      
      // Invalida todas as queries que dependem desses dados
      queryClient.invalidateQueries({ queryKey: ['adminProfile'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardRestaurant'] }); 
      queryClient.invalidateQueries({ queryKey: ['restaurantSettings'] }); 
      onClose();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar perfil: ${error.message}`);
    },
  });

  const onSubmit = (data: ProfileFormValues) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Meu Perfil (Admin)
          </DialogTitle>
          <DialogDescription>
            Atualize seus dados de contato e o nome da sua loja.
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full mt-6" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              {/* Email (Visível, Não Editável) */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                    <Mail className="h-4 w-4" /> Email
                </Label>
                <Input value={userEmail || 'N/A'} disabled className="bg-muted/50" />
                <p className="text-xs text-muted-foreground">O email não pode ser alterado aqui.</p>
              </div>
              
              {/* Nome da Loja */}
              <FormField
                control={form.control}
                name="store_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                        <Store className="h-4 w-4" /> Nome da Loja *
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Nome do seu restaurante" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Nome Completo */}
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Completo *</FormLabel>
                    <FormControl>
                      <Input placeholder="Seu nome" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Telefone */}
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                        <Phone className="h-4 w-4" /> Telefone *
                    </FormLabel>
                    <FormControl>
                      <PhoneInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* NOVO CAMPO: CPF/CNPJ */}
              <FormField
                control={form.control}
                name="cpf_cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" /> CPF/CNPJ *
                    </FormLabel>
                    <FormControl>
                      <CpfCnpjInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter className="pt-4">
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar Alterações
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
};