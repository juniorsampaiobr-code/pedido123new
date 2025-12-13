import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';

type Product = Tables<'products'>;
type Category = { id: string; name: string; };

const productSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório.'),
  description: z.string().optional(),
  price: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'O preço deve ser um número.' }).positive('O preço deve ser maior que zero.')
  ),
  category_id: z.string().optional(), // Mantendo opcional para compatibilidade com o DB
  image_url: z.string().url('URL inválida.').optional().or(z.literal('')),
  image_file: z.instanceof(File).optional(),
  is_price_by_weight: z.boolean().default(false),
  is_available: z.boolean().default(true),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface EditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

// Receber restaurantId como parâmetro
const fetchCategories = async (restaurantId: string): Promise<Category[]> => {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  return data;
};

export const EditProductModal = ({ isOpen, onClose, product }: EditProductModalProps) => {
  const queryClient = useQueryClient();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  // Busca o restaurantId do produto sendo editado
  useEffect(() => {
      if (product?.restaurant_id) {
          setRestaurantId(product.restaurant_id);
      }
  }, [product, isOpen]);

  // Usar restaurantId no queryKey
  const { data: categories, isLoading: isLoadingCategories } = useQuery({
    queryKey: ['categories', restaurantId],
    queryFn: () => fetchCategories(restaurantId!),
    enabled: !!restaurantId && isOpen,
  });

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
  });

  useEffect(() => {
    if (product) {
      form.reset({
        name: product.name,
        description: product.description || '',
        price: product.price,
        // Garante que category_id é uma string (ID) ou undefined se for nulo
        category_id: product.category_id || undefined, 
        image_url: product.image_url || '',
        is_price_by_weight: product.is_price_by_weight || false,
        is_available: product.is_available ?? true,
        image_file: undefined,
      });
    }
  }, [product, form, isOpen]);

  const mutation = useMutation({
    mutationFn: async (updatedProduct: ProductFormValues) => {
      if (!product?.id || !restaurantId) throw new Error('ID do produto ou restaurante não encontrado.');

      let imageUrl = product.image_url;

      if (updatedProduct.image_file) {
        const file = updatedProduct.image_file;
        const filePath = `${restaurantId}/${Date.now()}-${file.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from('products')
          .upload(filePath, file);

        if (uploadError) throw new Error(`Erro no upload da imagem: ${uploadError.message}`);

        const { data: publicUrlData } = supabase.storage
          .from('products')
          .getPublicUrl(filePath);
        
        imageUrl = publicUrlData.publicUrl;
      } else {
        imageUrl = updatedProduct.image_url || null;
      }

      const { error } = await supabase
        .from('products')
        .update({
          name: updatedProduct.name,
          description: updatedProduct.description,
          price: updatedProduct.price,
          category_id: updatedProduct.category_id || null, // Salva como null se for undefined/vazio
          image_url: imageUrl,
          is_price_by_weight: updatedProduct.is_price_by_weight,
          is_available: updatedProduct.is_available,
        })
        .eq('id', product.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Produto atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['products', restaurantId] }); // Usar restaurantId
      queryClient.invalidateQueries({ queryKey: ['menuData'] }); // Invalida o menu também
      onClose();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar produto: ${error.message}`);
    },
  });

  const onSubmit = (data: ProductFormValues) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Produto</DialogTitle>
          <DialogDescription>
            Atualize as informações do item do seu cardápio.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-4 py-2 pb-4 max-h-[70vh] overflow-y-auto pr-4">
              <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nome *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Descrição</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>)} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="price" render={({ field }) => (<FormItem><FormLabel>Preço (R$) *</FormLabel><FormControl><Input type="text" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="category_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingCategories || !restaurantId}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma categoria" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories?.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="space-y-2">
                <FormLabel>Imagem do Produto</FormLabel>
                <FormField control={form.control} name="image_file" render={({ field }) => (<FormItem><FormControl><label className="flex items-center justify-center w-full h-12 px-4 border-2 border-dashed rounded-md cursor-pointer hover:bg-muted"><Upload className="w-4 h-4 mr-2" /><span>{field.value?.name || 'Escolher Nova Imagem'}</span><input type="file" className="hidden" accept="image/*" onChange={(e) => field.onChange(e.target.files?.[0])} /></label></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="image_url" render={({ field }) => (<FormItem><FormControl><Input placeholder="Ou cole a URL da imagem" {...field} /></FormControl><FormMessage /></FormItem>)} />
              </div>
              <FormField control={form.control} name="is_price_by_weight" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><FormLabel>Produto pesável (preço por kg)</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
              <FormField control={form.control} name="is_available" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><FormLabel>Produto disponível</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
            </div>
            <DialogFooter className="pt-4 border-t">
              <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
              <Button type="submit" disabled={mutation.isPending || !restaurantId}>
                {mutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};