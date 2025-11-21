import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus, Minus } from 'lucide-react';
import { useCart } from '@/hooks/use-cart';
import { Tables } from '@/integrations/supabase/types';

type Product = Tables<'products'>;

interface CartItemProps {
  item: {
    product: Product;
    quantity: number;
    notes: string;
    subtotal: number;
  };
}

const CartItemComponent = ({ item }: CartItemProps) => {
  const { removeItem, updateItemQuantity } = useCart();
  const { product, quantity, subtotal, notes } = item;

  const handleQuantityChange = (newQuantity: number) => {
    updateItemQuantity(product.id, newQuantity);
  };

  const formatPrice = (price: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  return (
    <div className="flex items-start gap-3 border-b pb-3">
      <img
        src={product.image_url || '/placeholder.svg'}
        alt={product.name}
        className="w-16 h-16 object-cover rounded-md flex-shrink-0"
      />
      <div className="flex-grow space-y-1">
        <div className="flex justify-between items-start">
          <h4 className="font-medium text-sm pr-2">{product.name}</h4>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 flex-shrink-0"
            onClick={() => removeItem(product.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        
        <p className="text-xs text-muted-foreground">
          {product.is_price_by_weight ? `${quantity} kg` : `${quantity} x ${formatPrice(product.price)}`}
        </p>
        
        {notes && (
          <p className="text-xs text-muted-foreground italic max-w-full truncate">Obs: {notes}</p>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center border rounded-md h-8">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => handleQuantityChange(quantity - 1)}
              disabled={quantity <= (product.is_price_by_weight ? 0.1 : 1)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type={product.is_price_by_weight ? "number" : "text"}
              step={product.is_price_by_weight ? "0.1" : "1"}
              value={product.is_price_by_weight ? quantity.toFixed(1) : quantity}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                if (value > 0) {
                  handleQuantityChange(value);
                }
              }}
              className="w-12 h-8 text-center border-y-0 rounded-none p-0 focus-visible:ring-0"
              readOnly={!product.is_price_by_weight}
            />
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => handleQuantityChange(quantity + (product.is_price_by_weight ? 0.1 : 1))}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <span className="font-bold text-base">{formatPrice(subtotal)}</span>
        </div>
      </div>
    </div>
  );
};

export { CartItemComponent as CartItem };