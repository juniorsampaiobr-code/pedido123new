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
  DialogFooter,
  DialogClose,
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useState } from 'react';

const categorySchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório.'),
  description: z.string().optional(),
  display_order: z.coerce.number().default(0),
  is_active: z.boolean().default(true),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface AddCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddCategoryModal = ({ isOpen, onClose }: AddCategoryModalProps) => {
  const queryClient = useQueryClient();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  useQuery({
    queryKey: ['restaurantId'],
    queryFn: async () => {
      const { data, error } = await supabase.from('restaurants').select('id').limit(1).single();
      if (error) throw new Error(error.message);
      setRestaurantId(data.id);
      return data.id;
    },
    enabled: isOpen,
  });

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      description: '',
      display_order: 0,
      is_active: true,
    },
  });

  const mutation = useMutation({
    mutationFn: async (newCategory: CategoryFormValues) => {
      if (!restaurantId) throw new Error('ID do restaurante não encontrado.');

      const { error } = await supabase.from('categories').insert({
        restaurant_id: restaurantId,
        name: newCategory.name,
        description: newCategory.description,
        display_order: newCategory.display_order,
        is_active: newCategory.is_active,
      });

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Categoria criada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['categoriesWithProducts'] });
      onClose();
      form.reset();
    },
    onError: (error) => {
      toast.error(`Erro ao criar categoria: ${error.message}`);
    },
  });

  const onSubmit = (data: CategoryFormValues) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nova Categoria</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome da categoria" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Descrição da categoria" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="display_order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ordem de Exibição</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <FormLabel>Categoria Ativa</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Criando...' : 'Criar Categoria'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};