import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { useCart } from '@/hooks/use-cart';
import { Tables } from '@/integrations/supabase/types';
import { ShoppingCart } from 'lucide-react';

type Product = Tables<'products'>;

const formSchema = z.object({
  weight_in_grams: z.coerce
    .number({ invalid_type_error: 'Deve ser um número.' })
    .positive('A quantidade deve ser maior que zero.'),
});

type FormValues = z.infer<typeof formSchema>;

interface WeightProductModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export const WeightProductModal = ({ product, isOpen, onClose }: WeightProductModalProps) => {
  const { addItem } = useCart();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      // Alterando o valor padrão para undefined para que o campo comece vazio
      weight_in_grams: undefined, 
    },
  });

  const weightInGrams = form.watch('weight_in_grams');

  const calculatedPrice = useMemo(() => {
    if (!product || !weightInGrams || weightInGrams <= 0) return 0;
    const pricePerGram = product.price / 1000;
    return pricePerGram * weightInGrams;
  }, [product, weightInGrams]);

  const onSubmit = (data: FormValues) => {
    if (!product) return;

    addItem({
      product_id: product.id,
      name: `${product.name} (${data.weight_in_grams}g)`,
      price: calculatedPrice,
      quantity: 1, // For weighted items, quantity is always 1
      image_url: product.image_url,
      is_price_by_weight: true,
    });
    
    onClose();
    // Resetando para undefined para garantir que o campo esteja vazio na próxima abertura
    form.reset({ weight_in_grams: undefined }); 
  };

  if (!product) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl">Quanto você deseja?</DialogTitle>
          <DialogDescription>
            <span className="block text-lg font-semibold mt-2">{product.name}</span>
            <span className="block text-muted-foreground">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price)} por kg
            </span>
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <FormField
              control={form.control}
              name="weight_in_grams"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Quantidade em gramas</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="Ex: 500" 
                      className="h-12 text-lg text-center"
                      {...field} 
                      // Corrigindo o aviso de input não controlado/controlado
                      // O valor agora será uma string vazia se for undefined/null
                      value={field.value === undefined || field.value === null ? '' : String(field.value)}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Se o valor for vazio, definimos como undefined para o formulário
                        field.onChange(value === '' ? undefined : parseFloat(value));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between sm:space-x-2 w-full">
              <div className="text-xl font-bold text-foreground text-center sm:text-left mb-4 sm:mb-0">
                Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculatedPrice)}
              </div>
              <Button 
                type="submit" 
                className="w-full sm:w-auto h-12 text-lg"
                disabled={form.formState.isSubmitting || !form.formState.isValid}
              >
                <ShoppingCart className="h-5 w-5 mr-2" />
                Adicionar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};