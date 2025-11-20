import { useState } from 'react';
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
import { Upload, Plus } from 'lucide-react';
import { AddCategoryModal } from './AddCategoryModal'; // Importando o modal de categoria

type Category = {
  id: string;
  name: string;
};

const productSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório.'),
  description: z.string().optional(),
  price: z.preprocess(
    (val) => String(val).replace(',', '.'),
    z.coerce.number({ invalid_type_error: 'O preço deve ser um número.' }).positive('O preço deve ser maior que zero.')
  ),
  category_id: z.string().min(1, 'A categoria é obrigatória.'), // Tornando obrigatório
  image_url: z.string().url('URL inválida.').optional().or(z.literal('')),
  image_file: z.instanceof(File).optional(),
  is_price_by_weight: z.boolean().default(false),
  is_available: z.boolean().default(true),
}).refine(data => data.image_url || data.image_file, {
    message: "É necessário enviar uma imagem ou uma URL.",
    path: ["image_file"],
});

type ProductFormValues = z.infer<typeof productSchema>;

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string | null; // Receber restaurantId como prop
}

const fetchCategories = async (restaurantId: string): Promise<Category[]> => {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  return data;
};

export const AddProductModal = ({ isOpen, onClose, restaurantId }: AddProductModalProps) => {
  const queryClient = useQueryClient();
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false); // Novo estado

  const { data: categories, isLoading: isLoadingCategories } = useQuery({
    queryKey: ['categories', restaurantId],
    queryFn: () => fetchCategories(restaurantId!),
    enabled: !!restaurantId && isOpen, // Só busca se restaurantId estiver disponível e o modal estiver aberto
  });

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      description: '',
      price: 0,
      is_price_by_weight: false,
      is_available: true,
      image_url: '',
      category_id: '', // Definindo como string vazia para validação
    },
  });

  const mutation = useMutation({
    mutationFn: async (newProduct: ProductFormValues) => {
      if (!restaurantId) throw new Error('ID do restaurante não encontrado.');

      let imageUrl = newProduct.image_url;

      if (newProduct.image_file) {
        const file = newProduct.image_file;
        const filePath = `${restaurantId}/${Date.now()}-${file.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from('products')
          .upload(filePath, file);

        if (uploadError) throw new Error(`Erro no upload da imagem: ${uploadError.message}`);

        const { data: publicUrlData } = supabase.storage
          .from('products')
          .getPublicUrl(filePath);
        
        imageUrl = publicUrlData.publicUrl;
      }

      const { error } = await supabase.from('products').insert({
        restaurant_id: restaurantId,
        name: newProduct.name,
        description: newProduct.description,
        price: newProduct.price,
        category_id: newProduct.category_id,
        image_url: imageUrl,
        is_price_by_weight: newProduct.is_price_by_weight,
        is_available: newProduct.is_available,
      });

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Produto criado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
      form.reset();
    },
    onError: (error) => {
      toast.error(`Erro ao criar produto: ${error.message}`);
    },
  });

  const onSubmit = (data: ProductFormValues) => {
    mutation.mutate(data);
  };

  return (
    <>
      <AddCategoryModal 
        isOpen={isCategoryModalOpen} 
        onClose={() => setIsCategoryModalOpen(false)} 
        restaurantId={restaurantId} // Passando o ID do restaurante
      />
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Produto</DialogTitle>
            <DialogDescription>
              Adicione um novo item ao seu cardápio.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-4 py-2 pb-4 max-h-[70vh] overflow-y-auto pr-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome do produto" {...field} />
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
                        <Textarea placeholder="Ingredientes, detalhes, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preço (R$) unitário *</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="0,00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoria *</FormLabel>
                        <div className="flex gap-2">
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
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="icon" 
                            onClick={() => setIsCategoryModalOpen(true)} // Ação corrigida
                            disabled={!restaurantId} // Desabilitar se não tiver restaurantId
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel>Imagem do Produto</FormLabel>
                  <FormField
                    control={form.control}
                    name="image_file"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <label className="flex items-center justify-center w-full h-12 px-4 border-2 border-dashed rounded-md cursor-pointer hover:bg-muted">
                            <Upload className="w-4 h-4 mr-2" />
                            <span>{field.value?.name || 'Escolher Imagem'}</span>
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={(e) => field.onChange(e.target.files?.[0])}
                            />
                          </label>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="image_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input placeholder="Ou cole a URL da imagem" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="is_price_by_weight"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <FormLabel>Produto pesável (preço por kg)</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="is_available"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <FormLabel>Produto disponível</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter className="pt-4 border-t">
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancelar</Button>
                </DialogClose>
                <Button type="submit" disabled={mutation.isPending || !restaurantId}>
                  {mutation.isPending ? 'Criando...' : 'Criar Produto'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
};