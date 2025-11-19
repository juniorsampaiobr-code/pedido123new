import React from 'react';
import { Button } from '@/components/ui/button';
import { CreditCard } from 'lucide-react';

interface MercadoPagoPaymentProps {
  // Placeholder props
  onInitiatePayment: () => void;
  isPending: boolean;
}

export const MercadoPagoPayment = ({ onInitiatePayment, isPending }: MercadoPagoPaymentProps) => {
  return (
    <Button 
      type="button" 
      className="w-full h-12 text-lg" 
      onClick={onInitiatePayment}
      disabled={isPending}
    >
      <CreditCard className="mr-2 h-5 w-5" />
      {isPending ? 'Processando Pagamento...' : 'Pagar com Mercado Pago'}
    </Button>
  );
};