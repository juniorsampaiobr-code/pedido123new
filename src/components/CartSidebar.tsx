import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShoppingCart, ArrowRight, X } from 'lucide-react';
import { useCart } from '@/hooks/use-cart';
import { CartItem } from './CartItem';
import { MobileOrderSummary } from './MobileOrderSummary';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'; // Importando Card

interface CartSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCheckoutBlocked?: boolean; // Nova prop
  restaurantId?: string; // NOVO: ID do restaurante atual
}

// Componente principal do carrinho
const CartSidebarComponent = ({ isOpen = true, onClose, isCheckoutBlocked = false, restaurantId }: CartSidebarProps) => {
  const { items, totalAmount, totalItems } = useCart();

  const CartContent = (
    <div className="flex flex-col h-full">
      {/* Header: Usamos elementos simples para o título para evitar dependência de contexto Dialog/Sheet */}
      <div className="p-4 border-b">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShoppingCart className="h-5 w-5 text-primary" />
          Seu Pedido ({totalItems})
        </h2>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-grow p-8 text-center">
          <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-semibold">Seu carrinho está vazio</p>
          <p className="text-sm text-muted-foreground">Adicione alguns itens deliciosos!</p>
        </div>
      ) : (
        <>
          <ScrollArea className="flex-grow p-4">
            <div className="space-y-4">
              {items.map((item) => (
                <CartItem key={item.product.id} item={item} />
              ))}
            </div>
          </ScrollArea>

          <div className="p-4 border-t space-y-3">
            <div className="flex justify-between font-semibold text-lg">
              <span>Total:</span>
              <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}</span>
            </div>
            {/* ATUALIZADO: Passando restaurantId como query param */}
            <Link to={`/pre-checkout?restaurantId=${restaurantId}`} onClick={onClose}>
              <Button className="w-full h-12 text-lg" disabled={isCheckoutBlocked || !restaurantId}>
                Finalizar Pedido <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );

  // Se for usado como sidebar de desktop (isOpen=true por padrão e sem onClose)
  if (isOpen === true && !onClose) {
    return (
      <Card className="shadow-lg h-[calc(100vh-5rem)] flex flex-col">
        {CartContent}
      </Card>
    );
  }

  // Se for usado como Sheet de mobile
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-sm p-0">
        {CartContent}
        {/* Adiciona o resumo flutuante para mobile dentro do Sheet, mas apenas se estiver aberto */}
        {isOpen && totalItems > 0 && (
          <MobileOrderSummary totalAmount={totalAmount} totalItems={totalItems} isCheckoutBlocked={isCheckoutBlocked} restaurantId={restaurantId} />
        )}
      </SheetContent>
    </Sheet>
  );
};

// Exportação nomeada para resolver o erro
export { CartSidebarComponent as CartSidebar };