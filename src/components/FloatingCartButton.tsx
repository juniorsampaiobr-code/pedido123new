import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingCartButtonProps {
  totalItems: number;
  onClick: () => void;
  isCheckoutBlocked: boolean; // Nova prop
}

const FloatingCartButtonComponent = ({ totalItems, onClick, isCheckoutBlocked }: FloatingCartButtonProps) => {
  return (
    <Button
      onClick={onClick}
      className={cn(
        // Posição: Topo Direito (em vez de bottom-4 right-4)
        "fixed top-4 right-4 z-40 rounded-full h-14 w-14 shadow-xl transition-transform duration-300",
        totalItems > 0 ? "scale-100" : "scale-0 pointer-events-none"
      )}
      aria-label={`Ver carrinho com ${totalItems} itens`}
      disabled={isCheckoutBlocked} // Desabilita se o checkout estiver bloqueado
    >
      <ShoppingCart className="h-6 w-6" />
      {totalItems > 0 && (
        <span className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4 bg-destructive text-destructive-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
          {totalItems}
        </span>
      )}
    </Button>
  );
};

export { FloatingCartButtonComponent as FloatingCartButton };