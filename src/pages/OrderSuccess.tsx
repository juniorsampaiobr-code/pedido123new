import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrderStatusTracker } from '@/components/OrderStatusTracker';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useCart } from '@/hooks/use-cart';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const OrderSuccess = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { clearCart } = useCart();

  const paymentStatus = searchParams.get('status');

  const confirmPaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke('confirm-payment', {
        body: { orderId: id },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Pagamento confirmado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ['orderStatus', orderId] });
    },
    onError: (err) => {
      toast.error(`Falha na confirmação do pagamento: ${err.message}`);
    },
  });

  useEffect(() => {
    if (orderId) {
      clearCart();
      if (paymentStatus === 'approved') {
        confirmPaymentMutation.mutate(orderId);
      }
    }
  }, [orderId, paymentStatus, clearCart]);

  if (!orderId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center shadow-xl">
          <CardHeader><CardTitle className="text-2xl font-bold text-destructive">Erro</CardTitle></CardHeader>
          <CardContent>
            <p className="text-muted-foreground">ID do pedido não encontrado.</p>
            <Link to="/menu"><Button className="mt-4">Voltar ao Cardápio</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md mb-6">
        <Link to="/menu"><Button variant="ghost" className="mb-4"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao Cardápio</Button></Link>
      </div>
      
      {confirmPaymentMutation.isPending && (
        <Card className="w-full max-w-md text-center shadow-xl mb-6">
          <CardContent className="p-6 flex items-center justify-center">
            <Loader2 className="h-5 w-5 mr-3 animate-spin" />
            <p className="font-semibold">Confirmando pagamento, por favor aguarde...</p>
          </CardContent>
        </Card>
      )}

      <OrderStatusTracker orderId={orderId} />

      <div className="w-full max-w-md mt-6">
        <Card className="shadow-xl">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground mb-4">Você pode acompanhar o status do seu pedido nesta página.</p>
            <Link to="/menu"><Button className="w-full">Fazer Novo Pedido</Button></Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OrderSuccess;