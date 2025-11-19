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
import { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { User, Save, Loader2, Mail } from 'lucide-react';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label'; // Importação crítica

type Profile = Tables<'profiles'>;

const cleanPhoneNumber = (phone: string) => phone.replace(/\D/g, '');

const profileSchema = z.object({
  full_name: z.string().min(1, 'Nome é obrigatório.'),
  phone: z.string().min(1, 'Telefone é obrigatório.').transform(cleanPhoneNumber).refine(val => val.length >= 10, {
    message: 'O telefone deve ter pelo menos 10 dígitos (incluindo DDD).',
  }),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface AdminProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
}

const fetchAdminProfile = async (userId: string): Promise<Profile> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Erro ao buscar perfil: ${error.message}`);
  }
  // Se não encontrar, retorna um objeto Profile vazio com o ID do usuário
  if (!data) {
    return { id: userId, full_name: null, phone: null, avatar_url: null, created_at: null, updated_at: null };
  }
  return data;
};

export const AdminProfileModal = ({ isOpen, onClose, userId }: AdminProfileModalProps) => {
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery<Profile>({
    queryKey: ['adminProfile', userId],
    queryFn: () => fetchAdminProfile(userId!),
    enabled: !!userId && isOpen,
    staleTime: 0,
  });
  
  const userEmail = supabase.auth.currentUser?.email;

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: '',
      phone: '',
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
      });
    }
  }, [profile, form]);

  const mutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      if (!userId) throw new Error('ID do usuário não encontrado.');
      
      const updateData: TablesUpdate<'profiles'> = {
        full_name: data.full_name,
        phone: data.phone,
      };

      // Usamos upsert para garantir que o perfil seja criado se não existir (embora o trigger deva cuidar disso)
      const { error } = await supabase
        .from('profiles')
        .upsert({ ...updateData, id: userId }, { onConflict: 'id' });

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Perfil atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['adminProfile'] });
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
            Atualize seus dados de contato.
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full mt-6" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                    <Mail className="h-4 w-4" /> Email
                </Label>
                <Input value={userEmail || 'N/A'} disabled className="bg-muted/50" />
                <p className="text-xs text-muted-foreground">O email não pode ser alterado aqui.</p>
              </div>
              
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
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone *</FormLabel>
                    <FormControl>
                      <PhoneInput {...field} />
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