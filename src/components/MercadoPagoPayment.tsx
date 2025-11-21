import React, { useEffect } from 'react';
import { initMercadoPago, Wallet } from '@mercadopago/sdk-react';
import { useMercadoPagoPublicKey } from '@/hooks/use-mercado-pago-settings';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

interface MercadoPagoPaymentProps {
  preferenceId: string;
  initPoint: string;
  onClose: () => void;
}

export const MercadoPagoPayment = ({ preferenceId, initPoint, onClose }: MercadoPagoPaymentProps) => {
  const { data: publicKey, isLoading: isLoadingKey } = useMercadoPagoPublicKey();

  useEffect(() => {
    if (publicKey) {
      try {
        initMercadoPago(publicKey, { locale: 'pt-BR' });
      } catch (error) {
        console.error("Erro ao inicializar Mercado Pago:", error);
        toast.error("Erro ao carregar o SDK do Mercado Pago.");
        onClose();
      }
    }
  }, [publicKey, onClose]);

  if (isLoadingKey || !publicKey) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[425px]">
          <div className="flex flex-col items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p>Carregando configurações de pagamento...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Pagamento Online
          </DialogTitle>
          <DialogDescription>
            Você será redirecionado para o checkout seguro do Mercado Pago.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {/* O componente Wallet do Mercado Pago renderiza o botão de pagamento */}
          <Wallet 
            initialization={{ preferenceId: preferenceId }} 
            customization={{ texts: { valueProp: 'smart_option' } }}
          />
        </div>
        
        <Button variant="outline" onClick={onClose}>
          Cancelar Pagamento
        </Button>
      </DialogContent>
    </Dialog>
  );
};