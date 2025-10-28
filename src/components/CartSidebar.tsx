import { Link } from 'react-router-dom';
import { useCart } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CartItem } from './CartItem';
import { ShoppingCart } from 'lucide-react';

interface CartSidebarProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CartSidebar = ({ isOpen, onOpenChange }: CartSidebarProps) => {
  const { items, subtotal, total, clearCart } = useCart();

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-2xl">Seu Carrinho</SheetTitle>
        </SheetHeader>
        <Separator />
        
        {items.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center text-center">
            <ShoppingCart className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg font-semibold">Seu carrinho está vazio</p>
            <p className="text-sm text-muted-foreground">Adicione produtos do cardápio para começar.</p>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-grow -mx-6 px-6">
              <div className="divide-y">
                {items.map(item => (
                  <CartItem key={item.id} item={item} />
                ))}
              </div>
            </ScrollArea>
            
            <Separator className="my-4" />

            <SheetFooter className="space-y-4">
              <div className="w-full space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal:</span><span className="font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}</span></div>
                <div className="flex justify-between text-lg font-bold"><span>Total:</span><span className="text-primary">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}</span></div>
              </div>
              <div className="flex gap-2 w-full">
                <Button variant="outline" onClick={clearCart} className="flex-1">Limpar Carrinho</Button>
                <SheetClose asChild>
                  <Link to="/checkout" className="flex-1">
                    <Button className="w-full">Finalizar Pedido</Button>
                  </Link>
                </SheetClose>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};