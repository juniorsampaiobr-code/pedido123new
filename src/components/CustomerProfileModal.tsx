import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { CpfCnpjInput } from '@/components/CpfCnpjInput';
import { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { User, Save, Loader2 } from 'lucide-react';
import { useEffect } from 'react';

type Customer = Tables<'customers'>;

const cleanPhoneNumber = (phone: string) => phone.replace(/\D/g, '');
const cleanCpfCnpj = (doc: string) => doc.replace(/\D/g, '');

const profileSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório.'),
  phone: z.string().min(1, 'Telefone é obrigatório.').transform(cleanPhoneNumber).refine(val => val.length >= 10, {
    message: 'O telefone deve ter pelo menos 10 dígitos (incluindo DDD).',
  }),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  cpf_cnpj: z.string().optional().default('').transform(cleanCpfCnpj).refine(val => val.length === 0 || val.length === 11 || val.length === 14, {
    message: 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.',
  }),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface CustomerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
}

export const CustomerProfileModal = ({ isOpen, onClose, customer }: CustomerProfileModalProps) => {
  const queryClient = useQueryClient();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      cpf_cnpj: '',
    },
  });

  useEffect(() => {
    if (customer) {
      form.reset({
        name: customer.name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        cpf_cnpj: customer.cpf_cnpj || '',
      });
    } else if (isOpen) {
        // Se o modal abrir e o cliente for nulo (e.g., recém-logado), limpa o formulário
        form.reset({
            name: '',
            phone: '',
            email: '',
            cpf_cnpj: '',
        });
    }
  }, [customer, form, isOpen]);

  const mutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      // Se o cliente for nulo, precisamos do user_id para criar um novo registro
      const user = await supabase.auth.getUser();
      const userId = user.data.user?.id;
      
      if (!customer?.id && !userId) throw new Error('ID do cliente ou usuário não encontrado.');
      
      const updateData: TablesUpdate<'customers'> = {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        cpf_cnpj: data.cpf_cnpj || null,
      };

      if (customer?.id) {
        // Atualiza cliente existente
        const { error } = await supabase
          .from('customers')
          .update(updateData)
          .eq('id', customer.id);

        if (error) throw new Error(error.message);
      } else if (userId) {
        // Cria novo cliente se não existir (usando upsert para garantir)
        const insertData = { ...updateData, user_id: userId, id: undefined };
        const { error } = await supabase
          .from('customers')
          .insert(insertData as TablesInsert<'customers'>);
          
        if (error) throw new Error(error.message);
      } else {
        throw new Error('Não foi possível identificar o cliente para salvar.');
      }
    },
    onSuccess: () => {
      toast.success('Perfil atualizado com sucesso!');
      // Invalida a query do cliente no menu/checkout para forçar a atualização
      queryClient.invalidateQueries({ queryKey: ['menuCustomerData'] });
      queryClient.invalidateQueries({ queryKey: ['checkoutCustomerData'] });
      onClose();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar perfil: ${error.message}`);
    },
  });

  const onSubmit = (data: ProfileFormValues) => {
    mutation.mutate(data);
  };

  // Removemos a verificação 'if (!customer) return null;'
  // O modal agora abre, mas os campos podem estar vazios se o cliente for novo.

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Seu Perfil de Cliente
          </DialogTitle>
          <DialogDescription>
            Atualize seus dados de contato e identificação.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="name"
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
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (Opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="seu@email.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cpf_cnpj"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CPF/CNPJ (Opcional)</FormLabel>
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
      </DialogContent>
    </Dialog>
  );
};