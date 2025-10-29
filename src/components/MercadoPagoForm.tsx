import { useEffect, useState, useRef } from 'react';
import { useMercadoPagoPublicKey } from '@/hooks/use-mercado-pago-settings';
import { CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
  const mercadoPagoInstance = useRef<any>(null);
  const formInitialized = useRef(false);

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
    };
  }, [publicKey, onPaymentError]);

  // Inicializa o Mercado Pago e o CardPayment após o script carregar
  useEffect(() => {
    if (isScriptLoading || scriptError || !publicKey || !window.MercadoPago || !containerRef.current) return;

    // Verifica se já foi inicializado
    if (formInitialized.current) {
      return;
    }

    try {
      console.log('Inicializando Mercado Pago com a chave:', publicKey.substring(0, 10) + '...');
      
      // Inicializa o Mercado Pago apenas uma vez
      if (!mercadoPagoInstance.current) {
        mercadoPagoInstance.current = new window.MercadoPago(publicKey, {
          locale: 'pt-BR'
        });
      }

      // Cria o HTML do formulário
      if (containerRef.current) {
        containerRef.current.innerHTML = `
          <form id="form-checkout">
            <div class="space-y-4">
              <div>
                <label for="form-checkout__cardholderName" class="block text-sm font-medium mb-1">Titular do cartão</label>
                <input type="text" id="form-checkout__cardholderName" class="w-full p-2 border rounded" />
              </div>
              
              <div>
                <label for="form-checkout__cardholderEmail" class="block text-sm font-medium mb-1">E-mail</label>
                <input type="email" id="form-checkout__cardholderEmail" class="w-full p-2 border rounded" />
              </div>
              
              <div>
                <label for="form-checkout__cardNumber" class="block text-sm font-medium mb-1">Número do cartão</label>
                <input type="text" id="form-checkout__cardNumber" class="w-full p-2 border rounded" />
              </div>
              
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label for="form-checkout__cardExpirationMonth" class="block text-sm font-medium mb-1">Mês de vencimento</label>
                  <input type="text" id="form-checkout__cardExpirationMonth" class="w-full p-2 border rounded" placeholder="MM" />
                </div>
                <div>
                  <label for="form-checkout__cardExpirationYear" class="block text-sm font-medium mb-1">Ano de vencimento</label>
                  <input type="text" id="form-checkout__cardExpirationYear" class="w-full p-2 border rounded" placeholder="YY" />
                </div>
              </div>
              
              <div>
                <label for="form-checkout__securityCode" class="block text-sm font-medium mb-1">Código de segurança</label>
                <input type="text" id="form-checkout__securityCode" class="w-full p-2 border rounded" />
              </div>
              
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label for="form-checkout__identificationType" class="block text-sm font-medium mb-1">Tipo de documento</label>
                  <select id="form-checkout__identificationType" class="w-full p-2 border rounded"></select>
                </div>
                <div>
                  <label for="form-checkout__identificationNumber" class="block text-sm font-medium mb-1">Número do documento</label>
                  <input type="text" id="form-checkout__identificationNumber" class="w-full p-2 border rounded" />
                </div>
              </div>
              
              <div>
                <label for="form-checkout__issuer" class="block text-sm font-medium mb-1">Banco emissor</label>
                <select id="form-checkout__issuer" class="w-full p-2 border rounded"></select>
              </div>
              
              <div>
                <label for="form-checkout__installments" class="block text-sm font-medium mb-1">Parcelas</label>
                <select id="form-checkout__installments" class="w-full p-2 border rounded"></select>
              </div>
              
              <button type="submit" class="w-full bg-primary text-white py-2 rounded-md mt-4">Pagar</button>
            </div>
          </form>
        `;
      }

      // Aguarda um momento para garantir que o DOM foi atualizado
      const timer = setTimeout(() => {
        // Verifica se o elemento do formulário existe
        const formElement = document.getElementById('form-checkout');
        if (!formElement) {
          console.error('Formulário não encontrado no DOM');
          toast.error("Erro ao carregar o formulário de pagamento.");
          onPaymentError(new Error("Formulário não encontrado no DOM."));
          return;
        }

        // Cria o CardPayment
        try {
          if (mercadoPagoInstance.current && !cardPaymentRef.current) {
            cardPaymentRef.current = mercadoPagoInstance.current.cardForm({
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
                    formInitialized.current = true;
                  }
                },
                onSubmit: (event: any) => {
                  event.preventDefault();
                  console.log('Enviando formulário de pagamento...');

                  try {
                    if (cardPaymentRef.current) {
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
                    }
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
          }
        } catch (initError: any) {
          console.error("Erro ao inicializar CardPayment:", initError);
          toast.error("Erro ao carregar o sistema de pagamento.");
          onPaymentError(initError);
        }
      }, 100);

      return () => {
        clearTimeout(timer);
      };

    } catch (e: any) {
      console.error("Erro ao inicializar Mercado Pago:", e);
      setScriptError(true);
      toast.error("Erro ao carregar o sistema de pagamento.");
      onPaymentError(e);
    }

    // Cleanup do CardPayment
    return () => {
      if (cardPaymentRef.current && cardPaymentRef.current.unmount) {
        try {
          cardPaymentRef.current.unmount();
        } catch (e) {
          console.warn("Erro ao desmontar CardPayment:", e);
        }
        cardPaymentRef.current = null;
      }
      formInitialized.current = false;
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

  if (isScriptLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Carregando formulário de pagamento...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="mp-form-container">
        {!isCardPaymentReady && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Preparando formulário de pagamento...
          </div>
        )}
      </div>
    </div>
  );
};