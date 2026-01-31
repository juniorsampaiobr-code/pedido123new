import React, { useEffect } from 'react';
import { initMercadoPago } from '@mercadopago/sdk-react';
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
        // Inicializa o SDK (necessário para o script, mesmo que não usemos o Brick)
        initMercadoPago(publicKey, { locale: 'pt-BR' });
      } catch (error) {
        console.error("Erro ao inicializar Mercado Pago:", error);
        toast.error("Erro ao carregar o SDK do Mercado Pago.");
        onClose();
        return;
      }
    }
    
    // Se o initPoint estiver disponível, redireciona imediatamente
    if (initPoint) {
        console.log("Redirecionando para o Mercado Pago:", initPoint);
        // Redireciona o usuário
        window.location.href = initPoint;
    }
    
  }, [publicKey, onClose, initPoint]);

  // O componente é montado APENAS se isMercadoPagoOpen for true no Checkout.tsx.
  // Portanto, o Dialog deve estar aberto enquanto estiver montado.
  
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
  
  // Se chegarmos aqui, significa que a chave pública foi carregada, e estamos esperando o redirecionamento
  // (que deve ter sido iniciado no useEffect se initPoint estiver presente)
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Redirecionando para Pagamento
          </DialogTitle>
          <DialogDescription>
            Você está sendo redirecionado para o checkout seguro do Mercado Pago.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Aguarde...</p>
        </div>
        
        <Button variant="outline" onClick={onClose}>
          Cancelar e Voltar
        </Button>
      </DialogContent>
    </Dialog>
  );
};