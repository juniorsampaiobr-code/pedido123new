import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Minus, Plus, ShoppingCart } from 'lucide-react';
import { useCart } from '@/hooks/use-cart';
import { Tables } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';

type Product = Tables<'products'>;

const formSchema = z.object({
  quantity: z.number().min(1, 'Mínimo 1 item.'),
  notes: z.string().max(255, 'Máximo de 255 caracteres.').optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface ProductDetailsModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ProductDetailsModal = ({ product, isOpen, onClose }: ProductDetailsModalProps) => {
  const { addItem } = useCart();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      quantity: 1,
      notes: '',
    },
    values: {
      quantity: 1,
      notes: '',
    }
  });

  const currentQuantity = form.watch('quantity');

  const handleQuantityChange = (delta: number) => {
    const newQuantity = currentQuantity + delta;
    if (newQuantity >= 1) {
      form.setValue('quantity', newQuantity);
    }
  };

  const onSubmit = (data: FormValues) => {
    if (!product) return;

    addItem({
      product_id: product.id,
      name: product.name,
      price: product.price,
      quantity: data.quantity,
      notes: data.notes || undefined,
      image_url: product.image_url,
    });
    
    onClose();
    form.reset({ quantity: 1, notes: '' });
  };

  if (!product) return null;

  const totalItemPrice = product.price * currentQuantity;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] p-0">
        <div className="relative">
          <img 
            src={product.image_url || '/placeholder.svg'} 
            alt={product.name} 
            className="w-full h-48 object-cover" 
          />
          <DialogHeader className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent p-4 flex flex-col justify-end items-start text-left space-y-0">
            <DialogTitle className="text-2xl font-bold text-white drop-shadow-md">
              {product.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Detalhes e opções de personalização para {product.name}.
            </DialogDescription>
          </DialogHeader>
        </div>
        
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">{product.description}</p>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              
              {/* Quantity Control */}
              <div className="flex items-center justify-between border-y py-3">
                <FormLabel className="text-base font-semibold">Quantidade</FormLabel>
                <div className="flex items-center gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="icon" 
                    onClick={() => handleQuantityChange(-1)}
                    disabled={currentQuantity <= 1}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center font-bold text-lg">{currentQuantity}</span>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="icon" 
                    onClick={() => handleQuantityChange(1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações (Ex: Sem cebola)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Adicione notas sobre o pedido..." {...field} rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className={cn("pt-4", "sm:justify-between sm:space-x-0")}>
                <div className="text-xl font-bold text-foreground hidden sm:block">
                  Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalItemPrice)}
                </div>
                <Button 
                  type="submit" 
                  className="w-full sm:w-auto h-12 text-lg"
                  disabled={form.formState.isSubmitting}
                >
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  Adicionar ao Pedido
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
};