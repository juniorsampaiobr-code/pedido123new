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

interface WeightProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  onAddToCart: (quantity: number, notes: string) => void;
  isCheckoutBlocked: boolean; // Nova prop
}

const WeightProductModalComponent = ({ isOpen, onClose, product, onAddToCart, isCheckoutBlocked }: WeightProductModalProps) => {
  // Inicializa com 0.0kg como padrão para produtos pesáveis
  const [quantity, setQuantity] = useState(0.0); 

  React.useEffect(() => {
    if (isOpen) {
      setQuantity(0.0);
    }
  }, [isOpen]);

  const handleQuantityChange = (amount: number) => {
    setQuantity(prev => {
      const newQty = Math.max(0.0, prev + amount); // Garante que o mínimo é 0.0
      // Arredonda para 1 casa decimal
      return parseFloat(newQty.toFixed(1));
    });
  };

  const handleConfirm = () => {
    if (quantity <= 0) return;
    // Passando string vazia para notes
    onAddToCart(quantity, ''); 
    onClose();
  };

  const subtotal = product.price * quantity;
  const formatPrice = (price: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            {product.name} (Por Peso)
          </DialogTitle>
          <DialogDescription>
            Informe a quantidade em quilogramas (kg). Preço: {formatPrice(product.price)}/kg.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between border-y py-3">
            <label className="text-lg font-semibold">Quantidade (kg)</label>
            
            <div className="flex items-center border rounded-md h-10">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10"
                onClick={() => handleQuantityChange(-0.1)}
                disabled={quantity <= 0.0 || isCheckoutBlocked} // Desabilita em 0.0
              >
                <Minus className="h-5 w-5" />
              </Button>
              <Input
                type="number"
                step="0.1"
                value={quantity.toFixed(1)}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  // Permite 0.0, mas garante que não seja negativo
                  if (value >= 0) { 
                    setQuantity(parseFloat(value.toFixed(1)));
                  }
                }}
                className="w-16 h-10 text-center border-y-0 rounded-none p-0 focus-visible:ring-0"
                disabled={isCheckoutBlocked}
              />
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10"
                onClick={() => handleQuantityChange(0.1)}
                disabled={isCheckoutBlocked}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
        
        <DialogFooter className="pt-4">
          <Button 
            type="button" 
            className="w-full h-12 text-lg flex items-center justify-between px-6"
            onClick={handleConfirm}
            disabled={quantity <= 0 || isCheckoutBlocked} // Requer quantidade > 0
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Adicionar ao Carrinho
            </span>
            <span className="font-bold">{formatPrice(subtotal)}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export { WeightProductModalComponent as WeightProductModal };