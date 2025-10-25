import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';

const OrderSuccess = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const displayId = orderId ? orderId.slice(-4) : 'N/A';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center shadow-xl">
        <CardHeader className="space-y-4">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          <CardTitle className="text-3xl font-bold">Pedido Recebido!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-lg text-muted-foreground">
            Seu pedido <span className="font-bold text-primary">#{displayId}</span> foi enviado com sucesso.
          </p>
          <p className="text-sm">
            Aguarde a confirmação do restaurante. Você será notificado sobre o status.
          </p>
          <Link to="/menu">
            <Button className="w-full">
              Fazer Novo Pedido
            </Button>
          </Link>
          <Link to="/">
            <Button variant="link" className="w-full">
              Voltar para a Home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderSuccess;