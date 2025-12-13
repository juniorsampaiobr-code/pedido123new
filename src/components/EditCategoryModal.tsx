import { useEffect } from 'react';
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
import { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { Save, Loader2 } from 'lucide-react';

type Category = Tables<'categories'>;

const categorySchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório.'),
  description: z.string().optional(),
  display_order: z.coerce.number().default(0),
  is_active: z.boolean().default(true),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface EditCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: Category | null;
  restaurantId: string | null;
}

export const EditCategoryModal = ({ isOpen, onClose, category, restaurantId }: EditCategoryModalProps) => {
  const queryClient = useQueryClient();

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      description: '',
      display_order: 0,
      is_active: true,
    },
  });

  // Preenche o formulário quando a categoria muda ou o modal abre
  useEffect(() => {
    if (category) {
      form.reset({
        name: category.name || '',
        description: category.description || '',
        display_order: category.display_order ?? 0,
        is_active: category.is_active ?? true,
      });
    }
  }, [category, form, isOpen]);

  const mutation = useMutation({
    mutationFn: async (updatedCategory: CategoryFormValues) => {
      if (!category?.id) throw new Error('ID da categoria não encontrado.');

      const updatePayload: TablesUpdate<'categories'> = {
        name: updatedCategory.name,
        description: updatedCategory.description,
        display_order: updatedCategory.display_order,
        is_active: updatedCategory.is_active,
      };

      const { error } = await supabase
        .from('categories')
        .update(updatePayload)
        .eq('id', category.id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Categoria atualizada com sucesso!');
      // Invalida as queries de categorias e produtos para atualizar o menu
      queryClient.invalidateQueries({ queryKey: ['categoriesWithProducts', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['categories', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['menuData'] });
      onClose();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar categoria: ${error.message}`);
    },
  });

  const onSubmit = (data: CategoryFormValues) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Categoria: {category?.name}</DialogTitle>
          <DialogDescription>
            Atualize as informações da categoria.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="" {...field} />
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
                    <Textarea placeholder="" {...field} />
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
                <FormItem className="flex flex-row items-center space-x-3 space-y-0 pt-2">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      id="is_active_edit"
                    />
                  </FormControl>
                  <FormLabel htmlFor="is_active_edit" className="font-normal cursor-pointer">
                    Ativa
                  </FormLabel>
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={mutation.isPending || !category?.id}>
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