import { useEffect, useState, useRef } from 'react';
import { useMercadoPagoPublicKey } from '@/hooks/use-mercado-pago-settings';
import { CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Definindo os tipos para o SDK do Mercado Pago
declare global {
  interface Window {
    MercadoPago: any;
  }
}

interface MercadoPagoFormProps {
  totalAmount: number;
  onPaymentSuccess: (paymentData: any) => void;
  onPaymentError: (error: any) => void;
}

export const MercadoPagoForm = ({ totalAmount, onPaymentSuccess, onPaymentError }: MercadoPagoFormProps) => {
  const { data: publicKey, isLoading: isKeyLoading, isError } = useMercadoPagoPublicKey();
  const [isScriptLoading, setIsScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const [isCardPaymentReady, setIsCardPaymentReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardPaymentRef = useRef<any>(null);

  // Carrega o script do Mercado Pago dinamicamente
  useEffect(() => {
    if (!publicKey) return;

    const scriptId = 'mp-sdk-script';
    
    // Verifica se o script já foi adicionado
    if (document.getElementById(scriptId)) {
      setIsScriptLoading(false);
      return;
    }

    setIsScriptLoading(true);
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () => {
      setIsScriptLoading(false);
      setScriptError(false);
      console.log('Script do Mercado Pago carregado com sucesso');
    };
    script.onerror = () => {
      setIsScriptLoading(false);
      setScriptError(true);
      toast.error("Falha ao carregar o script de pagamento.");
      onPaymentError(new Error("Falha ao carregar o script do Mercado Pago."));
    };

    document.body.appendChild(script);

    return () => {
      if (document.getElementById(scriptId)) {
        document.body.removeChild(script);
      }
      // Limpa o container ao desmontar
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [publicKey, onPaymentError]);

  // Inicializa o Mercado Pago e o CardPayment após o script carregar
  useEffect(() => {
    if (isScriptLoading || scriptError || !publicKey || !containerRef.current) return;

    try {
      // Verifica se o objeto MercadoPago está disponível
      if (!window.MercadoPago) {
        throw new Error('SDK do Mercado Pago não carregado.');
      }

      console.log('Inicializando Mercado Pago com a chave:', publicKey.substring(0, 10) + '...');

      // Inicializa o Mercado Pago
      const mp = new window.MercadoPago(publicKey, {
        locale: 'pt-BR'
      });

      // Limpa o container antes de montar
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      
      // Cria o CardPayment
      cardPaymentRef.current = mp.cardForm({
        amount: totalAmount.toString(),
        autoMount: true,
        form: {
          id: "form-checkout",
          cardholderName: {
            id: "form-checkout__cardholderName",
            placeholder: "Titular do cartão",
          },
          cardholderEmail: {
            id: "form-checkout__cardholderEmail",
            placeholder: "E-mail",
          },
          cardNumber: {
            id: "form-checkout__cardNumber",
            placeholder: "Número do cartão",
          },
          cardExpirationMonth: {
            id: "form-checkout__cardExpirationMonth",
            placeholder: "MM",
          },
          cardExpirationYear: {
            id: "form-checkout__cardExpirationYear",
            placeholder: "YY",
          },
          securityCode: {
            id: "form-checkout__securityCode",
            placeholder: "Código de segurança",
          },
          installments: {
            id: "form-checkout__installments",
            placeholder: "Parcelas",
          },
          identificationType: {
            id: "form-checkout__identificationType",
            placeholder: "Tipo de documento",
          },
          identificationNumber: {
            id: "form-checkout__identificationNumber",
            placeholder: "Número do documento",
          },
          issuer: {
            id: "form-checkout__issuer",
            placeholder: "Banco emissor",
          },
        },
        callbacks: {
          onFormMounted: (error: any) => {
            if (error) {
              console.error('Erro ao montar o formulário:', error);
              toast.error("Erro ao carregar o formulário de pagamento.");
              onPaymentError(error);
            } else {
              console.log('Formulário do Mercado Pago montado com sucesso');
              setIsCardPaymentReady(true);
            }
          },
          onSubmit: (event: any) => {
            event.preventDefault();
            console.log('Enviando formulário de pagamento...');

            try {
              const formData = cardPaymentRef.current.getCardFormData();
              console.log('Dados do formulário:', formData);

              const {
                paymentMethodId: payment_method_id,
                issuerId: issuer_id,
                cardholderEmail: email,
                amount,
                token,
                installments,
                identificationNumber,
                identificationType,
              } = formData;

              // Chama o callback de sucesso com os dados do formulário
              onPaymentSuccess({
                token,
                issuer_id,
                payment_method_id,
                transaction_amount: Number(amount),
                installments: Number(installments),
                payer: {
                  email,
                  identification: {
                    type: identificationType,
                    number: identificationNumber,
                  },
                },
              });
            } catch (error) {
              console.error('Erro ao processar dados do formulário:', error);
              onPaymentError(error);
            }
          },
          onFetching: (resource: any) => {
            console.log('Fetching resource: ', resource);
          }
        },
      });

    } catch (e: any) {
      console.error("Erro ao inicializar Mercado Pago:", e);
      setScriptError(true);
      toast.error("Erro ao carregar o sistema de pagamento.");
      onPaymentError(e);
    }

    // Cleanup do CardPayment
    return () => {
      if (cardPaymentRef.current && cardPaymentRef.current.unmount) {
        cardPaymentRef.current.unmount();
      }
    };
  }, [isScriptLoading, scriptError, publicKey, totalAmount, onPaymentSuccess, onPaymentError]);

  if (isKeyLoading) {
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

  if (scriptError) {
    return (
      <Alert variant="destructive">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Falha no Carregamento</AlertTitle>
        <AlertDescription>
          Não foi possível carregar o sistema de pagamento online. Por favor, tente novamente mais tarde.
        </AlertDescription>
      </Alert>
    );
  }

  if (isScriptLoading || !isCardPaymentReady) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Carregando formulário de pagamento...
      </div>
    );
  }

  return (
    <div className="mp-form-container">
      <form id="form-checkout">
        <div className="space-y-4">
          <div>
            <label htmlFor="form-checkout__cardholderName" className="block text-sm font-medium mb-1">Titular do cartão</label>
            <input type="text" id="form-checkout__cardholderName" className="w-full p-2 border rounded" />
          </div>
          
          <div>
            <label htmlFor="form-checkout__cardholderEmail" className="block text-sm font-medium mb-1">E-mail</label>
            <input type="email" id="form-checkout__cardholderEmail" className="w-full p-2 border rounded" />
          </div>
          
          <div>
            <label htmlFor="form-checkout__cardNumber" className="block text-sm font-medium mb-1">Número do cartão</label>
            <input type="text" id="form-checkout__cardNumber" className="w-full p-2 border rounded" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="form-checkout__cardExpirationMonth" className="block text-sm font-medium mb-1">Mês de vencimento</label>
              <input type="text" id="form-checkout__cardExpirationMonth" className="w-full p-2 border rounded" placeholder="MM" />
            </div>
            <div>
              <label htmlFor="form-checkout__cardExpirationYear" className="block text-sm font-medium mb-1">Ano de vencimento</label>
              <input type="text" id="form-checkout__cardExpirationYear" className="w-full p-2 border rounded" placeholder="YY" />
            </div>
          </div>
          
          <div>
            <label htmlFor="form-checkout__securityCode" className="block text-sm font-medium mb-1">Código de segurança</label>
            <input type="text" id="form-checkout__securityCode" className="w-full p-2 border rounded" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="form-checkout__identificationType" className="block text-sm font-medium mb-1">Tipo de documento</label>
              <select id="form-checkout__identificationType" className="w-full p-2 border rounded"></select>
            </div>
            <div>
              <label htmlFor="form-checkout__identificationNumber" className="block text-sm font-medium mb-1">Número do documento</label>
              <input type="text" id="form-checkout__identificationNumber" className="w-full p-2 border rounded" />
            </div>
          </div>
          
          <div>
            <label htmlFor="form-checkout__issuer" className="block text-sm font-medium mb-1">Banco emissor</label>
            <select id="form-checkout__issuer" className="w-full p-2 border rounded"></select>
          </div>
          
          <div>
            <label htmlFor="form-checkout__installments" className="block text-sm font-medium mb-1">Parcelas</label>
            <select id="form-checkout__installments" className="w-full p-2 border rounded"></select>
          </div>
        </div>
      </form>
    </div>
  );
};