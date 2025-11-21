import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Clock } from 'lucide-react';

interface StoreClosedWarningProps {
  todayHours: string;
}

const StoreClosedWarningComponent = ({ todayHours }: StoreClosedWarningProps) => {
  return (
    <Alert variant="destructive" className="mb-6">
      <Clock className="h-4 w-4" />
      <AlertTitle>Loja Fechada</AlertTitle>
      <AlertDescription>
        A loja está fechada no momento. Nosso horário de funcionamento hoje é das {todayHours}.
        Você pode fazer o pedido, mas ele só será processado quando reabrirmos.
      </AlertDescription>
    </Alert>
  );
};

export { StoreClosedWarningComponent as StoreClosedWarning };