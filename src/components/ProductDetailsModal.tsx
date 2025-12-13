import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Minus, ShoppingCart, DollarSign, Scale, X } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';

type Product = Tables<'products'>;

interface ProductDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  onAddToCart: (quantity: number, notes: string) => void;
  isCheckoutBlocked: boolean; // Nova prop
}

const ProductDetailsModalComponent = ({ isOpen, onClose, product, onAddToCart, isCheckoutBlocked }: ProductDetailsModalProps) => {
  const [quantity, setQuantity] = useState(product.is_price_by_weight ? 0.5 : 1);
  // O estado 'notes' é mantido, mas será sempre passado como string vazia
  const notes = ''; 

  React.useEffect(() => {
    if (isOpen) {
      setQuantity(product.is_price_by_weight ? 0.5 : 1);
      // setNotes(''); // Removido, pois notes não é mais usado
    }
  }, [isOpen, product.is_price_by_weight]);

  const handleQuantityChange = (amount: number) => {
    setQuantity(prev => {
      const step = product.is_price_by_weight ? 0.1 : 1;
      const newQty = Math.max(step, prev + amount);
      // Arredonda para 1 casa decimal se for por peso
      return product.is_price_by_weight ? parseFloat(newQty.toFixed(1)) : Math.round(newQty);
    });
  };

  const handleConfirm = () => {
    if (quantity <= 0) return;
    // Passa string vazia para notes
    onAddToCart(quantity, ''); 
    onClose();
  };

  const subtotal = product.price * quantity;
  const formatPrice = (price: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] p-0">
        <div className="relative">
          <img
            src={product.image_url || '/placeholder.svg'}
            alt={product.name}
            className="w-full h-48 object-cover"
          />
          {/* REMOVIDO: O botão de fechar customizado. O DialogContent padrão já fornece o 'X' no canto superior direito. */}
        </div>
        
        <div className="p-6 space-y-4">
          <DialogHeader className="p-0">
            <DialogTitle className="text-2xl font-bold">{product.name}</DialogTitle>
            <DialogDescription className="text-sm">
              {product.description || 'Sem descrição disponível.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between border-y py-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <span className="text-lg font-semibold">
                {formatPrice(product.price)}
                {product.is_price_by_weight && <span className="text-sm font-normal text-muted-foreground"> / kg</span>}
              </span>
            </div>
            
            <div className="flex items-center border rounded-md h-10">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10"
                onClick={() => handleQuantityChange(product.is_price_by_weight ? -0.1 : -1)}
                disabled={quantity <= (product.is_price_by_weight ? 0.1 : 1) || isCheckoutBlocked}
              >
                <Minus className="h-5 w-5" />
              </Button>
              <Input
                type={product.is_price_by_weight ? "number" : "text"}
                step={product.is_price_by_weight ? "0.1" : "1"}
                value={product.is_price_by_weight ? quantity.toFixed(1) : quantity}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (value > 0) {
                    setQuantity(value);
                  }
                }}
                className="w-16 h-10 text-center border-y-0 rounded-none p-0 focus-visible:ring-0"
                readOnly={!product.is_price_by_weight}
                disabled={isCheckoutBlocked}
              />
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10"
                onClick={() => handleQuantityChange(product.is_price_by_weight ? 0.1 : 1)}
                disabled={isCheckoutBlocked}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </div>

          
          <DialogFooter className="pt-4">
            <Button 
              type="button" 
              className="w-full h-12 text-lg flex items-center justify-between px-6"
              onClick={handleConfirm}
              disabled={quantity <= 0 || isCheckoutBlocked}
            >
              <span className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Adicionar
              </span>
              <span className="font-bold">{formatPrice(subtotal)}</span>
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { ProductDetailsModalComponent as ProductDetailsModal };