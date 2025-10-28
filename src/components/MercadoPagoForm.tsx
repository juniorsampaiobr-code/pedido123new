import { useEffect, useState } from 'react';
import { useMercadoPagoPublicKey } from '@/hooks/use-mercado-pago-settings';
import { initMercadoPago, CardPaymentBrick } from '@mercadopago/sdk-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface MercadoPagoFormProps {
  totalAmount: number;
  onPaymentSuccess: (paymentData: any) => void;
  onPaymentError: (error: any) => void;
}

export const MercadoPagoForm = ({ totalAmount, onPaymentSuccess, onPaymentError }: MercadoPagoFormProps) => {
  const { data: publicKey, isLoading, isError } = useMercadoPagoPublicKey();
  const [isMpReady, setIsMpReady] = useState(false);

  useEffect(() => {
    if (publicKey) {
      try {
        initMercadoPago(publicKey, { locale: 'pt-BR' });
        setIsMpReady(true);
      } catch (e) {
        console.error("Erro ao inicializar Mercado Pago:", e);
        toast.error("Erro ao carregar o sistema de pagamento. Verifique as credenciais.");
        onPaymentError(new Error("Falha na inicialização do Mercado Pago."));
      }
    }
  }, [publicKey, onPaymentError]);

  if (isLoading) {
    return (
      <CardContent className="space-y-4">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <div className="flex gap-4"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-12 w-1/2" /></div>
      </CardContent>
    );
  }

  if (isError || !publicKey) {
    return (
      <Alert variant="destructive">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Erro de Pagamento Online</AlertTitle>
        <AlertDescription>
          As credenciais do Mercado Pago não estão configuradas corretamente. Por favor, avise o restaurante.
        </AlertDescription>
      </Alert>
    );
  }

  if (!isMpReady) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Carregando formulário de pagamento...
      </div>
    );
  }

  const initialization = {
    amount: totalAmount,
  };

  const customization = {
    visual: {
      hideFormTitle: true,
      style: {
        theme: 'default',
      },
    },
    paymentMethods: {
      creditCard: 'all',
      debitCard: 'all',
      maxInstallments: 1, // Limitar a 1 parcela para simplificar o fluxo inicial
    },
  };

  const onSubmit = async (cardFormData: any) => {
    // O CardPaymentBrick já lida com a tokenização e submissão para o Mercado Pago.
    // O resultado aqui é o objeto de pagamento completo.
    onPaymentSuccess(cardFormData);
  };

  const onError = (error: any) => {
    console.error("Erro no Brick de Pagamento:", error);
    onPaymentError(error);
  };

  return (
    <div className="mp-form-container">
      <CardPaymentBrick
        initialization={initialization}
        customization={customization}
        onSubmit={onSubmit}
        onError={onError}
      />
    </div>
  );
};