import { useCart, CartItem as CartItemType } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';
import { LazyImage } from '@/components/LazyImage';
import { Minus, Plus, Trash2 } from 'lucide-react';

interface CartItemProps {
  item: CartItemType;
}

export const CartItem = ({ item }: CartItemProps) => {
  const { updateQuantity, removeItem } = useCart();

  return (
    <div className="flex items-center gap-4 py-3">
      <LazyImage 
        src={item.image_url || '/placeholder.svg'} 
        alt={item.name} 
        className="w-16 h-16 rounded-md object-cover" 
      />
      <div className="flex-grow">
        <p className="font-semibold leading-tight">{item.name}</p>
        <p className="text-sm text-primary font-medium">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {!item.is_price_by_weight && (
          <>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-7 w-7"
              onClick={() => updateQuantity(item.id, item.quantity - 1)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-6 text-center font-bold">{item.quantity}</span>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-7 w-7"
              onClick={() => updateQuantity(item.id, item.quantity + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </>
        )}
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => removeItem(item.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};