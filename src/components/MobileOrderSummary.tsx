import { useCart } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ShoppingCart, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export const MobileOrderSummary = () => {
  const { items, subtotal, deliveryFee, total, totalItems } = useCart();
  const [isOpen, setIsOpen] = useState(false);

  if (totalItems === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="lg:hidden sticky top-0 z-40 bg-card border-b shadow-md">
      <CollapsibleTrigger asChild>
        <div className="flex justify-between items-center p-4 cursor-pointer">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <span className="font-semibold text-lg">
              Seu Pedido ({totalItems} {totalItems === 1 ? 'item' : 'itens'})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}
            </span>
            {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="p-4 pt-0">
        <Separator className="mb-4" />
        <div className="space-y-3">
          <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
            {items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{item.quantity}x {item.name}{item.notes && <span className="block text-xs italic">({item.notes})</span>}</span>
                <span className="font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <Separator />
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal:</span><span className="font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}</span></div>
            <div className="flex justify-between"><span>Taxa de Entrega:</span><span className="font-medium text-primary">{deliveryFee > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deliveryFee) : 'Grátis'}</span></div>
          </div>
          <Separator />
          <div className="flex justify-between text-lg font-bold"><span>Total:</span><span className="text-primary">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}</span></div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};