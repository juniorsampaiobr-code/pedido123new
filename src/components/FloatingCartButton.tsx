import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '@/hooks/use-cart';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface FloatingCartButtonProps {
  onClick: () => void;
}

export const FloatingCartButton = ({ onClick }: FloatingCartButtonProps) => {
  const { totalItems, subtotal } = useCart();

  if (totalItems === 0) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="fixed top-4 right-4 z-50">
          <Button size="lg" className="relative h-14 w-14 rounded-full shadow-lg" onClick={onClick}>
            <ShoppingCart className="h-6 w-6" />
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 px-2 py-1 text-xs rounded-full"
            >
              {totalItems}
            </Badge>
          </Button>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}
        </p>
        <p className="text-xs text-muted-foreground">Clique para ver seu carrinho</p>
      </TooltipContent>
    </Tooltip>
  );
};