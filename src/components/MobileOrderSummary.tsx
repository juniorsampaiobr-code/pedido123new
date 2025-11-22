import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileOrderSummaryProps {
  totalAmount: number;
  totalItems: number;
  isCheckoutBlocked: boolean; // Nova prop
  restaurantId?: string; // NOVO: ID do restaurante atual
}

const MobileOrderSummaryComponent = ({ totalAmount, totalItems, isCheckoutBlocked, restaurantId }: MobileOrderSummaryProps) => {
  if (totalItems === 0) return null;

  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 bg-card border-t shadow-2xl p-4 z-50",
      "lg:hidden" // Visível apenas em mobile
    )}>
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-medium text-muted-foreground">Total do Pedido ({totalItems} itens):</span>
        <span className="text-xl font-bold text-foreground">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}
        </span>
      </div>
      {/* ATUALIZADO: Passando restaurantId como query param */}
      <Link to={`/pre-checkout?restaurantId=${restaurantId}`}>
        <Button className="w-full h-12 text-lg" disabled={isCheckoutBlocked || !restaurantId}>
          Finalizar Pedido <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </Link>
    </div>
  );
};

export { MobileOrderSummaryComponent as MobileOrderSummary };